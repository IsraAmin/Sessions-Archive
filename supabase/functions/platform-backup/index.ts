import { withSupabase } from '@supabase/server'

type BackupFile = {
  format: string
  version: number
  created_at: string
  project_ref?: string
  row_counts: Record<string, number>
  tables: Record<string, unknown[]>
  excluded?: string[]
}

type RequestBody = { action?: 'export' | 'restore'; backup?: BackupFile }

function projectRef() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  try { return new URL(url).hostname.split('.')[0] }
  catch { return '' }
}

function validBackup(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const backup = value as Partial<BackupFile>
  return backup.format === 'sessions-archive-platform-backup'
    && backup.version === 1
    && typeof backup.created_at === 'string'
    && Boolean(backup.tables && typeof backup.tables === 'object')
    && Boolean(backup.row_counts && typeof backup.row_counts === 'object')
}

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) => {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })

    const { data: authData, error: authError } = await ctx.supabase.auth.getUser()
    if (authError || !authData.user) return Response.json({ error: 'Authentication required' }, { status: 401 })
    if (authData.user.app_metadata?.super_admin !== true) {
      return Response.json({ error: 'Super admin access required' }, { status: 403 })
    }

    let body: RequestBody
    try { body = await req.json() as RequestBody }
    catch { return Response.json({ error: 'Invalid request body' }, { status: 400 }) }

    const action = body.action ?? 'export'
    const currentProjectRef = projectRef()

    if (action === 'export') {
      const { data, error } = await ctx.supabaseAdmin.rpc('export_platform_backup_v1')
      if (error || !data) return Response.json({ error: error?.message ?? 'Could not create backup' }, { status: 500 })

      const backup = data as BackupFile
      backup.project_ref = currentProjectRef
      return Response.json({ backup })
    }

    if (action === 'restore') {
      if (!validBackup(body.backup)) return Response.json({ error: 'Invalid Sessions Archive backup file' }, { status: 400 })
      if (!body.backup.project_ref || body.backup.project_ref !== currentProjectRef) {
        return Response.json({ error: 'This backup belongs to a different Supabase project' }, { status: 400 })
      }

      const { data, error } = await ctx.supabaseAdmin.rpc('restore_platform_backup_v1', { backup_data: body.backup })
      if (error) return Response.json({ error: error.message }, { status: 500 })

      const totalRows = Object.values(body.backup.row_counts ?? {}).reduce((sum, value) => sum + Number(value || 0), 0)
      return Response.json({ ok: true, restored_rows: totalRows, result: data })
    }

    return Response.json({ error: 'Unsupported action' }, { status: 400 })
  }),
}
