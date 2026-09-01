import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { disablePushNotifications, enablePushNotifications, getPushEnvironmentIssue } from '../lib/push'
import { supabase } from '../lib/supabase'
import { ConfirmDialog } from './ConfirmDialog'
import { useToast } from './ToastProvider'

type BrowserPermission = NotificationPermission | 'unsupported'

function currentPermission(): BrowserPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export function PushResubscribeAction({ fullWidth = false }: { fullWidth?: boolean }) {
  const { user } = useAuth()
  const { language, t } = useUi()
  const { showToast } = useToast()
  const [permission, setPermission] = useState<BrowserPermission>(currentPermission)
  const [busy, setBusy] = useState(false)
  const [showPermissionHelp, setShowPermissionHelp] = useState(false)
  const ar = language === 'ar'

  useEffect(() => {
    const refreshPermission = () => setPermission(currentPermission())
    window.addEventListener('focus', refreshPermission)
    document.addEventListener('visibilitychange', refreshPermission)
    return () => {
      window.removeEventListener('focus', refreshPermission)
      document.removeEventListener('visibilitychange', refreshPermission)
    }
  }, [])

  async function subscribeAgain() {
    if (!user || busy) return
    setBusy(true)
    try {
      setPermission(currentPermission())
      if (currentPermission() === 'denied') {
        setShowPermissionHelp(true)
        return
      }

      const issue = getPushEnvironmentIssue()
      if (issue) throw new Error(issue)

      await disablePushNotifications(user.id)
      await enablePushNotifications(user.id)

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({ user_id: user.id, push_enabled: true }, { onConflict: 'user_id' })
      if (error) throw error

      setPermission(currentPermission())
      setShowPermissionHelp(false)
      showToast({
        kind: 'success',
        title: t('common.success'),
        message: ar ? 'تم تفعيل اشتراك الإشعارات لهذا الجهاز من جديد.' : 'Notifications were re-enabled for this device.',
      })
    } catch (error) {
      setPermission(currentPermission())
      if (currentPermission() === 'denied') {
        setShowPermissionHelp(true)
        return
      }
      showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function checkAfterSettings() {
    setPermission(currentPermission())
    if (currentPermission() === 'denied') {
      showToast({
        kind: 'error',
        title: ar ? 'الإذن ما زال محظورًا' : 'Permission is still blocked',
        message: ar ? 'اسمح بالإشعارات من إعدادات الجهاز أو المتصفح أولًا، ثم ارجع واضغط الزر مرة أخرى.' : 'Allow notifications in your device or browser settings first, then return and try again.',
      })
      return
    }
    setShowPermissionHelp(false)
    await subscribeAgain()
  }

  const denied = permission === 'denied'
  const buttonLabel = busy
    ? (ar ? 'جاري التحقق والاشتراك…' : 'Checking and subscribing…')
    : denied
      ? (ar ? 'السماح ثم إعادة الاشتراك' : 'Allow and re-subscribe')
      : (ar ? 'إعادة الاشتراك في الإشعارات' : 'Re-subscribe to notifications')

  const permissionHelp = ar
    ? 'المتصفح أو الجهاز حظر الإشعارات، والمنصة لا تستطيع تغيير هذا الإذن بنفسها. إذا كنت تفتح التطبيق من الأيقونة: اضغط مطولًا على أيقونة Sessions Archive ثم «معلومات التطبيق» ← «الإشعارات» ← «سماح». وإذا كنت داخل Chrome: افتح ⋮ ← الإعدادات ← إعدادات المواقع ← الإشعارات ← Sessions Archive ← سماح. بعد السماح ارجع للمنصة واضغط «تحقق وفعّل الآن».'
    : 'Notifications are blocked by the browser or device, and the app cannot change that permission itself. If you opened the installed app, long-press the Sessions Archive icon, open App info → Notifications → Allow. In Chrome, open ⋮ → Settings → Site settings → Notifications → Sessions Archive → Allow. Then return here and tap “Check and enable now”.'

  if (!user) return null

  return <>
    <button
      type="button"
      className="button button-secondary"
      style={fullWidth ? { width: '100%' } : undefined}
      disabled={busy}
      onClick={() => denied ? setShowPermissionHelp(true) : void subscribeAgain()}
    >{buttonLabel}</button>

    <ConfirmDialog
      open={showPermissionHelp}
      title={ar ? 'السماح بالإشعارات من إعدادات الجهاز' : 'Allow notifications in device settings'}
      description={permissionHelp}
      confirmLabel={ar ? 'تحقق وفعّل الآن' : 'Check and enable now'}
      cancelLabel={ar ? 'لاحقًا' : 'Later'}
      tone="primary"
      busy={busy}
      onCancel={() => !busy && setShowPermissionHelp(false)}
      onConfirm={() => void checkAfterSettings()}
    />
  </>
}
