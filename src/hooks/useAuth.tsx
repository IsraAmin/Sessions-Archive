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

function authTimeout() {
  const error = new Error('Authentication request timed out') as Error & { code?: string }
  error.code = 'auth_request_timeout'
  return error
}

async function withAuthTimeout<T>(operation: Promise<T>, milliseconds = 15000): Promise<T> {
  let timer = 0
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timer = window.setTimeout(() => reject(authTimeout()), milliseconds)
      }),
    ])
  } finally {
    if (timer) window.clearTimeout(timer)
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function hydrateSession() {
      try {
        // getSession already refreshes an expired session when necessary.
        // Calling refreshSession again here can contend with a password sign-in
        // for the same browser auth lock and leave the form waiting indefinitely.
        const { data, error } = await supabase.auth.getSession()
        if (!active) return
        setSession(error ? null : data.session)
      } catch (error) {
        console.warn('Session hydration failed', error)
        if (active) setSession(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    void hydrateSession()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
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
      const { error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }))
      if (error) throw error
    },
    signUp: async (email, password, fullName) => {
      const { error } = await withAuthTimeout(supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: appBaseUrl(),
        },
      }))
      if (error) throw error
    },
    signOut: async () => {
      const userId = session?.user.id
      if (userId) {
        try { await disablePushNotifications(userId) }
        catch (error) { console.warn('Push cleanup during sign out failed', error) }
      }
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }), [session, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
