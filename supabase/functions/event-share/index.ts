type EventPreview = {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  event_date: string
  location: string | null
  event_type: string
}

type EventMediaPreview = {
  provider: string
  source_url: string
  source_id: string | null
  is_cover: boolean
  position: number
}

const DEFAULT_APP_URL = 'https://israamin.github.io/Sessions-Archive'
const BOT_PATTERN = /facebookexternalhit|facebot|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|slackbot|googlebot|bingbot|crawler|spider|preview/i

function htmlEscape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function compactText(value: string, max = 200) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1).trimEnd()}…`
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function publicHttpUrl(value: string | null | undefined) {
  if (!value) return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

function driveFileId(value: string) {
  try {
    const url = new URL(value)
    if (url.hostname.replace(/^www\./, '') !== 'drive.google.com') return null
    const fileMatch = url.pathname.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/)
    if (fileMatch?.[1]) return fileMatch[1]
    const queryId = url.searchParams.get('id')
    return queryId && /^[A-Za-z0-9_-]{10,}$/.test(queryId) ? queryId : null
  } catch {
    return null
  }
}

function displayImageUrl(value: string | null | undefined) {
  const source = publicHttpUrl(value)
  if (!source) return null
  const id = driveFileId(source)
  return id ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}` : source
}

function typeLabel(value: string) {
  const labels: Record<string, string> = {
    cultural: 'فعالية ثقافية',
    sports: 'فعالية رياضية',
    initiative: 'مبادرة وإعمار',
    social: 'فعالية اجتماعية',
    academic: 'فعالية أكاديمية',
    other: 'فعالية',
  }
  return labels[value] ?? 'فعالية'
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
  } catch {
    return value
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const requestUrl = new URL(req.url)
  const eventId = requestUrl.searchParams.get('id')?.trim() ?? ''
  if (!isUuid(eventId)) return new Response('Event not found', { status: 404 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseKey) return new Response('Share preview unavailable', { status: 500 })

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    Accept: 'application/json',
  }

  const eventApiUrl = new URL(`${supabaseUrl}/rest/v1/events`)
  eventApiUrl.searchParams.set('id', `eq.${eventId}`)
  eventApiUrl.searchParams.set('status', 'eq.published')
  eventApiUrl.searchParams.set('select', 'id,title,description,cover_url,event_date,location,event_type')
  eventApiUrl.searchParams.set('limit', '1')

  const eventResponse = await fetch(eventApiUrl, { headers })
  if (!eventResponse.ok) {
    console.error('Could not load event share preview', eventResponse.status, await eventResponse.text())
    return new Response('Share preview unavailable', { status: 502 })
  }

  const rows = await eventResponse.json() as EventPreview[]
  const event = rows[0]
  if (!event) return new Response('Event not found', { status: 404 })

  let imageUrl = displayImageUrl(event.cover_url)
  if (!imageUrl) {
    const mediaApiUrl = new URL(`${supabaseUrl}/rest/v1/event_media`)
    mediaApiUrl.searchParams.set('event_id', `eq.${event.id}`)
    mediaApiUrl.searchParams.set('media_type', 'eq.image')
    mediaApiUrl.searchParams.set('select', 'provider,source_url,source_id,is_cover,position')
    mediaApiUrl.searchParams.set('order', 'is_cover.desc,position.asc')
    mediaApiUrl.searchParams.set('limit', '1')
    const mediaResponse = await fetch(mediaApiUrl, { headers })
    if (mediaResponse.ok) {
      const mediaRows = await mediaResponse.json() as EventMediaPreview[]
      const media = mediaRows[0]
      if (media) {
        imageUrl = media.provider === 'google_drive' && media.source_id
          ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(media.source_id)}`
          : displayImageUrl(media.source_url)
      }
    }
  }

  const appBase = (Deno.env.get('SESSION_ARCHIVE_APP_URL') ?? DEFAULT_APP_URL).replace(/\/$/, '')
  const destinationUrl = `${appBase}/events/${encodeURIComponent(event.id)}`
  const shareUrl = `${requestUrl.origin}${requestUrl.pathname}?id=${encodeURIComponent(event.id)}`
  const title = compactText(event.title, 120)
  const metaLine = [typeLabel(event.event_type), formatDate(event.event_date), event.location?.trim()].filter(Boolean).join(' • ')
  const description = compactText([event.description?.trim(), metaLine].filter(Boolean).join(' — ') || 'فعالية في Sessions Repeat', 200)
  imageUrl = imageUrl ?? `${appBase}/icon-192.png?v=6`

  const userAgent = req.headers.get('user-agent') ?? ''
  const forcePreview = requestUrl.searchParams.get('preview') === '1'
  const isPreviewBot = forcePreview || BOT_PATTERN.test(userAgent)

  if (!isPreviewBot) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: destinationUrl,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
      },
    })
  }

  const safeTitle = htmlEscape(title)
  const safeDescription = htmlEscape(description)
  const safeImage = htmlEscape(imageUrl)
  const safeShareUrl = htmlEscape(shareUrl)
  const safeDestination = htmlEscape(destinationUrl)

  const html = `<!doctype html>
<html lang="ar" dir="auto">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle} | Sessions Repeat</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Sessions Repeat" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:alt" content="${safeTitle}" />
  <meta property="og:url" content="${safeShareUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
  <link rel="canonical" href="${safeDestination}" />
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>${safeDescription}</p>
    <p><a href="${safeDestination}">فتح في Sessions Repeat</a></p>
  </main>
</body>
</html>`

  return new Response(req.method === 'HEAD' ? null : html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
      'X-Robots-Tag': 'noindex',
    },
  })
})
