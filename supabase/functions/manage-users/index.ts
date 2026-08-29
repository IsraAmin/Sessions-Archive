import { withSupabase } from '@supabase/server'

type Action = 'list' | 'set_role' | 'ban' | 'unban'
type RequestBody = { action?: Action; user_id?: string; role?: 'admin' | 'student' }
type Activity = { registrations: number; feedback: number; video_progress: number }
type ProfileRow = {
  id: string
  full_name: string
  university: string | null
  department: string | null
  level: string | null
  bio: string | null
  avatar_path: string | null
  created_at: string
  updated_at: string
}
type DirectoryRow = {
  id: string
  email: string
  phone: string | null
  role: 'admin' | 'student'
  super_admin: boolean
  banned_until: string | null
  created_at: string
  updated_at: string | null
  last_sign_in_at: string | null
  email_confirmed_at: string | null
  phone_confirmed_at: string | null
  is_anonymous: boolean
  providers: string[] | null
}

function countByUser(rows: Array<{ user_id: string }> | null) {
  const counts = new Map<string, number>()
  for (const row of rows ?? []) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1)
  return counts
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

    const { data: authData, error: authError } = await ctx.supabase.auth.getUser()
    if (authError || !authData.user) return Response.json({ error: 'Authentication required' }, { status: 401 })

    const caller = authData.user
    const callerIsAdmin = caller.app_metadata?.role === 'admin'
    const callerIsSuperAdmin = caller.app_metadata?.super_admin === true
    if (!callerIsAdmin) return Response.json({ error: 'Admin access required' }, { status: 403 })

    let body: RequestBody
    try { body = await req.json() as RequestBody }
    catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }

    const action = body.action ?? 'list'

    if (action === 'list') {
      const [directory, registrations, feedback, progress, profiles] = await Promise.all([
        ctx.supabaseAdmin
          .from('user_directory')
          .select('id,email,phone,role,super_admin,banned_until,created_at,updated_at,last_sign_in_at,email_confirmed_at,phone_confirmed_at,is_anonymous,providers')
          .order('created_at', { ascending: false }),
        ctx.supabaseAdmin.from('registrations').select('user_id'),
        ctx.supabaseAdmin.from('feedback').select('user_id'),
        ctx.supabaseAdmin.from('video_progress').select('user_id'),
        ctx.supabaseAdmin.from('profiles').select('id,full_name,university,department,level,bio,avatar_path,created_at,updated_at'),
      ])

      const firstError = directory.error || registrations.error || feedback.error || progress.error || profiles.error
      if (firstError) return Response.json({ error: firstError.message }, { status: 500 })

      const registrationsByUser = countByUser(registrations.data)
      const feedbackByUser = countByUser(feedback.data)
      const progressByUser = countByUser(progress.data)
      const profilesByUser = new Map((profiles.data ?? []).map((profile) => [profile.id, profile as ProfileRow]))

      const users = ((directory.data ?? []) as DirectoryRow[]).map((account) => {
        const profile = profilesByUser.get(account.id) ?? null
        const activity: Activity = {
          registrations: registrationsByUser.get(account.id) ?? 0,
          feedback: feedbackByUser.get(account.id) ?? 0,
          video_progress: progressByUser.get(account.id) ?? 0,
        }

        return {
          ...account,
          providers: account.providers ?? [],
          full_name: profile?.full_name ?? '',
          profile,
          activity,
        }
      })

      return Response.json({ users })
    }

    if (!body.user_id) return Response.json({ error: 'user_id is required' }, { status: 400 })
    if (body.user_id === caller.id) return Response.json({ error: 'You cannot change your own access from this screen' }, { status: 400 })

    const { data: targetData, error: targetError } = await ctx.supabaseAdmin.auth.admin.getUserById(body.user_id)
    if (targetError || !targetData.user) return Response.json({ error: 'User not found' }, { status: 404 })
    if (targetData.user.app_metadata?.super_admin === true) return Response.json({ error: 'Super admin accounts cannot be changed here' }, { status: 403 })

    const target = targetData.user
    const targetLabel = target.email || target.phone || target.id

    async function recordActivity(activityAction: 'user_role_changed' | 'user_banned' | 'user_unbanned', details: Record<string, unknown> = {}) {
      const { error } = await ctx.supabaseAdmin
        .from('admin_activity_log')
        .insert({
          actor_user_id: caller.id,
          action: activityAction,
          entity_type: 'user',
          entity_id: target.id,
          entity_label: targetLabel,
          details,
        })
      if (error) console.error('Could not record admin user activity', error)
    }

    if (action === 'set_role') {
      if (!callerIsSuperAdmin) return Response.json({ error: 'Super admin access required for role changes' }, { status: 403 })
      if (body.role !== 'admin' && body.role !== 'student') return Response.json({ error: 'Invalid role' }, { status: 400 })
      const previousRole = target.app_metadata?.role === 'admin' ? 'admin' : 'student'
      const nextMetadata = { ...target.app_metadata, role: body.role }
      const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(body.user_id, { app_metadata: nextMetadata })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      await recordActivity('user_role_changed', { previous_role: previousRole, new_role: body.role })
      return Response.json({ ok: true })
    }

    if (action === 'ban' || action === 'unban') {
      const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(body.user_id, { ban_duration: action === 'ban' ? '876000h' : 'none' })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      await recordActivity(action === 'ban' ? 'user_banned' : 'user_unbanned')
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 })
  }),
}
