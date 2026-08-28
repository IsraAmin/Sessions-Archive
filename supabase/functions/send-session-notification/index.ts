// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'web-push'
import { withSupabase } from '@supabase/server'

type NotificationRequest = {
  title: string
  body: string
  url?: string
}

type PushRow = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

type VapidRow = {
  public_key: string
  private_key: string
  subject: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function statusCodeFrom(error: unknown): number | null {
  if (!isRecord(error)) return null
  const value = error.statusCode
  return typeof value === 'number' ? value : null
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
      const { data: existing, error: readError } = await ctx.supabaseAdmin
        .from('push_vapid_config')
        .select('public_key, private_key, subject')
        .eq('id', 'default')
        .maybeSingle()

      if (readError) throw readError
      if (existing) return existing as VapidRow

      const generated = webpush.generateVAPIDKeys()
      const candidate = {
        id: 'default',
        public_key: generated.publicKey,
        private_key: generated.privateKey,
        subject: 'https://israamin.github.io/Sessions-Archive/',
      }

      const { data: inserted, error: insertError } = await ctx.supabaseAdmin
        .from('push_vapid_config')
        .insert(candidate)
        .select('public_key, private_key, subject')
        .single()

      if (!insertError && inserted) return inserted as VapidRow

      const { data: retry, error: retryError } = await ctx.supabaseAdmin
        .from('push_vapid_config')
        .select('public_key, private_key, subject')
        .eq('id', 'default')
        .single()

      if (retryError || !retry) throw insertError ?? retryError ?? new Error('Unable to initialize push keys')
      return retry as VapidRow
    }

    async function publicKeyResponse() {
      try {
        const config = await getVapidConfig()
        return Response.json({ publicKey: config.public_key }, {
          headers: { 'Cache-Control': 'private, max-age=3600' },
        })
      } catch (error) {
        console.error('Could not initialize Web Push configuration', error)
        return Response.json({ error: 'Push service unavailable' }, { status: 503 })
      }
    }

    if (req.method === 'GET') return publicKeyResponse()
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

    let requestBody: unknown
    try {
      requestBody = await req.json()
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Any signed-in user may request the public VAPID key. The private key
    // remains server-only in push_vapid_config.
    if (isRecord(requestBody) && requestBody.action === 'get_public_key') {
      return publicKeyResponse()
    }

    const { data: isAdmin, error: adminError } = await ctx.supabase.rpc('is_admin')
    if (adminError) {
      console.error('Admin check failed', adminError)
      return Response.json({ error: 'Unable to verify authorization' }, { status: 500 })
    }
    if (!isAdmin) return Response.json({ error: 'Admin role required' }, { status: 403 })

    let payload: NotificationRequest
    try {
      payload = validatePayload(requestBody)
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Invalid request body' },
        { status: 400 },
      )
    }

    let vapid: VapidRow
    try {
      vapid = await getVapidConfig()
    } catch (error) {
      console.error('Could not load Web Push configuration', error)
      return Response.json({ error: 'Push service unavailable' }, { status: 503 })
    }

    webpush.setVapidDetails(vapid.subject, vapid.public_key, vapid.private_key)

    const { data, error: subscriptionsError } = await ctx.supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')

    if (subscriptionsError) {
      console.error('Could not load push subscriptions', subscriptionsError)
      return Response.json({ error: 'Unable to load subscriptions' }, { status: 500 })
    }

    const subscriptions = (data ?? []) as PushRow[]
    const staleIds: string[] = []
    let sent = 0
    let failed = 0
    const message = JSON.stringify(payload)

    await Promise.all(subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          message,
          { TTL: 60 * 60 },
        )
        sent += 1
      } catch (error) {
        failed += 1
        const statusCode = statusCodeFrom(error)
        if (statusCode === 404 || statusCode === 410) staleIds.push(subscription.id)
        console.error('Push delivery failed', { subscriptionId: subscription.id, statusCode })
      }
    }))

    if (staleIds.length) {
      const { error: cleanupError } = await ctx.supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('id', staleIds)
      if (cleanupError) console.error('Could not delete stale subscriptions', cleanupError)
    }

    return Response.json({
      sent,
      failed,
      removed_stale: staleIds.length,
      subscribers: subscriptions.length,
    })
  }),
}
