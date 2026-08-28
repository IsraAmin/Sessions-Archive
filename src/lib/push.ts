import { supabase } from './supabase'

export type PushStatus = 'checking' | 'unsupported' | 'default' | 'denied' | 'enabled'

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)))
}

function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), milliseconds)
    Promise.resolve(promise).then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (error) => { window.clearTimeout(timer); reject(error) },
    )
  })
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandaloneApp() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

export function getPushEnvironmentIssue() {
  if (!window.isSecureContext) return 'إشعارات الجهاز تحتاج اتصال HTTPS آمن.'
  if (isIosDevice() && !isStandaloneApp()) {
    return 'على iPhone وiPad: افتحي المنصة في Safari، اضغطي مشاركة، اختاري «إضافة إلى الشاشة الرئيسية»، ثم افتحي Sessions Archive من الأيقونة الجديدة وفعّلي الإشعارات من البروفايل.'
  }
  if (!('serviceWorker' in navigator)) return 'هذا المتصفح لا يدعم Service Worker المطلوب لإشعارات الجهاز.'
  if (!('PushManager' in window) || !('Notification' in window)) return 'هذا المتصفح أو وضع التصفح الحالي لا يدعم Push Notifications.'
  if (Notification.permission === 'denied') return 'الإشعارات محظورة لهذا الموقع. افتحي إعدادات الموقع وغيّري الإذن إلى سماح ثم حاولي مرة أخرى.'
  return ''
}

function pushError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return new Error('المتصفح منع إشعارات هذا الموقع. افتحي إعدادات الموقع، اسمحي بالإشعارات، ثم حاولي مرة أخرى.')
    if (error.name === 'AbortError') return new Error('تعذر الاتصال بخدمة Push على هذا الجهاز مؤقتًا. تأكدي من الإنترنت ثم حاولي مرة أخرى.')
    if (error.name === 'InvalidStateError') return new Error('خدمة الإشعارات لم تجهز على هذا الجهاز بعد. حدّثي الصفحة مرة واحدة ثم حاولي مرة أخرى.')
  }
  if (error instanceof Error && error.message) return error
  return new Error('تعذر إنشاء اشتراك Push على هذا الجهاز. حدّثي الصفحة ثم حاولي مرة أخرى.')
}

async function getRegistration() {
  const scope = import.meta.env.BASE_URL
  let registration = await navigator.serviceWorker.getRegistration(scope)
  if (!registration) {
    registration = await navigator.serviceWorker.register(`${scope}sw.js`, { scope, updateViaCache: 'none' })
  }
  void registration.update().catch(() => undefined)
  if (registration.active) return registration
  return withTimeout(navigator.serviceWorker.ready, 10_000, 'خدمة الإشعارات لم تجهز على هذا الجهاز. حدّثي الصفحة مرة واحدة ثم حاولي مرة أخرى.')
}

async function getVapidPublicKey() {
  const { data, error } = await supabase.functions.invoke('send-session-notification', { body: { action: 'get_public_key' } })
  if (error) throw new Error(`تعذر تجهيز خدمة Push من السيرفر: ${error.message}`)
  const publicKey = typeof data?.publicKey === 'string' ? data.publicKey.trim() : ''
  if (!publicKey) throw new Error('تعذر تجهيز مفتاح Push العام. حاولي مرة أخرى بعد لحظات.')
  return publicKey
}

export async function getPushNotificationStatus(): Promise<PushStatus> {
  const issue = getPushEnvironmentIssue()
  if (issue && (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator))) return 'unsupported'
  if ('Notification' in window && Notification.permission === 'denied') return 'denied'
  try {
    const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
    const subscription = await registration?.pushManager.getSubscription()
    return subscription ? 'enabled' : 'default'
  } catch { return 'default' }
}

export async function enablePushNotifications(userId: string) {
  const environmentIssue = getPushEnvironmentIssue()
  if (environmentIssue) throw new Error(environmentIssue)

  const registration = await getRegistration()
  const vapidPublicKey = await getVapidPublicKey()

  const permission = await Notification.requestPermission()
  if (permission === 'denied') throw new Error('الإشعارات محظورة لهذا الموقع. افتحي إعدادات الموقع واسمحي بالإشعارات ثم حاولي مرة أخرى.')
  if (permission !== 'granted') throw new Error('لم يتم منح إذن الإشعارات لهذا الموقع.')

  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) })
    } catch (error) { throw pushError(error) }
  }

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) throw new Error('المتصفح أنشأ اشتراكًا غير مكتمل. أوقفي الإشعارات من إعدادات الموقع ثم فعّليها من جديد.')

  const { data: saved, error } = await supabase.from('push_subscriptions').upsert({ user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth }, { onConflict: 'endpoint' }).select('id').single()
  if (error) throw new Error(`تم إنشاء اشتراك الجهاز لكن تعذر ربطه بحسابك: ${error.message}`)
  if (!saved) throw new Error('تعذر تأكيد حفظ اشتراك الإشعارات لهذا الجهاز.')
  return subscription
}

export async function disablePushNotifications(userId: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe()
  const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint)
  if (error) throw error
}
