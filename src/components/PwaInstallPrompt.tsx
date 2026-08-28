import { useEffect, useState } from 'react'
import { useUi } from '../hooks/useUi'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}
type NavigatorWithStandalone = Navigator & { standalone?: boolean }
function isStandalone() { const navigatorWithStandalone = navigator as NavigatorWithStandalone; return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true }
function isIos() { return /iPad|iPhone|iPod/.test(navigator.userAgent) }

export function PwaInstallPrompt() {
  const { language } = useUi()
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [iosHint, setIosHint] = useState(false)
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem('pwa-install-dismissed') === '1')
  useEffect(() => {
    if (!isStandalone() && isIos()) setIosHint(true)
    const onBeforeInstallPrompt = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); setIosHint(false) }
    const onInstalled = () => { setInstallPrompt(null); setIosHint(false) }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt); window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (dismissed || (!installPrompt && !iosHint)) return null
  async function install() { if (!installPrompt) return; await installPrompt.prompt(); const choice = await installPrompt.userChoice; if (choice.outcome === 'accepted') setInstallPrompt(null) }
  function dismiss() { sessionStorage.setItem('pwa-install-dismissed', '1'); setDismissed(true) }
  const copy = language === 'ar' ? { label: 'تثبيت التطبيق', title: 'ثبّت Archive Repeat', hint: iosHint ? 'على iPhone أو iPad: افتح المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية».' : 'افتح المنصة كتطبيق مستقل من الشاشة الرئيسية.', install: 'تثبيت التطبيق', dismiss: 'إخفاء اقتراح التثبيت' } : { label: 'Install app', title: 'Install Archive Repeat', hint: iosHint ? 'On iPhone or iPad: open Share, then choose “Add to Home Screen”.' : 'Open the platform as a standalone app from your home screen.', install: 'Install app', dismiss: 'Dismiss install suggestion' }
  return <aside className="pwa-install" aria-label={copy.label}><img src={`${import.meta.env.BASE_URL}icon-192.png?v=5`} alt="" aria-hidden="true" /><div><strong>{copy.title}</strong><span>{copy.hint}</span></div>{installPrompt && <button className="button button-primary" type="button" onClick={() => void install()}>{copy.install}</button>}<button className="pwa-dismiss" type="button" onClick={dismiss} aria-label={copy.dismiss}>×</button></aside>
}
