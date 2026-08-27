import { useEffect, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

function isStandalone() {
  const navigatorWithStandalone = navigator as NavigatorWithStandalone
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('pwa-install-dismissed') === '1')

  useEffect(() => {
    if (!isStandalone() && isIos()) setIosHint(true)

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
      setIosHint(false)
    }
    const onInstalled = () => {
      setInstallPrompt(null)
      setIosHint(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (dismissed || (!installPrompt && !iosHint)) return null

  async function install() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'accepted') setInstallPrompt(null)
  }

  function dismiss() {
    sessionStorage.setItem('pwa-install-dismissed', '1')
    setDismissed(true)
  }

  return (
    <aside className="pwa-install" aria-label="تثبيت التطبيق">
      <img src="/icon-192.png" alt="" aria-hidden="true" />
      <div>
        <strong>ثبّت Sessions Archive</strong>
        <span>{iosHint ? 'على iPhone أو iPad: افتح المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية».' : 'افتح المنصة كتطبيق مستقل من الشاشة الرئيسية.'}</span>
      </div>
      {installPrompt && <button className="button button-primary" type="button" onClick={() => void install()}>تثبيت التطبيق</button>}
      <button className="pwa-dismiss" type="button" onClick={dismiss} aria-label="إخفاء اقتراح التثبيت">×</button>
    </aside>
  )
}
