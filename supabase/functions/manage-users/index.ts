import { withSupabase } from '@supabase/server'

type Action = 'list' | 'set_role' | 'ban' | 'unban'
type RequestBody = { action?: Action; user_id?: string; role?: 'admin' | 'student' }
type Activity = { registrations: number; feedback: number; video_progress: number }

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
    if (caller.app_metadata?.super_admin !== true) return Response.json({ error: 'Super admin access required' }, { status: 403 })

    let body: RequestBody
    try { body = await req.json() as RequestBody }
    catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }

    const action = body.action ?? 'list'

    if (action === 'list') {
      const [{ data, error }, registrations, feedback, progress] = await Promise.all([
        ctx.supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        ctx.supabaseAdmin.from('registrations').select('user_id'),
        ctx.supabaseAdmin.from('feedback').select('user_id'),
        ctx.supabaseAdmin.from('video_progress').select('user_id'),
      ])
      if (error) return Response.json({ error: error.message }, { status: 500 })

      const registrationsByUser = countByUser(registrations.data)
      const feedbackByUser = countByUser(feedback.data)
      const progressByUser = countByUser(progress.data)

      const users = data.users.map((user) => {
        const activity: Activity = {
          registrations: registrationsByUser.get(user.id) ?? 0,
          feedback: feedbackByUser.get(user.id) ?? 0,
          video_progress: progressByUser.get(user.id) ?? 0,
        }
        return {
          id: user.id,
          email: user.email ?? '',
          full_name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '',
          role: user.app_metadata?.role === 'admin' ? 'admin' : 'student',
          super_admin: user.app_metadata?.super_admin === true,
          banned_until: user.banned_until ?? null,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at ?? null,
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

    if (action === 'set_role') {
      if (body.role !== 'admin' && body.role !== 'student') return Response.json({ error: 'Invalid role' }, { status: 400 })
      const nextMetadata = { ...targetData.user.app_metadata, role: body.role }
      const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(body.user_id, { app_metadata: nextMetadata })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ ok: true })
    }

    if (action === 'ban' || action === 'unban') {
      const { error } = await ctx.supabaseAdmin.auth.admin.updateUserById(body.user_id, { ban_duration: action === 'ban' ? '876000h' : 'none' })
      if (error) return Response.json({ error: error.message }, { status: 500 })
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 })
  }),
}
