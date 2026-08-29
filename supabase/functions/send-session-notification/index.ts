// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'web-push'
import { withSupabase } from '@supabase/server'

type NotificationRequest = { title: string; body: string; url?: string }
type VapidRow = { public_key: string; private_key: string; subject: string }
type DispatchConfig = { function_url: string; dispatch_secret: string; enabled: boolean }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function validatePayload(value: unknown): NotificationRequest {
  if (!isRecord(value)) throw new Error('Invalid notification payload')
  const title = typeof value.title === 'string' ? value.title.trim() : ''
  const body = typeof value.body === 'string' ? value.body.trim() : ''
  const url = typeof value.url === 'string' && value.url.trim() ? value.url.trim() : '/'
  if (!title || title.length > 120) throw new Error('Title must be 1-120 characters')
  if (!body || body.length > 500) throw new Error('Body must be 1-500 characters')
  if (!url.startsWith('/') || url.startsWith('//')) throw new Error('URL must be a relative app path')
  return { title, body, url }
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    async function getVapidConfig(): Promise<VapidRow> {
      const { data: existing, error: readError } = await ctx.supabaseAdmin.from('push_vapid_config').select('public_key, private_key, subject').eq('id', 'default').maybeSingle()
      if (readError) throw readError
      if (existing) return existing as VapidRow
      const generated = webpush.generateVAPIDKeys()
      const candidate = { id: 'default', public_key: generated.publicKey, private_key: generated.privateKey, subject: 'https://israamin.github.io/Sessions-Archive/' }
      const { data: inserted, error: insertError } = await ctx.supabaseAdmin.from('push_vapid_config').insert(candidate).select('public_key, private_key, subject').single()
      if (!insertError && inserted) return inserted as VapidRow
      const { data: retry, error: retryError } = await ctx.supabaseAdmin.from('push_vapid_config').select('public_key, private_key, subject').eq('id', 'default').single()
      if (retryError || !retry) throw insertError ?? retryError ?? new Error('Unable to initialize push keys')
      return retry as VapidRow
    }

    async function publicKeyResponse() {
      try {
        const config = await getVapidConfig()
        return Response.json({ publicKey: config.public_key }, { headers: { 'Cache-Control': 'private, max-age=3600' } })
      } catch (error) {
        console.error('Could not initialize Web Push configuration', error)
        return Response.json({ error: 'Push service unavailable' }, { status: 503 })
      }
    }

    if (req.method === 'GET') return publicKeyResponse()
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

    let requestBody: unknown
    try { requestBody = await req.json() } catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }
    if (isRecord(requestBody) && requestBody.action === 'get_public_key') return publicKeyResponse()

    const { data: callerData, error: callerError } = await ctx.supabase.auth.getUser()
    if (callerError || !callerData.user) return Response.json({ error: 'Authentication required' }, { status: 401 })
    const caller = callerData.user

    const { data: isAdmin, error: adminError } = await ctx.supabase.rpc('is_admin')
    if (adminError) return Response.json({ error: 'Unable to verify authorization' }, { status: 500 })
    if (!isAdmin) return Response.json({ error: 'Admin role required' }, { status: 403 })

    let payload: NotificationRequest
    try { payload = validatePayload(requestBody) }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Invalid request body' }, { status: 400 }) }

    const { data: profiles, error: profilesError } = await ctx.supabaseAdmin.from('profiles').select('id')
    if (profilesError) return Response.json({ error: 'Unable to load recipients' }, { status: 500 })

    const broadcastId = crypto.randomUUID()
    const recipients = profiles ?? []
    let queued = 0
    for (let offset = 0; offset < recipients.length; offset += 500) {
      const rows = recipients.slice(offset, offset + 500).map((profile) => ({
        user_id: profile.id,
        type: 'system',
        title_ar: payload.title,
        title_en: payload.title,
        body_ar: payload.body,
        body_en: payload.body,
        href: payload.url ?? '/',
        dedupe_key: `admin-broadcast:${broadcastId}`,
      }))
      if (!rows.length) continue
      const { error: insertError } = await ctx.supabaseAdmin.from('notifications').insert(rows)
      if (insertError) return Response.json({ error: 'Unable to queue notifications' }, { status: 500 })
      queued += rows.length
    }

    let dispatch: unknown = null
    const { data: dispatchConfig } = await ctx.supabaseAdmin.from('push_dispatch_config').select('function_url, dispatch_secret, enabled').eq('id', 'default').maybeSingle()
    if (dispatchConfig && (dispatchConfig as DispatchConfig).enabled) {
      try {
        const config = dispatchConfig as DispatchConfig
        const response = await fetch(config.function_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-push-dispatch-secret': config.dispatch_secret },
          body: JSON.stringify({ source: 'admin-broadcast' }),
        })
        dispatch = await response.json().catch(() => null)
      } catch (error) {
        console.error('Immediate push dispatch failed; cron will retry', error)
      }
    }

    const { error: activityError } = await ctx.supabaseAdmin.from('admin_activity_log').insert({
      actor_user_id: caller.id,
      action: 'notification_sent',
      entity_type: 'notification',
      entity_label: payload.title,
      details: { url: payload.url ?? '/', queued, dispatch },
    })
    if (activityError) console.error('Could not record admin notification activity', activityError)

    return Response.json({ queued, dispatch })
  }),
}
