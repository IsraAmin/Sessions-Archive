import { extractYouTubeVideoId } from './youtube'

export type VideoProvider = 'youtube' | 'google_drive'
export type ParsedVideoSource = { provider: VideoProvider; id: string }

const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/

function cleanDriveId(value: string) {
  return value.startsWith('gdrive:') ? value.slice(7) : value
}

export function extractGoogleDriveFileId(value: string) {
  const input = value.trim()
  if (input.startsWith('gdrive:')) {
    const id = cleanDriveId(input)
    return DRIVE_ID.test(id) ? id : null
  }

  try {
    const url = new URL(input)
    const host = url.hostname.replace(/^www\./, '')
    if (host !== 'drive.google.com') return null

    const parts = url.pathname.split('/').filter(Boolean)
    const fileIndex = parts.indexOf('d')
    if (parts[0] === 'file' && fileIndex >= 0) {
      const id = parts[fileIndex + 1] ?? ''
      return DRIVE_ID.test(id) ? id : null
    }

    const queryId = url.searchParams.get('id') ?? ''
    if (DRIVE_ID.test(queryId)) return queryId
  } catch {
    return null
  }

  return null
}

export function parseVideoSource(value: string): ParsedVideoSource | null {
  const driveId = extractGoogleDriveFileId(value)
  if (driveId) return { provider: 'google_drive', id: driveId }

  const youtubeId = extractYouTubeVideoId(value)
  if (youtubeId && !youtubeId.startsWith('gdrive:')) return { provider: 'youtube', id: youtubeId }

  return null
}

export function googleDrivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(cleanDriveId(fileId))}/preview`
}

export function videoSourceUrl(provider: VideoProvider | null | undefined, id: string) {
  return provider === 'google_drive' || id.startsWith('gdrive:')
    ? `https://drive.google.com/file/d/${cleanDriveId(id)}/view`
    : `https://youtu.be/${id}`
}
