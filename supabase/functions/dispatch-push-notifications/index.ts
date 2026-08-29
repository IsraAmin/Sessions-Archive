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

type SessionRow = { id: string; title: string; starts_at: string }
type RegistrationRow = { user_id: string; session_id: string }
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
    session_reminders: true,
    session_updates: true,
    new_content: true,
    announcements: true,
    reminder_minutes: 30,
    language: 'ar',
  }
}

function shouldPush(type: string, preference: PreferenceRow) {
  if (!preference.push_enabled) return false
  if (type === 'session_reminder') return preference.session_reminders
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
    const horizonIso = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    let remindersCreated = 0

    try {
      const { data: upcomingData, error: upcomingError } = await ctx.supabaseAdmin
        .from('sessions')
        .select('id, title, starts_at')
        .eq('status', 'published')
        .gt('starts_at', nowIso)
        .lte('starts_at', horizonIso)

      if (upcomingError) throw upcomingError
      const upcoming = (upcomingData ?? []) as SessionRow[]

      if (upcoming.length) {
        const sessionIds = upcoming.map((session) => session.id)
        const { data: registrationData, error: registrationError } = await ctx.supabaseAdmin
          .from('registrations')
          .select('user_id, session_id')
          .in('session_id', sessionIds)
          .eq('attendance_status', 'registered')

        if (registrationError) throw registrationError
        const registrations = (registrationData ?? []) as RegistrationRow[]
        const userIds = [...new Set(registrations.map((row) => row.user_id))]
        let preferences = new Map<string, PreferenceRow>()

        if (userIds.length) {
          const { data: preferenceData, error: preferenceError } = await ctx.supabaseAdmin
            .from('notification_preferences')
            .select('user_id, push_enabled, session_reminders, session_updates, new_content, announcements, reminder_minutes, language')
            .in('user_id', userIds)
          if (preferenceError) throw preferenceError
          preferences = new Map(((preferenceData ?? []) as PreferenceRow[]).map((row) => [row.user_id, row]))
        }

        const sessionsById = new Map(upcoming.map((session) => [session.id, session]))
        const reminderRows = registrations.flatMap((registration) => {
          const session = sessionsById.get(registration.session_id)
          if (!session) return []
          const preference = preferences.get(registration.user_id) ?? defaults(registration.user_id)
          if (!preference.push_enabled || !preference.session_reminders) return []

          const minutesUntil = (new Date(session.starts_at).getTime() - now.getTime()) / 60_000
          if (minutesUntil <= 0 || minutesUntil > preference.reminder_minutes) return []

          const minutes = preference.reminder_minutes
          return [{
            user_id: registration.user_id,
            type: 'session_reminder',
            title_ar: 'تذكير بالسيشن',
            title_en: 'Session reminder',
            body_ar: `تبدأ ${session.title} خلال ${minutes} دقيقة أو أقل.`,
            body_en: `${session.title} starts in ${minutes} minutes or less.`,
            href: `/sessions/${session.id}`,
            dedupe_key: `session-reminder:${session.id}:${minutes}`,
          }]
        })

        if (reminderRows.length) {
          const { data: inserted, error: reminderError } = await ctx.supabaseAdmin
            .from('notifications')
            .upsert(reminderRows, { onConflict: 'user_id,dedupe_key', ignoreDuplicates: true })
            .select('id')
          if (reminderError) throw reminderError
          remindersCreated = inserted?.length ?? 0
        }
      }

      const { data: notificationData, error: notificationError } = await ctx.supabaseAdmin
        .from('notifications')
        .select('id, user_id, type, title_ar, title_en, body_ar, body_en, href, created_at')
        .order('created_at', { ascending: true })
        .limit(200)
      if (notificationError) throw notificationError

      const notifications = (notificationData ?? []) as NotificationRow[]
      if (!notifications.length) return Response.json({ remindersCreated, processed: 0, sent: 0, skipped: 0, failed: 0, staleRemoved: 0 })

      const notificationIds = notifications.map((row) => row.id)
      const { data: deliveryData, error: deliveryError } = await ctx.supabaseAdmin
        .from('notification_push_deliveries')
        .select('notification_id, status, attempts')
        .in('notification_id', notificationIds)
      if (deliveryError) throw deliveryError

      const deliveries = new Map(((deliveryData ?? []) as DeliveryRow[]).map((row) => [row.notification_id, row]))
      const pending = notifications.filter((row) => {
        const delivery = deliveries.get(row.id)
        return !delivery || delivery.status === 'pending'
      })
      if (!pending.length) return Response.json({ remindersCreated, processed: 0, sent: 0, skipped: 0, failed: 0, staleRemoved: 0 })

      const userIds = [...new Set(pending.map((row) => row.user_id))]
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
      if (pending.some((row) => shouldPush(row.type, preferences.get(row.user_id) ?? defaults(row.user_id)) && (subscriptionsByUser.get(row.user_id)?.length ?? 0) > 0)) {
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

      for (const notification of pending) {
        const preference = preferences.get(notification.user_id) ?? defaults(notification.user_id)
        const previousAttempts = deliveries.get(notification.id)?.attempts ?? 0
        const attempts = previousAttempts + 1

        if (!shouldPush(notification.type, preference)) {
          const { error } = await ctx.supabaseAdmin.from('notification_push_deliveries').upsert({
            notification_id: notification.id,
            status: 'skipped',
            attempts: previousAttempts,
            last_attempt_at: nowIso,
            delivered_at: nowIso,
            last_error: 'disabled_by_user_preference',
          }, { onConflict: 'notification_id' })
          if (error) throw error
          skipped += 1
          continue
        }

        const subscriptions = subscriptionsByUser.get(notification.user_id) ?? []
        if (!subscriptions.length || !vapid) {
          const { error } = await ctx.supabaseAdmin.from('notification_push_deliveries').upsert({
            notification_id: notification.id,
            status: 'skipped',
            attempts: previousAttempts,
            last_attempt_at: nowIso,
            delivered_at: nowIso,
            last_error: 'no_active_push_subscription',
          }, { onConflict: 'notification_id' })
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
            }, payload, { TTL: notification.type === 'session_reminder' ? 60 * 60 : 24 * 60 * 60 })
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
        const { error } = await ctx.supabaseAdmin.from('notification_push_deliveries').upsert({
          notification_id: notification.id,
          status,
          attempts,
          last_attempt_at: nowIso,
          delivered_at: successes > 0 ? nowIso : null,
          last_error: successes > 0 ? null : (lastError || 'Push delivery failed'),
        }, { onConflict: 'notification_id' })
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
