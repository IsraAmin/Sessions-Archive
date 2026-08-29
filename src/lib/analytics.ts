import { supabase } from './supabase'

const VISITOR_KEY = 'archive-repeat-visitor-v1'

function getVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    window.localStorage.setItem(VISITOR_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

export async function recordPlatformVisit() {
  if (typeof window === 'undefined') return

  const firstPath = `${window.location.pathname}${window.location.search}`.slice(0, 300) || '/'
  const visitorId = getVisitorId()
  const visitId = crypto.randomUUID()

  const { error } = await (supabase as any)
    .from('platform_visits')
    .insert({
      visitor_id: visitorId,
      visit_id: visitId,
      first_path: firstPath.startsWith('/') && !firstPath.startsWith('//') ? firstPath : '/',
    })

  if (error) console.warn('Platform visit tracking failed', error)
}
