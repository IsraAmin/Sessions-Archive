import { extractYouTubeVideoId } from './youtube'

export type VideoProvider = 'youtube' | 'google_drive'
export type ParsedVideoSource = { provider: VideoProvider; id: string }

const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/

export function extractGoogleDriveFileId(value: string) {
  const input = value.trim()
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
  const youtubeId = extractYouTubeVideoId(value)
  if (youtubeId) return { provider: 'youtube', id: youtubeId }

  const driveId = extractGoogleDriveFileId(value)
  if (driveId) return { provider: 'google_drive', id: driveId }

  return null
}

export function googleDrivePreviewUrl(fileId: string) {
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview`
}

export function videoSourceUrl(provider: VideoProvider | null | undefined, id: string) {
  return provider === 'google_drive'
    ? `https://drive.google.com/file/d/${id}/view`
    : `https://youtu.be/${id}`
}
