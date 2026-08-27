import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, publicStorageUrl } from '../lib/supabase'
import type { Profile } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { disablePushNotifications, enablePushNotifications } from '../lib/push'

export function ProfilePage() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    void supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data, error }) => {
      if (error) setMessage(error.message)
      else setProfile(data as Profile)
    })
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
      setMessage('تم حفظ بياناتك.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  async function uploadAvatar(file: File) {
    if (!user || !profile) return
    setBusy(true); setMessage('')
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      if (updateError) throw updateError
      setProfile({ ...profile, avatar_path: path })
      setMessage('تم تحديث الصورة.')
    } catch (error) { setMessage(errorMessage(error)) }
    finally { setBusy(false) }
  }

  if (!profile) return <div className="page-state">جاري تحميل الملف الشخصي…</div>
  const avatar = publicStorageUrl('profile-images', profile.avatar_path)

  return (
    <section className="panel profile-panel">
      <div className="section-heading"><div><div className="eyebrow">حسابك</div><h1>الملف الشخصي</h1></div>{avatar && <img className="avatar" src={avatar} alt="صورتك الشخصية" />}</div>
      <form className="form-grid" onSubmit={save}>
        <label>الاسم الكامل<input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></label>
        <label>الجامعة<input value={profile.university ?? ''} onChange={(e) => setProfile({ ...profile, university: e.target.value || null })} /></label>
        <label>القسم<input value={profile.department ?? ''} onChange={(e) => setProfile({ ...profile, department: e.target.value || null })} /></label>
        <label>المستوى<input value={profile.level ?? ''} onChange={(e) => setProfile({ ...profile, level: e.target.value || null })} /></label>
        <label className="wide">نبذة<textarea rows={4} value={profile.bio ?? ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value || null })} /></label>
        <label className="wide">الصورة الشخصية<input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void uploadAvatar(e.target.files[0])} /></label>
        <button className="button button-primary" disabled={busy}>حفظ التعديلات</button>
      </form>

      <div className="subsection">
        <h2>الإشعارات</h2>
        <p>فعّل Push Notifications لتلقي تحديثات السيشنات من المتصفح.</p>
        <div className="row-actions row-actions-start">
          <button className="button button-secondary" disabled={busy} onClick={() => user && void (async () => {
            setBusy(true); setMessage('')
            try { await enablePushNotifications(user.id); setMessage('تم تفعيل الإشعارات على هذا الجهاز.') }
            catch (error) { setMessage(errorMessage(error)) }
            finally { setBusy(false) }
          })()}>تفعيل الإشعارات</button>
          <button className="button button-ghost" disabled={busy} onClick={() => user && void (async () => {
            setBusy(true); setMessage('')
            try { await disablePushNotifications(user.id); setMessage('تم إيقاف الإشعارات على هذا الجهاز.') }
            catch (error) { setMessage(errorMessage(error)) }
            finally { setBusy(false) }
          })()}>إيقاف الإشعارات</button>
        </div>
      </div>
      {message && <p className="notice">{message}</p>}
    </section>
  )
}
