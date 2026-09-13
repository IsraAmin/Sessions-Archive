// @deno-types="npm:@types/web-push@3.6.4"
import webpush from 'web-push'
import { withSupabase } from '@supabase/server'

type PreferenceRow = {
  user_id: string
  push_enabled: boolean
  session_reminders: boolean
  session_updates: boolean
  new_content: boolean
  announcements: boolean
  reminder_minutes: number
  language: 'ar' | 'en'
}

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title_ar: string
  title_en: string
  body_ar: string
  body_en: string
  href: string | null
  created_at: string
}

type DeliveryRow = {
  notification_id: string
  status: 'pending' | 'sent' | 'skipped' | 'failed'
  attempts: number
}

type SubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

type VapidRow = { public_key: string; private_key: string; subject: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function statusCodeFrom(error: unknown): number | null {
  if (!isRecord(error)) return null
  return typeof error.statusCode === 'number' ? error.statusCode : null
}

function errorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 500)
  return 'Push delivery failed'
}

function defaults(userId: string): PreferenceRow {
  return {
    user_id: userId,
    push_enabled: true,
    session_reminders: false,
    session_updates: true,
    new_content: true,
    announcements: true,
    reminder_minutes: 30,
    language: 'ar',
  }
}

function shouldPush(type: string, preference: PreferenceRow) {
  if (!preference.push_enabled) return false
  if (type === 'session_reminder') return false
  if (['recording_added', 'resource_added', 'session_changed', 'certificate_ready'].includes(type)) return preference.session_updates
  if (['session_added', 'series_added'].includes(type)) return preference.new_content
  if (type === 'system') return preference.announcements
  return true
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

    const suppliedSecret = req.headers.get('x-push-dispatch-secret') ?? ''
    const { data: config, error: configError } = await ctx.supabaseAdmin
      .from('push_dispatch_config')
      .select('dispatch_secret, enabled')
      .eq('id', 'default')
      .maybeSingle()

    if (configError || !config || config.enabled !== true || suppliedSecret !== config.dispatch_secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    const nowIso = now.toISOString()
    const remindersCreated = 0

    try {
      const { data: deliveryData, error: deliveryError } = await ctx.supabaseAdmin
        .from('notification_push_deliveries')
        .select('notification_id, status, attempts')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200)
      if (deliveryError) throw deliveryError

      const pendingDeliveries = (deliveryData ?? []) as DeliveryRow[]
      if (!pendingDeliveries.length) return Response.json({ remindersCreated, processed: 0, sent: 0, skipped: 0, failed: 0, staleRemoved: 0 })

      const notificationIds = pendingDeliveries.map((row) => row.notification_id)
      const { data: notificationData, error: notificationError } = await ctx.supabaseAdmin
        .from('notifications')
        .select('id, user_id, type, title_ar, title_en, body_ar, body_en, href, created_at')
        .in('id', notificationIds)
      if (notificationError) throw notificationError

      const notificationsById = new Map(((notificationData ?? []) as NotificationRow[]).map((row) => [row.id, row]))
      const pending = pendingDeliveries.flatMap((delivery) => {
        const notification = notificationsById.get(delivery.notification_id)
        return notification ? [{ notification, delivery }] : []
      })
      if (!pending.length) return Response.json({ remindersCreated, processed: 0, sent: 0, skipped: 0, failed: 0, staleRemoved: 0 })

      const userIds = [...new Set(pending.map(({ notification }) => notification.user_id))]
      const [{ data: preferenceData, error: preferenceError }, { data: subscriptionData, error: subscriptionError }] = await Promise.all([
        ctx.supabaseAdmin
          .from('notification_preferences')
          .select('user_id, push_enabled, session_reminders, session_updates, new_content, announcements, reminder_minutes, language')
          .in('user_id', userIds),
        ctx.supabaseAdmin
          .from('push_subscriptions')
          .select('id, user_id, endpoint, p256dh, auth')
          .in('user_id', userIds),
      ])
      if (preferenceError) throw preferenceError
      if (subscriptionError) throw subscriptionError

      const preferences = new Map(((preferenceData ?? []) as PreferenceRow[]).map((row) => [row.user_id, row]))
      const subscriptionsByUser = new Map<string, SubscriptionRow[]>()
      for (const subscription of (subscriptionData ?? []) as SubscriptionRow[]) {
        const current = subscriptionsByUser.get(subscription.user_id) ?? []
        current.push(subscription)
        subscriptionsByUser.set(subscription.user_id, current)
      }

      let vapid: VapidRow | null = null
      if (pending.some(({ notification }) => shouldPush(notification.type, preferences.get(notification.user_id) ?? defaults(notification.user_id)) && (subscriptionsByUser.get(notification.user_id)?.length ?? 0) > 0)) {
        const { data: vapidData, error: vapidError } = await ctx.supabaseAdmin
          .from('push_vapid_config')
          .select('public_key, private_key, subject')
          .eq('id', 'default')
          .single()
        if (vapidError) throw vapidError
        vapid = vapidData as VapidRow
        webpush.setVapidDetails(vapid.subject, vapid.public_key, vapid.private_key)
      }

      const staleIds = new Set<string>()
      let sent = 0
      let skipped = 0
      let failed = 0

      for (const { notification, delivery } of pending) {
        const preference = preferences.get(notification.user_id) ?? defaults(notification.user_id)
        const previousAttempts = delivery.attempts
        const attempts = previousAttempts + 1

        if (!shouldPush(notification.type, preference)) {
          const { error } = await ctx.supabaseAdmin.from('notification_push_deliveries').update({
            status: 'skipped',
            last_attempt_at: nowIso,
            delivered_at: nowIso,
            last_error: notification.type === 'session_reminder' ? 'session_reminders_retired' : 'disabled_by_user_preference',
          }).eq('notification_id', notification.id)
          if (error) throw error
          skipped += 1
          continue
        }

        const subscriptions = subscriptionsByUser.get(notification.user_id) ?? []
        if (!subscriptions.length || !vapid) {
          const { error } = await ctx.supabaseAdmin.from('notification_push_deliveries').update({
            status: 'skipped',
            last_attempt_at: nowIso,
            delivered_at: nowIso,
            last_error: 'no_active_push_subscription',
          }).eq('notification_id', notification.id)
          if (error) throw error
          skipped += 1
          continue
        }

        const title = preference.language === 'en' ? notification.title_en : notification.title_ar
        const body = preference.language === 'en' ? notification.body_en : notification.body_ar
        const payload = JSON.stringify({ title, body, url: notification.href ?? '/' })
        let successes = 0
        let lastError = ''

        await Promise.all(subscriptions.map(async (subscription) => {
          try {
            await webpush.sendNotification({
              endpoint: subscription.endpoint,
              keys: { p256dh: subscription.p256dh, auth: subscription.auth },
            }, payload, { TTL: 24 * 60 * 60 })
            successes += 1
          } catch (error) {
            const statusCode = statusCodeFrom(error)
            if (statusCode === 404 || statusCode === 410) staleIds.add(subscription.id)
            lastError = `${statusCode ?? 'unknown'}: ${errorText(error)}`.slice(0, 500)
            console.error('Push delivery failed', { notificationId: notification.id, subscriptionId: subscription.id, statusCode })
          }
        }))

        const terminalFailure = successes === 0 && attempts >= 5
        const status = successes > 0 ? 'sent' : terminalFailure ? 'failed' : 'pending'
        const { error } = await ctx.supabaseAdmin.from('notification_push_deliveries').update({
          status,
          attempts,
          last_attempt_at: nowIso,
          delivered_at: successes > 0 ? nowIso : null,
          last_error: successes > 0 ? null : (lastError || 'Push delivery failed'),
        }).eq('notification_id', notification.id)
        if (error) throw error

        if (successes > 0) sent += 1
        else if (terminalFailure) failed += 1
      }

      if (staleIds.size) {
        const { error: cleanupError } = await ctx.supabaseAdmin
          .from('push_subscriptions')
          .delete()
          .in('id', [...staleIds])
        if (cleanupError) console.error('Could not delete stale subscriptions', cleanupError)
      }

      return Response.json({ remindersCreated, processed: pending.length, sent, skipped, failed, staleRemoved: staleIds.size })
    } catch (error) {
      console.error('Automatic push dispatch failed', error)
      return Response.json({ error: errorText(error) }, { status: 500 })
    }
  }),
}
