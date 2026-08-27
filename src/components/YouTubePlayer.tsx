import { youtubeEmbedUrl } from '../lib/youtube'

type YouTubePlayerProps = {
  videoId: string
  title: string
}

export function YouTubePlayer({ videoId, title }: YouTubePlayerProps) {
  return (
    <div className="youtube-frame">
      <iframe
        src={youtubeEmbedUrl(videoId)}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  )
}
