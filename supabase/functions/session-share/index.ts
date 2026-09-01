type SessionPreview = {
  id: string
  title: string
  description: string
  cover_path: string | null
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

function compactText(value: string, max = 180) {
  const compact = value.replace(/\s+/g, ' ').trim()
  if (compact.length <= max) return compact
  return `${compact.slice(0, max - 1).trimEnd()}…`
}

function encodeStoragePath(path: string) {
  return path.split('/').map((part) => encodeURIComponent(part)).join('/')
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }

  const requestUrl = new URL(req.url)
  const sessionId = requestUrl.searchParams.get('id')?.trim() ?? ''
  if (!isUuid(sessionId)) return new Response('Session not found', { status: 404 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseKey) return new Response('Share preview unavailable', { status: 500 })

  const apiUrl = new URL(`${supabaseUrl}/rest/v1/sessions`)
  apiUrl.searchParams.set('id', `eq.${sessionId}`)
  apiUrl.searchParams.set('status', 'eq.published')
  apiUrl.searchParams.set('select', 'id,title,description,cover_path')
  apiUrl.searchParams.set('limit', '1')

  const apiResponse = await fetch(apiUrl, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: 'application/json',
    },
  })

  if (!apiResponse.ok) {
    console.error('Could not load session share preview', apiResponse.status, await apiResponse.text())
    return new Response('Share preview unavailable', { status: 502 })
  }

  const rows = await apiResponse.json() as SessionPreview[]
  const session = rows[0]
  if (!session) return new Response('Session not found', { status: 404 })

  const appBase = (Deno.env.get('SESSION_ARCHIVE_APP_URL') ?? DEFAULT_APP_URL).replace(/\/$/, '')
  const destinationUrl = `${appBase}/sessions/${encodeURIComponent(session.id)}`
  const shareUrl = `${requestUrl.origin}${requestUrl.pathname}?id=${encodeURIComponent(session.id)}`
  const title = compactText(session.title, 120)
  const description = compactText(session.description || 'Sessions Archive', 180)
  const imageUrl = session.cover_path
    ? `${supabaseUrl}/storage/v1/object/public/session-covers/${encodeStoragePath(session.cover_path)}`
    : `${appBase}/icon-192.png?v=6`

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
  <title>${safeTitle} | Sessions Archive</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Sessions Archive" />
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
    <p><a href="${safeDestination}">Open in Sessions Archive</a></p>
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
