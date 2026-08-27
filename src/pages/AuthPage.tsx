import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUi } from '../hooks/useUi'
import { errorMessage } from '../lib/errors'
import { useToast } from '../components/ToastProvider'

export function AuthPage() {
  const { user, signIn, signUp } = useAuth()
  const { t } = useUi()
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
      const message = errorMessage(error); setMessage(message); showToast({ kind: 'error', title: t('common.error'), message })
    } finally { setBusy(false) }
  }

  return <section className="auth-panel panel narrow auth-panel-v2">
    <div className="eyebrow">{t('auth.welcome')}</div><h1>{mode === 'signin' ? t('auth.signIn') : t('auth.signUp')}</h1>
    <form onSubmit={submit} className="stack">
      {mode === 'signup' && <label>{t('auth.fullName')}<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>}
      <label>{t('auth.email')}<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>{t('auth.password')}<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="button button-primary" disabled={busy}>{busy ? t('auth.signing') : mode === 'signin' ? t('auth.signIn') : t('auth.create')}</button>
    </form>
    {message && <p className="notice" role="status">{message}</p>}
    <button className="link-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? t('auth.noAccount') : t('auth.hasAccount')}</button>
  </section>
}
