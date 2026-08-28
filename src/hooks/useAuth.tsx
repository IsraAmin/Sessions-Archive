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
    let pendingTimer = 0

    // Supabase emits INITIAL_SESSION after the client has loaded the persisted
    // session. Keeping the callback synchronous and deferring React state work
    // ensures downstream effects cannot issue Supabase calls while the auth
    // client is still holding its internal lock.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      if (pendingTimer) window.clearTimeout(pendingTimer)
      pendingTimer = window.setTimeout(() => {
        if (!active) return
        setSession(nextSession)
        setLoading(false)
      }, 0)
    })

    return () => {
      active = false
      if (pendingTimer) window.clearTimeout(pendingTimer)
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
      // Do not race this promise against a UI-only timeout. A rejected race did
      // not cancel the underlying auth request and could leave the browser auth
      // lock occupied, making every later Supabase request appear to hang.
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    signUp: async (email, password, fullName) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: appBaseUrl(),
        },
      })
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
