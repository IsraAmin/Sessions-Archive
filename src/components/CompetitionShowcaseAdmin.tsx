import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { CompetitionEntry, CompetitionEntryLink, CompetitionWinner } from '../types/domain'
import { useToast } from './ToastProvider'
import { useUi } from '../hooks/useUi'

type Props = {
  eventId: string
  resultsPublished: boolean
  showcasePublished: boolean
  winners: CompetitionWinner[]
}

function optionalText(value: FormDataEntryValue | null) {
  return String(value || '').trim() || null
}

function validUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

function linkName(url: string, custom: string | null) {
  if (custom?.trim()) return custom.trim()
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'YouTube'
    if (host.endsWith('drive.google.com')) return 'Google Drive'
    if (host === 't.me' || host.endsWith('telegram.me')) return 'Telegram'
    if (host.endsWith('github.com')) return 'GitHub'
    if (host.endsWith('figma.com')) return 'Figma'
    return host
  } catch {
    return url
  }
}

export function CompetitionShowcaseAdmin({ eventId, resultsPublished, showcasePublished, winners }: Props) {
  const { language } = useUi()
  const { showToast } = useToast()
  const ar = language === 'ar'
  const db = supabase as any
  const [entries, setEntries] = useState<CompetitionEntry[]>([])
  const [links, setLinks] = useState<CompetitionEntryLink[]>([])
  const [published, setPublished] = useState(showcasePublished)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => setPublished(showcasePublished), [showcasePublished])

  async function load() {
    setLoading(true)
    try {
      const { data, error } = await db.from('competition_entries').select('*').eq('event_id', eventId).order('position').order('created_at')
      if (error) throw error
      const nextEntries = (data ?? []) as CompetitionEntry[]
      setEntries(nextEntries)
      if (!nextEntries.length) {
        setLinks([])
        return
      }
      const linkResult = await db.from('competition_entry_links').select('*').in('entry_id', nextEntries.map((entry) => entry.id)).order('position').order('created_at')
      if (linkResult.error) throw linkResult.error
      setLinks((linkResult.data ?? []) as CompetitionEntryLink[])
    } catch (error) {
      showToast({ kind: 'error', title: ar ? 'تعذر تحميل المشاركات' : 'Could not load entries', message: errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [eventId])

  const linksByEntry = useMemo(() => {
    const map = new Map<string, CompetitionEntryLink[]>()
    for (const link of links) {
      const current = map.get(link.entry_id) ?? []
      current.push(link)
      map.set(link.entry_id, current)
    }
    return map
  }, [links])

  async function addEntry(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    if (!resultsPublished) return
    const form = formEvent.currentTarget
    const values = new FormData(form)
    const teamName = String(values.get('team_name') || '').trim()
    const workTitle = String(values.get('work_title') || '').trim()
    const rawLinks = String(values.get('links') || '')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean)

    if (!teamName || !workTitle) {
      showToast({ kind: 'error', title: ar ? 'بيانات ناقصة' : 'Missing details', message: ar ? 'اسم الفريق واسم المشروع/العمل مطلوبان.' : 'Team name and work title are required.' })
      return
    }
    const invalid = rawLinks.find((url) => !validUrl(url))
    if (invalid) {
      showToast({ kind: 'error', title: ar ? 'رابط غير صالح' : 'Invalid link', message: ar ? `راجعي هذا الرابط: ${invalid}` : `Check this URL: ${invalid}` })
      return
    }

    setBusy(true)
    let createdId = ''
    try {
      const position = entries.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const { data, error } = await db.from('competition_entries').insert({
        event_id: eventId,
        winner_id: optionalText(values.get('winner_id')),
        team_name: teamName,
        leader_name: optionalText(values.get('leader_name')),
        members: optionalText(values.get('members')),
        work_title: workTitle,
        work_type: optionalText(values.get('work_type')),
        track: optionalText(values.get('track')),
        description: optionalText(values.get('description')),
        position,
      }).select('*').single()
      if (error || !data) throw error ?? new Error('Could not create entry')
      createdId = data.id

      if (rawLinks.length) {
        const { error: linksError } = await db.from('competition_entry_links').insert(rawLinks.map((url, index) => ({
          entry_id: data.id,
          link_url: url,
          label: null,
          position: index + 1,
        })))
        if (linksError) {
          await db.from('competition_entries').delete().eq('id', data.id)
          createdId = ''
          throw linksError
        }
      }

      form.reset()
      showToast({ kind: 'success', title: ar ? 'تمت إضافة المشاركة' : 'Entry added', message: ar ? 'اتحفظ الفريق ومشروعه كمسودة داخل الأرشيف.' : 'The team and its work were saved as a showcase draft.' })
      await load()
    } catch (error) {
      if (createdId) console.warn('Competition entry partially created before cleanup', createdId)
      showToast({ kind: 'error', title: ar ? 'تعذر إضافة المشاركة' : 'Could not add entry', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function addLink(entryId: string, formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault()
    const form = formEvent.currentTarget
    const values = new FormData(form)
    const url = String(values.get('link_url') || '').trim()
    if (!validUrl(url)) {
      showToast({ kind: 'error', title: ar ? 'رابط غير صالح' : 'Invalid link', message: ar ? 'الصقي رابطًا يبدأ بـ http أو https.' : 'Paste a URL beginning with http or https.' })
      return
    }
    setBusy(true)
    try {
      const current = linksByEntry.get(entryId) ?? []
      const position = current.reduce((max, item) => Math.max(max, item.position), 0) + 1
      const { error } = await db.from('competition_entry_links').insert({ entry_id: entryId, link_url: url, label: optionalText(values.get('label')), position })
      if (error) throw error
      form.reset()
      await load()
    } catch (error) {
      showToast({ kind: 'error', title: ar ? 'تعذر إضافة الرابط' : 'Could not add link', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function removeEntry(entryId: string) {
    setBusy(true)
    try {
      const { error } = await db.from('competition_entries').delete().eq('id', entryId)
      if (error) throw error
      await load()
    } catch (error) {
      showToast({ kind: 'error', title: ar ? 'تعذر حذف المشاركة' : 'Could not delete entry', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function removeLink(linkId: string) {
    setBusy(true)
    try {
      const { error } = await db.from('competition_entry_links').delete().eq('id', linkId)
      if (error) throw error
      await load()
    } catch (error) {
      showToast({ kind: 'error', title: ar ? 'تعذر حذف الرابط' : 'Could not delete link', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  async function togglePublish(next: boolean) {
    if (next && !resultsPublished) {
      showToast({ kind: 'error', title: ar ? 'النتائج أولًا' : 'Publish results first', message: ar ? 'انشري نتائج المسابقة قبل نشر مشاريع المشاركين.' : 'Publish competition results before the participant showcase.' })
      return
    }
    if (next && !entries.length) {
      showToast({ kind: 'error', title: ar ? 'ما في مشاركات بعد' : 'No entries yet', message: ar ? 'أضيفي فريقًا أو مشاركة واحدة على الأقل قبل النشر.' : 'Add at least one team or entry before publishing.' })
      return
    }
    setBusy(true)
    try {
      const { error } = await db.from('competition_details').update({
        showcase_published: next,
        showcase_published_at: next ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('event_id', eventId)
      if (error) throw error
      setPublished(next)
      showToast({
        kind: 'success',
        title: next ? (ar ? 'تم نشر المشاريع' : 'Showcase published') : (ar ? 'تم إخفاء المشاريع' : 'Showcase hidden'),
        message: next ? (ar ? 'مشاريع الفرق المشاركة أصبحت ظاهرة للناس.' : 'Participant projects are now public.') : (ar ? 'المشاريع رجعت لمسودة ومخفية عن الجمهور.' : 'Participant projects are back in draft and hidden from the public.'),
      })
    } catch (error) {
      showToast({ kind: 'error', title: ar ? 'تعذر تحديث النشر' : 'Could not update publishing', message: errorMessage(error) })
    } finally {
      setBusy(false)
    }
  }

  if (!resultsPublished) return <section className="competition-admin-section competition-showcase-locked">
    <div className="competition-showcase-lock-mark">◇</div>
    <div><span className="eyebrow">{ar ? 'أرشيف المشاركات' : 'Participant showcase'}</span><h4>{ar ? 'مشاريع الفرق تفتح بعد نشر النتائج' : 'Team projects unlock after results'}</h4><p>{ar ? 'بعد اعتماد ونشر الفائزين، تقدري تضيفي كل الفرق وشغلهم وتجهزيهم كمسودة قبل عرضهم للناس.' : 'After winners are published, you can archive every team and its work as a draft before making it public.'}</p></div>
  </section>

  return <section className="competition-admin-section competition-showcase-admin">
    <div className="competition-admin-section-head competition-showcase-admin-head">
      <div><span className="eyebrow">{ar ? 'أرشيف المشاركات' : 'Participant showcase'}</span><h4>{ar ? 'الفرق المشاركة ومشاريعهم' : 'Teams and their work'}</h4><p>{ar ? 'أضيفي المشاريع كمسودة أولًا، وبعد التأكد منها انشري الأرشيف كله مرة واحدة.' : 'Build the showcase as a draft, then publish it all when it is ready.'}</p></div>
      <button type="button" className={`button ${published ? '' : 'button-primary'}`} disabled={busy || loading} onClick={() => void togglePublish(!published)}>{published ? (ar ? 'إخفاء المشاريع' : 'Unpublish showcase') : (ar ? 'نشر مشاريع المشاركين' : 'Publish participant projects')}</button>
    </div>

    <form className="competition-showcase-form" onSubmit={addEntry}>
      <div className="admin-event-two">
        <label><span>{ar ? 'اسم الفريق / المشارك' : 'Team / participant name'}</span><input name="team_name" required maxLength={180} /></label>
        <label><span>{ar ? 'قائد الفريق — اختياري' : 'Team leader — optional'}</span><input name="leader_name" /></label>
      </div>
      <label><span>{ar ? 'أعضاء الفريق — اختياري' : 'Team members — optional'}</span><textarea name="members" rows={3} placeholder={ar ? 'كل اسم في سطر' : 'One name per line'} /></label>
      <div className="admin-event-two">
        <label><span>{ar ? 'اسم المشروع / الفكرة / العمل' : 'Project / idea / work title'}</span><input name="work_title" required maxLength={220} /></label>
        <label><span>{ar ? 'نوع العمل — اختياري' : 'Work type — optional'}</span><input name="work_type" placeholder={ar ? 'مشروع، فكرة، تصميم، بحث…' : 'Project, idea, design, research…'} /></label>
      </div>
      <div className="admin-event-two">
        <label><span>{ar ? 'المسار — اختياري' : 'Track — optional'}</span><input name="track" placeholder="AI / Web / Security…" /></label>
        <label><span>{ar ? 'ربطه بفائز — اختياري' : 'Link to a winner — optional'}</span><select name="winner_id"><option value="">{ar ? 'ليس ضمن الفائزين / بدون ربط' : 'Not a winner / no link'}</option>{winners.map((winner) => <option key={winner.id} value={winner.id}>{winner.rank ? `#${winner.rank} — ` : ''}{winner.entry_name}</option>)}</select></label>
      </div>
      <label><span>{ar ? 'وصف العمل — اختياري' : 'Work description — optional'}</span><textarea name="description" rows={4} placeholder={ar ? 'شنو المشكلة أو الفكرة؟ الفريق عمل شنو؟' : 'What problem or idea did the team work on?'} /></label>
      <label><span>{ar ? 'روابط العمل — اختياري' : 'Work links — optional'}</span><textarea name="links" rows={4} placeholder={ar ? 'رابط واحد في كل سطر — Telegram، Drive، YouTube، GitHub، Figma أو أي رابط' : 'One URL per line — Telegram, Drive, YouTube, GitHub, Figma, or any link'} /><small className="field-hint">{ar ? 'ممكن تضيفي روابط زيادة لكل فريق بعد الحفظ.' : 'You can add more links to each team after saving.'}</small></label>
      <button className="button" disabled={busy}>{busy ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : (ar ? 'إضافة المشاركة كمسودة' : 'Add entry as draft')}</button>
    </form>

    {loading ? <div className="page-state compact">{ar ? 'جارٍ تحميل المشاريع…' : 'Loading projects…'}</div> : entries.length > 0 ? <div className="competition-showcase-admin-list">
      {entries.map((entry, index) => {
        const entryLinks = linksByEntry.get(entry.id) ?? []
        const winner = entry.winner_id ? winners.find((item) => item.id === entry.winner_id) : null
        return <article key={entry.id} className="competition-showcase-admin-card">
          <div className="competition-showcase-admin-card-head"><span>{String(index + 1).padStart(2, '0')}</span><div><strong dir="auto">{entry.team_name}</strong><small dir="auto">{entry.work_title}</small></div>{winner && <b>{winner.rank ? `#${winner.rank}` : '★'} {winner.award_title || (ar ? 'فائز' : 'Winner')}</b>}<button type="button" className="text-action danger-text" disabled={busy} onClick={() => void removeEntry(entry.id)}>{ar ? 'حذف' : 'Delete'}</button></div>
          <div className="competition-showcase-admin-meta">{entry.leader_name && <span><small>{ar ? 'القائد' : 'Leader'}</small><strong dir="auto">{entry.leader_name}</strong></span>}{entry.work_type && <span><small>{ar ? 'نوع العمل' : 'Type'}</small><strong dir="auto">{entry.work_type}</strong></span>}{entry.track && <span><small>{ar ? 'المسار' : 'Track'}</small><strong dir="auto">{entry.track}</strong></span>}</div>
          {entry.description && <p dir="auto">{entry.description}</p>}
          {entry.members && <details><summary>{ar ? 'أعضاء الفريق' : 'Team members'}</summary><p dir="auto">{entry.members}</p></details>}
          {entryLinks.length > 0 && <div className="competition-showcase-admin-links">{entryLinks.map((link) => <span key={link.id}><a href={link.link_url} target="_blank" rel="noopener noreferrer">{linkName(link.link_url, link.label)} ↗</a><button type="button" disabled={busy} onClick={() => void removeLink(link.id)} aria-label={ar ? 'حذف الرابط' : 'Delete link'}>×</button></span>)}</div>}
          <form className="competition-showcase-link-form" onSubmit={(formEvent) => void addLink(entry.id, formEvent)}><input name="label" placeholder={ar ? 'اسم الرابط — اختياري' : 'Link label — optional'} /><input name="link_url" type="url" required placeholder="https://..." /><button className="button" disabled={busy}>{ar ? 'إضافة رابط' : 'Add link'}</button></form>
        </article>
      })}
    </div> : <div className="competition-showcase-empty"><strong>{ar ? 'ما أضفتِ أي فريق بعد' : 'No teams added yet'}</strong><span>{ar ? 'ابدئي بأول فريق ومشروعه، وسيظل كل شيء مخفيًا حتى تضغطي نشر.' : 'Add the first team and its work. Everything stays hidden until you publish.'}</span></div>}
  </section>
}
