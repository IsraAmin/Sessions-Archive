import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, publicStorageUrl } from '../lib/supabase'
import type { Profile } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { disablePushNotifications, enablePushNotifications, getPushNotificationStatus, type PushStatus } from '../lib/push'
import { compressProfileImage, formatBytes } from '../lib/image'

export function ProfilePage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking')
  const [compressionSummary, setCompressionSummary] = useState('')

  useEffect(() => {
    if (!user) return
    void supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data, error }) => {
      if (error) setMessage(error.message)
      else setProfile(data as Profile)
    })
    void getPushNotificationStatus().then(setPushStatus)
  }, [user?.id])

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!user || !profile) return
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: profile.full_name,
        university: profile.university,
        department: profile.department,
        level: profile.level,
        bio: profile.bio,
      }).eq('id', user.id)
      if (error) throw error
      setMessage('تم حفظ التعديلات.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !user || !profile) return

    setBusy(true); setMessage(''); setCompressionSummary('')
    try {
      const compressed = await compressProfileImage(file)
      const extension = compressed.file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/avatar.${extension}`

      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(path, compressed.file, { upsert: true, contentType: compressed.file.type, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      if (updateError) throw updateError

      setProfile({ ...profile, avatar_path: path })
      setCompressionSummary(`${formatBytes(compressed.originalBytes)} ← ${formatBytes(compressed.compressedBytes)}`)
      setMessage('تم تحديث الصورة وضغطها إلى أقل من 50KB.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function turnOnPush() {
    if (!user) return
    setBusy(true); setMessage('')
    try {
      await enablePushNotifications(user.id)
      setPushStatus('enabled')
      setMessage('تم تفعيل الإشعارات على هذا الجهاز.')
    } catch (error) {
      setPushStatus(await getPushNotificationStatus())
      setMessage(errorMessage(error))
    } finally { setBusy(false) }
  }

  async function turnOffPush() {
    if (!user) return
    setBusy(true); setMessage('')
    try {
      await disablePushNotifications(user.id)
      setPushStatus(await getPushNotificationStatus())
      setMessage('تم إيقاف الإشعارات على هذا الجهاز.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  if (!profile) return <div className="page-state">جاري تحميل الملف الشخصي…</div>
  const avatar = publicStorageUrl('profile-images', profile.avatar_path)

  return (
    <section className="panel profile-panel">
      <div className="profile-hero">
        <div>
          <div className="eyebrow">حسابك</div>
          <h1>الملف الشخصي</h1>
          <p>حدّث بياناتك وصورتك، واختر إذا كنت تريد إشعارات على هذا الجهاز.</p>
        </div>
        <div className="profile-avatar-wrap">
          {avatar ? <img className="avatar avatar-large" src={avatar} alt="صورتك الشخصية" /> : <div className="avatar avatar-large avatar-placeholder" aria-hidden="true">{profile.full_name.slice(0, 1)}</div>}
          <span className="image-limit-badge">≤ 50 KB</span>
        </div>
      </div>

      <form className="form-grid" onSubmit={save}>
        <label>الاسم الكامل<input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></label>
        <label>الجامعة<input value={profile.university ?? ''} onChange={(e) => setProfile({ ...profile, university: e.target.value || null })} /></label>
        <label>القسم<input value={profile.department ?? ''} onChange={(e) => setProfile({ ...profile, department: e.target.value || null })} /></label>
        <label>المستوى<input value={profile.level ?? ''} onChange={(e) => setProfile({ ...profile, level: e.target.value || null })} /></label>
        <label className="wide">نبذة<textarea rows={4} value={profile.bio ?? ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value || null })} /></label>

        <div className="wide profile-upload-card">
          <div>
            <strong>الصورة الشخصية</strong>
            <p>اختر أي صورة. سنضغطها تلقائيًا إلى 50KB أو أقل قبل رفعها.</p>
            {compressionSummary && <small>آخر ضغط: {compressionSummary}</small>}
          </div>
          <label className="button button-secondary profile-upload-button">
            {busy ? 'جاري التجهيز…' : 'اختر صورة'}
            <input type="file" accept="image/*" disabled={busy} onChange={(event) => void uploadAvatar(event)} />
          </label>
        </div>

        <button className="button button-primary" disabled={busy}>حفظ التعديلات</button>
      </form>

      <div className="subsection notification-card">
        <div>
          <h2>إشعارات هذا الجهاز</h2>
          <p>{pushStatus === 'enabled' ? 'الإشعارات مفعّلة. ستصلك تحديثات السيشنات على هذا الجهاز.' : pushStatus === 'denied' ? 'المتصفح يمنع الإشعارات. غيّر الإذن من إعدادات الموقع ثم حاول مرة أخرى.' : pushStatus === 'unsupported' ? 'هذا المتصفح لا يدعم Push Notifications.' : 'فعّل الإشعارات لتصلك تحديثات السيشنات حتى عندما لا تكون الصفحة مفتوحة.'}</p>
        </div>
        <div className="row-actions row-actions-start">
          {pushStatus !== 'enabled' && pushStatus !== 'unsupported' && <button type="button" className="button button-secondary" disabled={busy || pushStatus === 'denied'} onClick={() => void turnOnPush()}>تفعيل الإشعارات</button>}
          {pushStatus === 'enabled' && <button type="button" className="button button-ghost" disabled={busy} onClick={() => void turnOffPush()}>إيقاف الإشعارات</button>}
        </div>
      </div>
      {message && <p className="notice" role="status">{message}</p>}
    </section>
  )
}
