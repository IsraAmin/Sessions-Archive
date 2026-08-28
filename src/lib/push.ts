import { supabase } from './supabase'

export type PushStatus = 'checking' | 'unsupported' | 'default' | 'denied' | 'enabled'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

async function getRegistration() {
  const scope = import.meta.env.BASE_URL
  const existing = await navigator.serviceWorker.getRegistration(scope)
  if (existing) return existing
  return navigator.serviceWorker.register(`${scope}sw.js`, {
    scope,
    updateViaCache: 'none',
  })
}

async function getVapidPublicKey() {
  const { data, error } = await supabase.functions.invoke('send-session-notification', {
    method: 'GET',
  })
  if (error) throw error

  const publicKey = typeof data?.publicKey === 'string' ? data.publicKey.trim() : ''
  if (!publicKey) throw new Error('تعذر تجهيز خدمة إشعارات الجهاز.')
  return publicKey
}

export async function getPushNotificationStatus(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) return 'enabled'
  return 'default'
}

export async function enablePushNotifications(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('هذا المتصفح لا يدعم Push Notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission === 'denied') throw new Error('الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ثم حاول مرة أخرى.')
  if (permission !== 'granted') throw new Error('لم يتم تفعيل الإشعارات.')

  const [registration, vapidPublicKey] = await Promise.all([
    getRegistration(),
    getVapidPublicKey(),
  ])
  await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    })
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('تعذر حفظ اشتراك الإشعارات على هذا الجهاز.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  }, { onConflict: 'endpoint' })

  if (error) throw error
  return subscription
}

export async function disablePushNotifications(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', subscription.endpoint)

  await subscription.unsubscribe()
  if (error) throw error
}
