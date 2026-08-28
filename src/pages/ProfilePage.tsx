import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { supabase, publicStorageUrl } from '../lib/supabase'
import type { Profile } from '../types/domain'
import { errorMessage } from '../lib/errors'
import { disablePushNotifications, enablePushNotifications, getPushNotificationStatus, type PushStatus } from '../lib/push'
import { compressProfileImage, formatBytes } from '../lib/image'
import { useToast } from '../components/ToastProvider'

export function ProfilePage() {
  const { user } = useAuth()
  const { t } = useUi()
  const { showToast } = useToast()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [pushStatus, setPushStatus] = useState<PushStatus>('checking')
  const [compressionSummary, setCompressionSummary] = useState('')

  useEffect(() => {
    if (!user) return
    void supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data, error }) => { if (error) setMessage(error.message); else setProfile(data as Profile) })
    void getPushNotificationStatus().then(setPushStatus).catch(() => setPushStatus('default'))
  }, [user?.id])

  function failed(error: unknown) { showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) }) }

  async function save(event: FormEvent) {
    event.preventDefault(); if (!user || !profile) return
    setBusy(true)
    try {
      const { error } = await supabase.from('profiles').update({ full_name: profile.full_name, university: profile.university, department: profile.department, level: profile.level, bio: profile.bio }).eq('id', user.id)
      if (error) throw error
      showToast({ kind: 'success', title: t('common.success'), message: t('profile.saved') })
    } catch (error) { failed(error) } finally { setBusy(false) }
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file || !user || !profile) return
    setBusy(true); setCompressionSummary('')
    try {
      const compressed = await compressProfileImage(file)
      const extension = compressed.file.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${user.id}/avatar.${extension}`
      const { error: uploadError } = await supabase.storage.from('profile-images').upload(path, compressed.file, { upsert: true, contentType: compressed.file.type, cacheControl: '3600' })
      if (uploadError) throw uploadError
      const { error: updateError } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', user.id)
      if (updateError) throw updateError
      setProfile({ ...profile, avatar_path: path })
      setCompressionSummary(`${formatBytes(compressed.originalBytes)} ← ${formatBytes(compressed.compressedBytes)}`)
      showToast({ kind: 'success', title: t('common.success'), message: t('profile.photoSaved') })
    } catch (error) { failed(error) } finally { setBusy(false) }
  }

  async function turnOnPush() {
    if (!user) return; setBusy(true)
    try {
      await enablePushNotifications(user.id)
      setPushStatus('enabled')
      showToast({ kind: 'success', title: t('common.success'), message: t('profile.pushOn') })
    } catch (error) {
      try { setPushStatus(await getPushNotificationStatus()) }
      catch { setPushStatus('default') }
      failed(error)
    } finally { setBusy(false) }
  }

  async function turnOffPush() {
    if (!user) return; setBusy(true)
    try { await disablePushNotifications(user.id); setPushStatus(await getPushNotificationStatus()); showToast({ kind: 'success', title: t('common.success'), message: t('profile.pushOff') }) }
    catch (error) { failed(error) } finally { setBusy(false) }
  }

  if (!profile) return <div className="page-state">{message || t('common.loading')}</div>
  const avatar = publicStorageUrl('profile-images', profile.avatar_path)
  const pushCopy = pushStatus === 'enabled' ? t('profile.pushOn') : pushStatus === 'denied' ? t('profile.pushDenied') : pushStatus === 'unsupported' ? t('profile.pushUnsupported') : t('profile.pushOff')

  return <section className="panel profile-panel">
    <div className="profile-hero"><div><div className="eyebrow">{t('profile.eyebrow')}</div><h1>{t('profile.title')}</h1><p>{t('profile.subtitle')}</p></div><div className="profile-avatar-wrap">{avatar ? <img className="avatar avatar-large" src={avatar} alt={profile.full_name} /> : <div className="avatar avatar-large avatar-placeholder" aria-hidden="true">{profile.full_name.slice(0, 1)}</div>}<span className="image-limit-badge">≤ 50 KB</span></div></div>
    <form className="form-grid" onSubmit={save}>
      <label>{t('profile.fullName')}<input value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required /></label>
      <label>{t('profile.university')}<input value={profile.university ?? ''} onChange={(e) => setProfile({ ...profile, university: e.target.value || null })} /></label>
      <label>{t('profile.department')}<input value={profile.department ?? ''} onChange={(e) => setProfile({ ...profile, department: e.target.value || null })} /></label>
      <label>{t('profile.level')}<input value={profile.level ?? ''} onChange={(e) => setProfile({ ...profile, level: e.target.value || null })} /></label>
      <label className="wide">{t('profile.bio')}<textarea rows={4} value={profile.bio ?? ''} onChange={(e) => setProfile({ ...profile, bio: e.target.value || null })} /></label>
      <div className="wide profile-upload-card"><div><strong>{t('profile.photo')}</strong><p>{t('profile.photoHint')}</p>{compressionSummary && <small>{t('profile.lastCompression', { value: compressionSummary })}</small>}</div><label className="button button-secondary profile-upload-button">{busy ? t('profile.preparing') : t('profile.choosePhoto')}<input type="file" accept="image/*" disabled={busy} onChange={(event) => void uploadAvatar(event)} /></label></div>
      <button className="button button-primary" disabled={busy}>{t('common.save')}</button>
    </form>
    <div className="subsection notification-card"><div><h2>{t('profile.deviceNotifications')}</h2><p>{pushCopy}</p></div><div className="row-actions row-actions-start">{pushStatus !== 'enabled' && pushStatus !== 'unsupported' && <button type="button" className="button button-secondary" disabled={busy || pushStatus === 'denied'} onClick={() => void turnOnPush()}>{t('profile.enablePush')}</button>}{pushStatus === 'enabled' && <button type="button" className="button button-ghost" disabled={busy} onClick={() => void turnOffPush()}>{t('profile.disablePush')}</button>}</div></div>
  </section>
}
