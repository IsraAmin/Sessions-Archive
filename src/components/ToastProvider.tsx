import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

type ToastKind = 'success' | 'error' | 'info'
type Toast = { id: number; kind: ToastKind; title: string; message?: string }
type ToastContextValue = { showToast: (toast: Omit<Toast, 'id'>) => void }

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = nextId.current++
    setToasts((current) => [...current, { ...toast, id }].slice(-4))
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 3600)
  }, [])

  const value = useMemo(() => ({ showToast }), [showToast])

  return <ToastContext.Provider value={value}>
    {children}
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`app-toast app-toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <div className="toast-icon"><Icon name={toast.kind === 'error' ? 'error' : 'check'} /></div>
          <div className="toast-copy"><strong>{toast.title}</strong>{toast.message && <span>{toast.message}</span>}</div>
          <button className="toast-close" aria-label="Close" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}>×</button>
        </div>
      ))}
    </div>
  </ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
