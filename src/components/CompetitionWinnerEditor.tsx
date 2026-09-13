import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { CompetitionWinner } from '../types/domain'
import { useToast } from './ToastProvider'

function optionalText(value: FormDataEntryValue | null) {
  return String(value || '').trim() || null
}

function optionalNumber(value: FormDataEntryValue | null) {
  const text = String(value || '').trim()
  if (!text) return null
  const number = Number(text)
  return Number.isFinite(number) ? number : null
}

function isPublicUrl(value: string | null) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function CompetitionWinnerEditor({ winner, ar, busy, onSaved, onDelete }: {
  winner: CompetitionWinner
  ar: boolean
  busy: boolean
  onSaved: () => Promise<void>
  onDelete: () => void
}) {
  const { showToast } = useToast()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  async function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    const values = new FormData(formEvent.currentTarget)
    const entryName = String(values.get('entry_name') || '').trim()
    const projectUrl = optionalText(values.get('project_url'))
    if (!entryName) {
      showToast({ kind: 'error', title: ar ? 'تعذر الحفظ' : 'Could not save', message: ar ? 'اسم الفائز أو الفريق مطلوب.' : 'Winner or team name is required.' })
      return
    }
    if (!isPublicUrl(projectUrl)) {
      showToast({ kind: 'error', title: ar ? 'تعذر الحفظ' : 'Could not save', message: ar ? 'رابط المشروع غير صالح.' : 'Project URL is invalid.' })
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('competition_winners').update({
        rank: optionalNumber(values.get('rank')),
        award_title: optionalText(values.get('award_title')),
        entry_name: entryName,
        members: optionalText(values.get('members')),
        project_title: optionalText(values.get('project_title')),
        prize: optionalText(values.get('prize')),
        project_url: projectUrl,
        updated_at: new Date().toISOString(),
      }).eq('id', winner.id)
      if (error) throw error
      await onSaved()
      setEditing(false)
      showToast({ kind: 'success', title: ar ? 'تم الحفظ' : 'Saved', message: ar ? 'تم تحديث بيانات الفائز، حتى لو كانت النتائج منشورة.' : 'Winner details were updated, even with published results.' })
    } catch (error) {
      showToast({ kind: 'error', title: ar ? 'تعذر الحفظ' : 'Could not save', message: errorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  if (editing) return <form className="competition-winner-form" onSubmit={save}>
    <div className="admin-event-two">
      <label><span>{ar ? 'المركز' : 'Rank'}</span><input name="rank" type="number" min="1" max="100" defaultValue={winner.rank ?? ''} /></label>
      <label><span>{ar ? 'اسم الجائزة' : 'Award label'}</span><input name="award_title" defaultValue={winner.award_title ?? ''} /></label>
    </div>
    <label><span>{ar ? 'اسم الفائز أو الفريق' : 'Winner / team name'}</span><input name="entry_name" required defaultValue={winner.entry_name} /></label>
    <label><span>{ar ? 'أعضاء الفريق' : 'Team members'}</span><textarea name="members" rows={2} defaultValue={winner.members ?? ''} /></label>
    <div className="admin-event-two">
      <label><span>{ar ? 'اسم المشروع' : 'Project title'}</span><input name="project_title" defaultValue={winner.project_title ?? ''} /></label>
      <label><span>{ar ? 'الجائزة' : 'Prize'}</span><input name="prize" defaultValue={winner.prize ?? ''} /></label>
    </div>
    <label><span>{ar ? 'رابط المشروع — اختياري' : 'Project URL — optional'}</span><input name="project_url" type="url" defaultValue={winner.project_url ?? ''} /></label>
    <div className="admin-event-form-actions">
      <button className="button button-primary" disabled={saving || busy}>{saving ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'حفظ التعديل' : 'Save changes')}</button>
      <button className="button" type="button" onClick={() => setEditing(false)} disabled={saving}>{ar ? 'إلغاء' : 'Cancel'}</button>
    </div>
  </form>

  return <article>
    <span className="competition-admin-rank">{winner.rank ? `#${winner.rank}` : '★'}</span>
    <div><strong dir="auto">{winner.entry_name}</strong><small dir="auto">{winner.award_title || winner.project_title || (ar ? 'فائز' : 'Winner')}</small>{winner.members && <p dir="auto">{winner.members}</p>}</div>
    <div className="admin-event-form-actions">
      <button className="text-action" type="button" onClick={() => setEditing(true)} disabled={busy}>{ar ? 'تعديل' : 'Edit'}</button>
      <button className="text-action danger-text" type="button" onClick={onDelete} disabled={busy}>{ar ? 'حذف' : 'Delete'}</button>
    </div>
  </article>
}
