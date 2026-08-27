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
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 })
    }

    const { data: isAdmin, error: adminError } = await ctx.supabase.rpc('is_admin')
    if (adminError) {
      console.error('Admin check failed', adminError)
      return Response.json({ error: 'Unable to verify authorization' }, { status: 500 })
    }
    if (!isAdmin) {
      return Response.json({ error: 'Admin role required' }, { status: 403 })
    }

    let payload: NotificationRequest
    try {
      payload = validatePayload(await req.json())
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : 'Invalid request body' },
        { status: 400 },
      )
    }

    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      console.error('Missing VAPID secrets')
      return Response.json({ error: 'Push service is not configured' }, { status: 503 })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

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

    return Response.json({ sent, failed, removed_stale: staleIds.length })
  }),
}
