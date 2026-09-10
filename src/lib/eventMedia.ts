import { extractGoogleDriveFileId, parseVideoSource, type VideoProvider } from './videoSource'

export type EventMediaProvider = 'google_drive' | 'youtube' | 'external' | 'whatsapp' | 'telegram'

export type ParsedEventMediaSource = {
  provider: EventMediaProvider
  sourceId: string | null
  sourceUrl: string
}

export type GoogleDriveFolderSource = {
  folderId: string
  resourceKey: string | null
  sourceUrl: string
}

function publicHttpUrl(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function parseEventImageSource(value: string): ParsedEventMediaSource | null {
  const sourceUrl = publicHttpUrl(value)
  if (!sourceUrl) return null

  const driveId = extractGoogleDriveFileId(sourceUrl)
  if (driveId) return { provider: 'google_drive', sourceId: driveId, sourceUrl }

  return { provider: 'external', sourceId: null, sourceUrl }
}

export function parseEventVideoSource(value: string): ParsedEventMediaSource | null {
  const input = value.trim()
  const parsed = parseVideoSource(input)
  if (parsed) {
    return {
      provider: parsed.provider,
      sourceId: parsed.id,
      sourceUrl: input,
    }
  }

  const sourceUrl = publicHttpUrl(input)
  if (!sourceUrl) return null
  return { provider: 'external', sourceId: null, sourceUrl }
}

export function extractGoogleDriveFolderSource(value: string): GoogleDriveFolderSource | null {
  const sourceUrl = publicHttpUrl(value)
  if (!sourceUrl) return null

  try {
    const url = new URL(sourceUrl)
    if (url.hostname.replace(/^www\./, '') !== 'drive.google.com') return null
    const parts = url.pathname.split('/').filter(Boolean)
    const folderIndex = parts.indexOf('folders')
    const folderId = folderIndex >= 0 ? (parts[folderIndex + 1] ?? '') : (url.searchParams.get('id') ?? '')
    if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) return null
    return {
      folderId,
      resourceKey: url.searchParams.get('resourcekey'),
      sourceUrl,
    }
  } catch {
    return null
  }
}

export function googleDriveFolderEmbedUrl(value: string) {
  const folder = extractGoogleDriveFolderSource(value)
  if (!folder) return null
  const params = new URLSearchParams({ id: folder.folderId })
  if (folder.resourceKey) params.set('resourcekey', folder.resourceKey)
  return `https://drive.google.com/embeddedfolderview?${params.toString()}#grid`
}

export function googleDriveImageUrl(fileId: string) {
  return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(fileId)}`
}

export function eventImageDisplayUrl(media: { provider: EventMediaProvider; source_id: string | null; source_url: string }) {
  return media.provider === 'google_drive' && media.source_id
    ? googleDriveImageUrl(media.source_id)
    : media.source_url
}

export function eventCoverDisplayUrl(coverUrl: string | null | undefined) {
  if (!coverUrl) return null
  const parsed = parseEventImageSource(coverUrl)
  if (!parsed) return null
  return parsed.provider === 'google_drive' && parsed.sourceId
    ? googleDriveImageUrl(parsed.sourceId)
    : parsed.sourceUrl
}

export function eventVideoPlayerId(media: { provider: EventMediaProvider; source_id: string | null; source_url: string }) {
  if (media.provider === 'google_drive' && media.source_id) return `gdrive:${media.source_id}`
  if (media.provider === 'youtube' && media.source_id) return media.source_id
  if ((media.provider === 'whatsapp' || media.provider === 'telegram') && media.source_id) return media.source_id
  return null
}

export function isEmbeddedVideoProvider(provider: EventMediaProvider): provider is VideoProvider {
  return provider === 'youtube' || provider === 'google_drive' || provider === 'whatsapp' || provider === 'telegram'
}
