const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

export function extractYouTubeVideoId(value: string) {
  const input = value.trim()
  if (YOUTUBE_VIDEO_ID.test(input)) return input

  try {
    const url = new URL(input)
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
