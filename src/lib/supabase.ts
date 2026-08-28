import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabasePublishableKey, {
  auth: {
    // Use an app-owned storage namespace. This avoids inheriting a stale auth
    // lock/session namespace from older builds that may still be open in
    // another browser tab. Users sign in once after this migration and future
    // tabs continue sharing the same healthy session normally.
    storageKey: 'sessions-archive-auth-v2',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export function publicStorageUrl(bucket: string, path: string | null) {
  if (!path) return null
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}
