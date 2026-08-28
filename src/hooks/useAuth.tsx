import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { disablePushNotifications } from '../lib/push'

type AuthContextValue = {
  session: Session | null
  user: User | null
  loading: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function appBaseUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).toString()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    // The Supabase client initializes persisted auth automatically and emits
    // INITIAL_SESSION. Avoid an extra getSession() during mount because it can
    // queue behind a stale browser auth lock left by an older tab/build.
    const fallbackTimer = window.setTimeout(() => {
      if (active) setLoading(false)
    }, 1500)

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      window.clearTimeout(fallbackTimer)
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      window.clearTimeout(fallbackTimer)
      listener.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    isAdmin: session?.user?.app_metadata?.role === 'admin',
    isSuperAdmin: session?.user?.app_metadata?.super_admin === true,
    signIn: async (email, password) => {
      setLoading(true)
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        if (!data.session) throw new Error('تعذر إنشاء جلسة تسجيل الدخول. حاولي مرة أخرى.')

        // Do not wait for a secondary auth event before allowing protected
        // routes to render. The successful password response already contains
        // the authoritative session.
        setSession(data.session)
      } finally {
        setLoading(false)
      }
    },
    signUp: async (email, password, fullName) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: appBaseUrl(),
        },
      })
      if (error) throw error
      if (data.session) setSession(data.session)
    },
    signOut: async () => {
      const userId = session?.user.id

      // Push cleanup is best-effort and must never block signing out.
      if (userId) {
        void disablePushNotifications(userId).catch((error) => {
          console.warn('Push cleanup during sign out failed', error)
        })
      }

      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error

      setSession(null)
      setLoading(false)
    },
  }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
