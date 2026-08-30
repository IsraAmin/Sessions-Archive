import { googleDrivePreviewUrl } from '../lib/videoSource'

type Props = {
  fileId: string
  title: string
}

export function GoogleDrivePlayer({ fileId, title }: Props) {
  return <div className="youtube-player-shell google-drive-player-shell">
    <div className="youtube-frame google-drive-frame" aria-label={title}>
      <iframe
        className="google-drive-video-frame"
        src={googleDrivePreviewUrl(fileId)}
        title={title}
        allow="autoplay; encrypted-media; fullscreen"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  </div>
}
