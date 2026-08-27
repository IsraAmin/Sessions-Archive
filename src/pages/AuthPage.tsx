import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { useToast } from '../components/ToastProvider'

function authErrorMessage(error: unknown, language: 'ar' | 'en') {
  const base = errorMessage(error)
  const code = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
  const rateLimited = code === 'over_email_send_rate_limit' || /email rate limit/i.test(base)
  if (rateLimited) {
    return language === 'ar'
      ? 'خدمة إرسال رسائل التأكيد وصلت للحد المؤقت. الحساب لم يكتمل الآن. جرّبي بعد فترة قصيرة؛ وسيتم رفع هذا الحد عند تفعيل خدمة البريد المخصصة للمنصة.'
      : 'The confirmation email service has reached its temporary limit. The account was not completed. Try again shortly; this limit will be lifted once the platform uses custom email delivery.'
  }
  return base
}

export function AuthPage() {
  const { user, signIn, signUp } = useAuth()
  const { t, language } = useUi()
  const { showToast } = useToast()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      if (mode === 'signin') {
        await signIn(email, password)
        showToast({ kind: 'success', title: t('common.success'), message: t('auth.signIn') })
      } else {
        await signUp(email, password, fullName)
        setMessage(t('auth.checkEmail'))
        showToast({ kind: 'success', title: t('common.success'), message: t('auth.checkEmail') })
      }
    } catch (error) {
      const friendly = authErrorMessage(error, language)
      setMessage(friendly)
      showToast({ kind: 'error', title: t('common.error'), message: friendly })
    } finally { setBusy(false) }
  }

  return <section className="auth-panel panel narrow auth-panel-v2">
    <div className="eyebrow">{t('auth.welcome')}</div><h1>{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</h1>
    <form onSubmit={submit} className="stack">
      {mode === 'signup' && <label>{t('auth.fullName')}<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>}
      <label>{t('auth.email')}<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>{t('auth.password')}<input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="button button-primary" disabled={busy}>{busy ? t('auth.signing') : mode === 'signin' ? t('auth.signIn') : t('auth.create')}</button>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    <button className="link-button" onClick={() => { setMessage(''); setMode(mode === 'signin' ? 'signup' : 'signin') }}>{mode === 'signin' ? t('auth.noAccount') : t('auth.hasAccount')}</button>
  </section>
}
