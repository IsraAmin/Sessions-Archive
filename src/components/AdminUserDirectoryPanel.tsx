import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { publicStorageUrl, supabase } from '../lib/supabase'
import { errorMessage } from '../lib/errors'
import type { Profile } from '../types/domain'
import { useToast } from './ToastProvider'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'

type ManagedUser = {
  id: string
  email: string
  phone: string | null
  full_name: string
  role: 'admin' | 'student'
  super_admin: boolean
  banned_until: string | null
  created_at: string
  updated_at: string | null
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  is_anonymous: boolean
  providers: string[]
  profile: Profile | null
  activity: { registrations: number; feedback: number; video_progress: number }
}

type PendingAction = { user: ManagedUser; action: 'ban' | 'unban' } | null

export function AdminUserDirectoryPanel() {
  const { isAdmin, isSuperAdmin } = useAuth()
  const { language, locale, t } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)
  const [actionBusy, setActionBusy] = useState(false)

  async function loadUsers() {
    if (!isAdmin || isSuperAdmin) return
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: 'list' } })
      if (error) throw error
      const payload = data as { users?: ManagedUser[]; error?: string }
      if (payload.error) throw new Error(payload.error)
      setUsers(payload.users ?? [])
    } catch (error) {
      showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
    } finally { setLoading(false) }
  }

  useEffect(() => { void loadUsers() }, [isAdmin, isSuperAdmin])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter((account) => [
      account.full_name,
      account.email,
      account.phone,
      account.profile?.university,
      account.profile?.department,
      account.profile?.level,
    ].some((value) => String(value ?? '').toLowerCase().includes(q)))
  }, [users, search])

  const selected = users.find((account) => account.id === selectedId) ?? null
  if (!isAdmin || isSuperAdmin) return null

  async function executeAction() {
    if (!pending) return
    setActionBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-users', { body: { action: pending.action, user_id: pending.user.id } })
      if (error) throw error
      const payload = data as { error?: string }
      if (payload.error) throw new Error(payload.error)
      showToast({ kind: 'success', title: t('common.success'), message: pending.action === 'ban' ? (ar ? 'تم تعطيل الحساب.' : 'Account disabled.') : (ar ? 'تم تفعيل الحساب.' : 'Account enabled.') })
      setPending(null)
      await loadUsers()
    } catch (error) {
      showToast({ kind: 'error', title: t('common.error'), message: errorMessage(error) })
    } finally { setActionBusy(false) }
  }

  return <section className="panel section-gap admin-section admin-user-directory-panel">
    <div className="admin-v3-section-head">
      <div>
        <span className="eyebrow">{ar ? 'إدارة المستخدمين' : 'User management'}</span>
        <h2>{ar ? 'حسابات المستخدمين' : 'User accounts'}</h2>
        <p>{ar ? 'يمكنك عرض الحسابات وإدارة حالتها. ترقية المستخدم إلى Admin متاحة للسوبر أدمن فقط.' : 'View accounts and manage account status. Promoting users to Admin is reserved for the Super Admin.'}</p>
      </div>
      <Icon name="users" />
    </div>

    <div className="user-directory-toolbar">
      <label className="form-field user-search-field">
        <span className="field-label">{ar ? 'البحث في المستخدمين' : 'Search users'}</span>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ar ? 'الاسم، البريد، الجامعة أو القسم' : 'Name, email, university or department'} />
      </label>
      <span className="user-result-count">{filtered.length} {ar ? 'حساب' : 'accounts'}</span>
    </div>

    <div className="user-management-list">
      {filtered.map((account) => {
        const banned = Boolean(account.banned_until && new Date(account.banned_until).getTime() > Date.now())
        const avatar = account.profile?.avatar_path ? publicStorageUrl('profile-images', account.profile.avatar_path) : null
        return <article className="user-management-row" key={account.id}>
          <div className="user-identity">
            {avatar ? <img className="user-list-avatar" src={avatar} alt="" /> : <span className="sidebar-user-avatar">{(account.full_name || account.email || 'U').slice(0, 1).toUpperCase()}</span>}
            <span><strong>{account.full_name || account.email}</strong><small>{account.email}</small></span>
          </div>
          <div className="user-role">
            <span className={`role-pill ${account.super_admin ? 'super' : account.role}`}>{account.super_admin ? 'Super Admin' : account.role === 'admin' ? 'Admin' : (ar ? 'مستخدم' : 'User')}</span>
            {banned && <span className="role-pill banned">{ar ? 'معطّل' : 'Disabled'}</span>}
          </div>
          <div className="user-activity"><small>{ar ? 'النشاط' : 'Activity'}</small><span>{account.activity.feedback} {ar ? 'تقييم' : 'feedback'} · {account.activity.video_progress} {ar ? 'فيديو' : 'videos'}</span></div>
          <div className="user-management-actions">
            <button type="button" className="button user-action user-action-view" onClick={() => setSelectedId(account.id)}>{ar ? 'عرض التفاصيل' : 'View details'}</button>
            {!account.super_admin && (banned
              ? <button type="button" className="button user-action user-action-enable" onClick={() => setPending({ user: account, action: 'unban' })}>{ar ? 'تفعيل الحساب' : 'Enable'}</button>
              : <button type="button" className="button user-action user-action-disable" onClick={() => setPending({ user: account, action: 'ban' })}>{ar ? 'تعطيل الحساب' : 'Disable'}</button>)}
          </div>
        </article>
      })}
      {loading && !users.length && <div className="page-state">{t('common.loading')}</div>}
      {!loading && !filtered.length && <div className="empty-state">{ar ? 'لا توجد حسابات مطابقة للبحث.' : 'No accounts match your search.'}</div>}
    </div>

    {selected && (() => {
      const avatar = selected.profile?.avatar_path ? publicStorageUrl('profile-images', selected.profile.avatar_path) : null
      return <div className="user-detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedId(null) }}>
        <aside className="user-detail-drawer" role="dialog" aria-modal="true">
          <header className="user-detail-head">
            <div className="user-detail-identity">
              {avatar ? <img className="user-detail-avatar" src={avatar} alt="" /> : <span className="user-detail-avatar">{(selected.full_name || selected.email).slice(0, 1).toUpperCase()}</span>}
              <div><h2>{selected.full_name || selected.email}</h2><p>{selected.email}</p></div>
            </div>
            <button type="button" className="user-detail-close" aria-label={t('common.close')} onClick={() => setSelectedId(null)}><Icon name="close" /></button>
          </header>
          <section className="user-detail-section"><h3>{ar ? 'بيانات الحساب' : 'Account details'}</h3><div className="user-detail-grid">
            <div className="user-data-cell"><span>Email</span><strong>{selected.email}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'تأكيد البريد' : 'Email verified'}</span><strong>{selected.email_confirmed_at ? (ar ? 'مؤكد' : 'Verified') : (ar ? 'غير مؤكد' : 'Not verified')}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'الهاتف' : 'Phone'}</span><strong>{selected.phone || '—'}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'الدور' : 'Role'}</span><strong>{selected.super_admin ? 'Super Admin' : selected.role}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'إنشاء الحساب' : 'Created'}</span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(selected.created_at))}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'آخر دخول' : 'Last sign in'}</span><strong>{selected.last_sign_in_at ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(selected.last_sign_in_at)) : '—'}</strong></div>
          </div></section>
          <section className="user-detail-section"><h3>{ar ? 'البروفايل' : 'Profile'}</h3><div className="user-detail-grid">
            <div className="user-data-cell"><span>{ar ? 'الاسم' : 'Name'}</span><strong>{selected.profile?.full_name || selected.full_name || '—'}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'الجامعة' : 'University'}</span><strong>{selected.profile?.university || '—'}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'القسم' : 'Department'}</span><strong>{selected.profile?.department || '—'}</strong></div>
            <div className="user-data-cell"><span>{ar ? 'المستوى' : 'Level'}</span><strong>{selected.profile?.level || '—'}</strong></div>
            <div className="user-data-cell wide"><span>{ar ? 'النبذة' : 'Bio'}</span><p>{selected.profile?.bio || '—'}</p></div>
          </div></section>
        </aside>
      </div>
    })()}

    <ConfirmDialog
      open={Boolean(pending)}
      title={pending?.action === 'ban' ? (ar ? 'تعطيل الحساب؟' : 'Disable account?') : (ar ? 'إعادة تفعيل الحساب؟' : 'Enable account?')}
      description={pending?.action === 'ban' ? (ar ? `لن يتمكن ${pending?.user.full_name || pending?.user.email || 'المستخدم'} من تسجيل الدخول حتى إعادة تفعيل الحساب.` : 'This user will not be able to sign in until the account is enabled again.') : (ar ? 'سيتمكن المستخدم من تسجيل الدخول مرة أخرى.' : 'The user will be able to sign in again.')}
      confirmLabel={pending?.action === 'ban' ? (ar ? 'نعم، تعطيل' : 'Disable') : (ar ? 'نعم، تفعيل' : 'Enable')}
      cancelLabel={ar ? 'إلغاء' : 'Cancel'}
      tone={pending?.action === 'ban' ? 'danger' : 'primary'}
      busy={actionBusy}
      onCancel={() => !actionBusy && setPending(null)}
      onConfirm={() => void executeAction()}
    />
  </section>
}
