const APP_CACHE = 'sessions-archive-app-v9'
const RUNTIME_CACHE = 'sessions-archive-runtime-v9'
const BASE_URL = new URL(self.registration.scope)
const BASE_PATH = BASE_URL.pathname.endsWith('/') ? BASE_URL.pathname : `${BASE_URL.pathname}/`
const APP_SHELL = [
  BASE_PATH,
  `${BASE_PATH}manifest.webmanifest?v=4`,
  `${BASE_PATH}icon-192.png?v=4`,
  `${BASE_PATH}icon-512.svg?v=4`,
  `${BASE_PATH}favicon-32x32.png?v=4`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![APP_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin || !requestUrl.pathname.startsWith(BASE_PATH)) return

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put(BASE_PATH, response.clone())))
      return response
    }).catch(async () => (await caches.match(event.request)) || (await caches.match(BASE_PATH))))
    return
  }

  const isBrandAsset = /(?:manifest\.webmanifest|icon-192|icon-512|favicon-32x32|apple-touch-icon)/.test(requestUrl.pathname)
  if (isBrandAsset) {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, response.clone())))
      return response
    }).catch(() => caches.match(event.request)))
    return
  }

  event.respondWith(caches.match(event.request).then((cached) => {
    const network = fetch(event.request).then((response) => {
      if (response.ok) event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, response.clone())))
      return response
    }).catch(() => cached)
    return cached || network
  }))
})

function appTarget(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return self.registration.scope
  return new URL(path.replace(/^\/+/, ''), self.registration.scope).href
}

self.addEventListener('push', (event) => {
  let payload = { title: 'Sessions Archive', body: 'لديك تحديث جديد', url: '/' }
  try { if (event.data) payload = { ...payload, ...event.data.json() } }
  catch { if (event.data) payload.body = event.data.text() }
  const target = appTarget(payload.url)
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: `${BASE_PATH}icon-192.png?v=4`,
    badge: `${BASE_PATH}icon-192.png?v=4`,
    data: { url: target },
    tag: payload.url || 'sessions-archive-update',
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = typeof event.notification.data?.url === 'string' ? event.notification.data.url : self.registration.scope
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
    const existing = clients.find((client) => client.url.startsWith(self.registration.scope) && 'focus' in client)
    if (existing) { if ('navigate' in existing) await existing.navigate(target); return existing.focus() }
    return self.clients.openWindow(target)
  }))
})