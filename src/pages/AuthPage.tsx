import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { errorMessage } from '../lib/errors'

export function AuthPage() {
  const { user, signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to="/dashboard" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'signin') await signIn(email, password)
      else {
        await signUp(email, password, fullName)
        setMessage('تم إنشاء الحساب. افحص بريدك إذا كان تأكيد البريد مفعّلًا.')
      }
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="auth-panel panel narrow">
      <div className="eyebrow">مرحبًا بك</div>
      <h1>{mode === 'signin' ? 'تسجيل الدخول' : 'إنشاء حساب'}</h1>
      <form onSubmit={submit} className="stack">
        {mode === 'signup' && (
          <label>الاسم الكامل<input value={fullName} onChange={(e) => setFullName(e.target.value)} required /></label>
        )}
        <label>البريد الإلكتروني<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>كلمة المرور<input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button className="button button-primary" disabled={busy}>{busy ? 'جاري التنفيذ…' : mode === 'signin' ? 'دخول' : 'إنشاء الحساب'}</button>
      </form>
      {message && <p className="notice">{message}</p>}
      <button className="link-button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'ليس لديك حساب؟ أنشئ واحدًا' : 'لديك حساب؟ سجل الدخول'}
      </button>
    </section>
  )
}
