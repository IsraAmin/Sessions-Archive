const APP_CACHE = 'sessions-archive-app-v3'
const RUNTIME_CACHE = 'sessions-archive-runtime-v3'
const APP_SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => ![APP_CACHE, RUNTIME_CACHE].includes(key)).map((key) => caches.delete(key)),
    )),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const requestUrl = new URL(event.request.url)
  if (requestUrl.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.put('/', copy)))
          }
          return response
        })
        .catch(async () => (await caches.match(event.request)) || (await caches.match('/'))),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          event.waitUntil(caches.open(RUNTIME_CACHE).then((cache) => cache.put(event.request, copy)))
        }
        return response
      }).catch(() => cached)
      return cached || network
    }),
  )
})

self.addEventListener('push', (event) => {
  let payload = { title: 'Sessions Archive', body: 'لديك تحديث جديد', url: '/' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    if (event.data) payload.body = event.data.text()
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url || '/' },
      tag: payload.url || 'sessions-archive-update',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = typeof event.notification.data?.url === 'string' ? event.notification.data.url : '/'
  const safeTarget = target.startsWith('/') && !target.startsWith('//') ? target : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.location.origin) && 'focus' in client)
      if (existing) {
        if ('navigate' in existing) await existing.navigate(safeTarget)
        return existing.focus()
      }
      return self.clients.openWindow(safeTarget)
    }),
  )
})
