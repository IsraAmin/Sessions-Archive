import { supabase } from './supabase'

export type PushStatus = 'checking' | 'unsupported' | 'default' | 'denied' | 'enabled'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

async function getRegistration() {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
}

export async function getPushNotificationStatus(): Promise<PushStatus> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'

  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) return 'enabled'
  return 'default'
}

export async function enablePushNotifications(userId: string) {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) throw new Error('مفتاح الإشعارات العام غير مضبوط في إعدادات التطبيق.')
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('هذا المتصفح لا يدعم Push Notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission === 'denied') throw new Error('الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح ثم حاول مرة أخرى.')
  if (permission !== 'granted') throw new Error('لم يتم تفعيل الإشعارات.')

  const registration = await getRegistration()
  await navigator.serviceWorker.ready

  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

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

  const registration = await navigator.serviceWorker.getRegistration()
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
