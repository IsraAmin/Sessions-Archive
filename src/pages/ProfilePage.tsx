import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase, publicStorageUrl } from '../lib/supabase'
import type { Profile } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { compressProfileImage } from '../lib/image'
import { useToast } from '../components/ToastProvider'

export function ProfilePage() {
  const { user } = useAuth()
  const { t, language } = useUi()
  const { showToast } = useToast()
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

  function failed(error: unknown) {
    showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!user || !profile) return
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: profile.full_name,
        university: profile.university,
        department: profile.department,
        level: profile.level,
        bio: profile.bio,
      }).eq('id', user.id)
      if (error) throw error
      showToast({ kind: 'success', title: t('common.success'), message: t('profile.saved') })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !user || !profile) return
    setBusy(true)
    try {
      const compressed = await compressProfileImage(file)
      const extension = compressed.file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(path, compressed.file, {
        upsert: true,
        contentType: compressed.file.type,
        cacheControl: '3600',
      })
      if (uploadError) throw uploadError
      const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      if (updateError) throw updateError
      setProfile({ ...profile, avatar_path: path })
      showToast({ kind: 'success', title: t('common.success'), message: language === 'ar' ? 'تم تحديث الصورة الشخصية.' : 'Profile photo updated.' })
    } catch (error) {
      failed(error)
    } finally {
      setBusy(false)
    }
  }

  if (!profile) return <div className="page-state">{message || t('common.loading')}</div>
  const avatar = publicStorageUrl('profile-images', profile.avatar_path)

  return <section className="panel profile-panel">
    <div className="profile-hero"><div><div className="eyebrow">{t('profile.eyebrow')}</div><h1>{t('profile.title')}</h1><p>{t('profile.subtitle')}</p></div><div className="profile-avatar-wrap">{avatar ? <img className="avatar avatar-large" src={avatar} alt={profile.full_name} /> : <div className="avatar avatar-large avatar-placeholder" aria-hidden="true">{profile.full_name.slice(0, 1)}</div>}</div></div>
    <form className="form-grid" onSubmit={save}>
      <label>{t('profile.fullName')}<input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></label>
      <label>{t('profile.university')}<input value={profile.university ?? ''} onChange={(e) => setProfile({ ...profile, university: e.target.value || null })} /></label>
      <label>{t('profile.department')}<input value={profile.department ?? ''} onChange={(e) => setProfile({ ...profile, department: e.target.value || null })} /></label>
      <label>{t('profile.level')}<input value={profile.level ?? ''} onChange={(e) => setProfile({ ...profile, level: e.target.value || null })} /></label>
      <label className="wide">{t('profile.bio')}<textarea rows={4} value={profile.bio ?? ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value || null })} /></label>
      <div className="wide profile-upload-card"><div><strong>{t('profile.photo')}</strong><p>{language === 'ar' ? 'اختاري صورة شخصية واضحة وسيتم تجهيزها تلقائيًا قبل الحفظ.' : 'Choose a clear profile photo. It will be prepared automatically before saving.'}</p></div><label className="button button-secondary profile-upload-button">{busy ? t('profile.preparing') : t('profile.choosePhoto')}<input type="file" accept="image/*" disabled={busy} onChange={(event) => void uploadAvatar(event)} /></label></div>
      <button className="button button-primary" disabled={busy}>{t('common.save')}</button>
    </form>
  </section>
}
