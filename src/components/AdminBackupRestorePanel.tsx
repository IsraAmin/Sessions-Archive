import { useState, type ChangeEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useUi } from '../hooks/useUi'
import { useToast } from './ToastProvider'
import { errorMessage } from '../lib/errors'
import { Icon } from './Icon'

type BackupFile = {
  format: 'sessions-archive-platform-backup'
  version: 1
  created_at: string
  project_ref: string
  row_counts: Record<string, number>
  tables: Record<string, unknown[]>
  excluded?: string[]
}

function isBackupFile(value: unknown): value is BackupFile {
  if (!value || typeof value !== 'object') return false
  const backup = value as Partial<BackupFile>
  return backup.format === 'sessions-archive-platform-backup'
    && backup.version === 1
    && typeof backup.created_at === 'string'
    && typeof backup.project_ref === 'string'
    && Boolean(backup.row_counts && typeof backup.row_counts === 'object')
    && Boolean(backup.tables && typeof backup.tables === 'object')
}

function totalRows(backup: BackupFile | null) {
  if (!backup) return 0
  return Object.values(backup.row_counts).reduce((sum, value) => sum + Number(value || 0), 0)
}

function downloadName(createdAt: string) {
  const date = new Date(createdAt)
  const stamp = Number.isNaN(date.getTime())
    ? new Date().toISOString().replace(/[:.]/g, '-')
    : date.toISOString().replace(/[:.]/g, '-')
  return `sessions-archive-backup-${stamp}.json`
}

export function AdminBackupRestorePanel() {
  const { language } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const [exportBusy, setExportBusy] = useState(false)
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState('')
  const [backup, setBackup] = useState<BackupFile | null>(null)
  const [confirmation, setConfirmation] = useState('')

  function success(message: string) {
    showToast({ kind: 'success', title: ar ? 'تم بنجاح' : 'Success', message })
  }

  function fail(error: unknown) {
    showToast({ kind: 'error', title: ar ? 'تعذر التنفيذ' : 'Could not complete action', message: errorMessage(error) })
  }

  async function exportBackup() {
    setExportBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-backup', { body: { action: 'export' } })
      if (error) throw error
      const payload = data as { backup?: unknown; error?: string }
      if (payload.error) throw new Error(payload.error)
      if (!isBackupFile(payload.backup)) throw new Error(ar ? 'تعذر إنشاء ملف نسخة احتياطية صالح.' : 'A valid backup file could not be created.')

      const blob = new Blob([JSON.stringify(payload.backup, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName(payload.backup.created_at)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      success(ar ? `تم تصدير النسخة إلى جهازك (${totalRows(payload.backup)} سجل).` : `Backup exported to your device (${totalRows(payload.backup)} rows).`)
    } catch (error) {
      fail(error)
    } finally {
      setExportBusy(false)
    }
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setConfirmation('')
    setBackup(null)
    setSelectedFileName(file?.name ?? '')
    if (!file) return

    try {
      if (file.size > 25 * 1024 * 1024) throw new Error(ar ? 'حجم ملف النسخة أكبر من 25MB.' : 'The backup file is larger than 25MB.')
      const parsed = JSON.parse(await file.text()) as unknown
      if (!isBackupFile(parsed)) throw new Error(ar ? 'هذا الملف ليس نسخة احتياطية صالحة للمنصة.' : 'This is not a valid platform backup file.')
      setBackup(parsed)
    } catch (error) {
      event.target.value = ''
      setSelectedFileName('')
      fail(error)
    }
  }

  async function restoreBackup() {
    if (!backup) return
    const requiredConfirmation = ar ? 'استعادة' : 'RESTORE'
    if (confirmation.trim() !== requiredConfirmation) return

    setRestoreBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('platform-backup', { body: { action: 'restore', backup } })
      if (error) throw error
      const payload = data as { ok?: boolean; restored_rows?: number; error?: string }
      if (payload.error) throw new Error(payload.error)
      if (!payload.ok) throw new Error(ar ? 'لم تكتمل الاستعادة.' : 'Restore did not complete.')

      success(ar ? `تمت استعادة النسخة بنجاح (${payload.restored_rows ?? totalRows(backup)} سجل). حدّث الصفحة لرؤية البيانات المستعادة.` : `Backup restored successfully (${payload.restored_rows ?? totalRows(backup)} rows). Refresh to see the restored data.`)
      setConfirmation('')
    } catch (error) {
      fail(error)
    } finally {
      setRestoreBusy(false)
    }
  }

  const restoreWord = ar ? 'استعادة' : 'RESTORE'

  return <section className="panel section-gap admin-section admin-backup-panel">
    <div className="admin-backup-heading">
      <div>
        <span className="eyebrow">{ar ? 'حماية البيانات' : 'Data protection'}</span>
        <h2>{ar ? 'النسخ الاحتياطي والاستعادة' : 'Backup & restore'}</h2>
        <p>{ar ? 'صدّر نسخة من بيانات المنصة إلى جهازك، أو استعد نسخة سابقة عند الحاجة. هذه الأدوات متاحة للـ Super Admin فقط.' : 'Export platform data to your device or restore a previous backup. These tools are Super Admin only.'}</p>
      </div>
      <Icon name="shield" />
    </div>

    <div className="admin-backup-grid">
      <article className="admin-backup-card">
        <div className="admin-backup-card-head"><span className="admin-backup-icon"><Icon name="download" /></span><div><h3>{ar ? 'تصدير نسخة احتياطية' : 'Export backup'}</h3><p>{ar ? 'ينشئ ملف JSON مؤرخ ويحفظه مباشرة على جهازك.' : 'Creates a dated JSON backup and saves it directly to your device.'}</p></div></div>
        <ul className="admin-backup-points">
          <li>{ar ? 'يشمل محتوى المنصة والمستخدمين والتفاعلات والإشعارات والاشتراكات.' : 'Includes platform content, users, interactions, notifications, and subscriptions.'}</li>
          <li>{ar ? 'لا يحتوي على كلمات مرور Auth أو مفاتيح الخادم السرية أو ملفات Storage نفسها.' : 'Does not include Auth passwords, server secrets, or Storage file contents.'}</li>
        </ul>
        <button className="button button-primary" onClick={() => void exportBackup()} disabled={exportBusy || restoreBusy}>{exportBusy ? (ar ? 'جارٍ تجهيز النسخة…' : 'Preparing backup…') : (ar ? 'تنزيل النسخة على جهازي' : 'Download backup')}</button>
      </article>

      <article className="admin-backup-card admin-backup-restore-card">
        <div className="admin-backup-card-head"><span className="admin-backup-icon"><Icon name="upload" /></span><div><h3>{ar ? 'استعادة نسخة' : 'Restore backup'}</h3><p>{ar ? 'اختر ملف نسخة صادر من هذه المنصة. الاستعادة تستبدل البيانات الحالية.' : 'Choose a backup exported by this platform. Restore replaces current data.'}</p></div></div>

        <label className="admin-backup-file">
          <span>{ar ? 'اختيار ملف النسخة' : 'Choose backup file'}</span>
          <input type="file" accept="application/json,.json" onChange={event => void selectBackup(event)} disabled={restoreBusy || exportBusy} />
          <strong>{selectedFileName || (ar ? 'لم يتم اختيار ملف' : 'No file selected')}</strong>
        </label>

        {backup && <div className="admin-backup-preview">
          <div><span>{ar ? 'تاريخ النسخة' : 'Backup date'}</span><strong>{new Intl.DateTimeFormat(ar ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(backup.created_at))}</strong></div>
          <div><span>{ar ? 'إجمالي السجلات' : 'Total rows'}</span><strong>{totalRows(backup)}</strong></div>
          <div><span>{ar ? 'عدد الجداول' : 'Tables'}</span><strong>{Object.keys(backup.tables).length}</strong></div>
        </div>}

        {backup && <div className="admin-backup-danger">
          <strong>{ar ? 'تأكيد الاستعادة' : 'Confirm restore'}</strong>
          <p>{ar ? `لمنع الاستعادة بالخطأ، اكتب كلمة «${restoreWord}» ثم اضغط الزر.` : `To prevent accidental restore, type “${restoreWord}” and then press the button.`}</p>
          <input value={confirmation} onChange={event => setConfirmation(event.target.value)} placeholder={restoreWord} autoComplete="off" />
          <button className="button danger" onClick={() => void restoreBackup()} disabled={restoreBusy || exportBusy || confirmation.trim() !== restoreWord}>{restoreBusy ? (ar ? 'جارٍ استعادة البيانات…' : 'Restoring data…') : (ar ? 'استعادة هذه النسخة' : 'Restore this backup')}</button>
        </div>}
      </article>
    </div>
  </section>
}
