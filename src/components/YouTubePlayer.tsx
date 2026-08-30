import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase } from '../lib/supabase'
import { GoogleDrivePlayer } from './GoogleDrivePlayer'

interface YTPlayer {
  destroy(): void
  getCurrentTime(): number
  getDuration(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
}
interface YTEvent { target: YTPlayer; data: number }
interface YTNamespace {
  Player: new (element: HTMLElement, options: { videoId: string; host?: string; playerVars?: Record<string, number | string>; events?: { onReady?: (event: YTEvent) => void; onStateChange?: (event: YTEvent) => void } }) => YTPlayer
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number }
}

declare global {
  interface Window { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void }
}

let apiPromise: Promise<YTNamespace> | null = null
function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]')
    window.onYouTubeIframeAPIReady = () => { if (window.YT) resolve(window.YT) }
    if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://www.youtube.com/iframe_api'
      script.async = true
      script.dataset.youtubeIframeApi = 'true'
      document.head.appendChild(script)
    }
  })
  return apiPromise
}

function formatTime(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(rounded / 60)
  const rest = String(rounded % 60).padStart(2, '0')
  return `${minutes}:${rest}`
}

type Progress = { seconds: number; percent: number }

type Props = {
  videoId: string
  title: string
  videoDbId?: string
  initialProgress?: Progress | null
}

export function YouTubePlayer({ videoId, title, videoDbId, initialProgress }: Props) {
  const { user } = useAuth()
  const { t } = useUi()
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const timerRef = useRef<number | null>(null)
  const [percent, setPercent] = useState(initialProgress?.percent ?? 0)
  const driveFileId = videoId.startsWith('gdrive:') ? videoId.slice(7) : null

  useEffect(() => setPercent(initialProgress?.percent ?? 0), [initialProgress?.percent, videoDbId])

  useEffect(() => {
    if (driveFileId) return

    let cancelled = false
    let player: YTPlayer | null = null

    async function saveProgress(forceCompleted = false) {
      if (!user || !videoDbId || !playerRef.current) return
      const seconds = Math.max(0, Math.floor(playerRef.current.getCurrentTime() || 0))
      const duration = Math.max(0, Math.floor(playerRef.current.getDuration() || 0))
      const nextPercent = duration > 0 ? Math.min(100, Math.round((seconds / duration) * 10000) / 100) : 0
      setPercent(nextPercent)
      await supabase.from('video_progress').upsert({
        user_id: user.id,
        video_id: videoDbId,
        seconds,
        duration,
        percent: nextPercent,
        completed_at: forceCompleted || nextPercent >= 95 ? new Date().toISOString() : null,
      }, { onConflict: 'user_id,video_id' })
    }

    function stopTimer() {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      timerRef.current = null
    }

    void loadYouTubeApi().then((YT) => {
      if (cancelled || !hostRef.current) return
      player = new YT.Player(hostRef.current, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, enablejsapi: 1 },
        events: {
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              stopTimer()
              timerRef.current = window.setInterval(() => void saveProgress(), 10_000)
            } else if (event.data === YT.PlayerState.PAUSED) {
              stopTimer(); void saveProgress()
            } else if (event.data === YT.PlayerState.ENDED) {
              stopTimer(); void saveProgress(true)
            }
          },
        },
      })
      playerRef.current = player
    })

    return () => {
      cancelled = true
      stopTimer()
      playerRef.current = null
      player?.destroy()
    }
  }, [driveFileId, videoId, videoDbId, user?.id])

  function continueWatching() {
    if (!playerRef.current || !initialProgress?.seconds) return
    playerRef.current.seekTo(initialProgress.seconds, true)
    playerRef.current.playVideo()
  }

  if (driveFileId) return <GoogleDrivePlayer fileId={driveFileId} title={title} />

  return <div className="youtube-player-shell">
    <div className="youtube-frame" aria-label={title}><div ref={hostRef} /></div>
    {videoDbId && user && <div className="video-progress-row">
      <div className="video-progress-track" aria-label={t('video.progress', { n: Math.round(percent) })}><span style={{ width: `${Math.min(100, percent)}%` }} /></div>
      <span>{percent >= 95 ? t('video.completed') : t('video.progress', { n: Math.round(percent) })}</span>
      {initialProgress && initialProgress.seconds > 5 && initialProgress.percent < 95 && <button type="button" className="text-action" onClick={continueWatching}>{t('video.continue', { time: formatTime(initialProgress.seconds) })}</button>}
    </div>}
  </div>
}
