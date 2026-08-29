import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    storageKey: 'sessions-archive-auth-v2',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // AuthProvider initializes the client before registering state listeners.
    // This avoids a startup race where signInWithPassword waits forever for
    // an initialization promise that never settles.
    skipAutoInitialize: true,
  },
})

// Public catalog reads must not depend on the signed-in user's access token.
// This keeps sessions/categories available while an authenticated session is
// refreshing and prevents a transient JWT timing error from hiding public data.
export const publicSupabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    skipAutoInitialize: true,
  },
})

export function publicStorageUrl(bucket: string, path: string | null) {
  if (!path) return null
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
