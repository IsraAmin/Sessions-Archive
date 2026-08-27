import { supabase } from './supabase'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

export async function enablePushNotifications(userId: string) {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!vapidPublicKey) throw new Error('VITE_VAPID_PUBLIC_KEY غير مضبوط')
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('هذا المتصفح لا يدعم Push Notifications')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('لم يتم منح إذن الإشعارات')

  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  })

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('بيانات Push Subscription غير مكتملة')
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

  // Stop browser delivery even if the database cleanup failed.
  await subscription.unsubscribe()
  if (error) throw error
}
