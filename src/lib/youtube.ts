const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,}$/

function driveVideoToken(url: URL) {
  const host = url.hostname.replace(/^www\./, '')
  if (host !== 'drive.google.com') return null

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'file') {
    const dIndex = parts.indexOf('d')
    const id = dIndex >= 0 ? parts[dIndex + 1] ?? '' : ''
    if (DRIVE_FILE_ID.test(id)) return `gdrive:${id}`
  }

  const queryId = url.searchParams.get('id') ?? ''
  return DRIVE_FILE_ID.test(queryId) ? `gdrive:${queryId}` : null
}

export function extractYouTubeVideoId(value: string) {
  const input = value.trim()
  if (YOUTUBE_VIDEO_ID.test(input)) return input
  if (input.startsWith('gdrive:') && DRIVE_FILE_ID.test(input.slice(7))) return input

  try {
    const url = new URL(input)
    const driveToken = driveVideoToken(url)
    if (driveToken) return driveToken

    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] ?? ''
      return YOUTUBE_VIDEO_ID.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const watchId = url.searchParams.get('v') ?? ''
      if (YOUTUBE_VIDEO_ID.test(watchId)) return watchId

      const parts = url.pathname.split('/').filter(Boolean)
      const markerIndex = parts.findIndex((part) => ['embed', 'shorts', 'live'].includes(part))
      const id = markerIndex >= 0 ? parts[markerIndex + 1] ?? '' : ''
      return YOUTUBE_VIDEO_ID.test(id) ? id : null
    }
  } catch {
    return null
  }

  return null
}

export function youtubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1`
}
