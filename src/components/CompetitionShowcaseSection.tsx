import { useEffect, useMemo, useState } from 'react'
import { publicSupabase } from '../lib/supabase'
import type { CompetitionEntry, CompetitionEntryLink, CompetitionWinner } from '../types/domain'

function lines(value: string | null) {
  return (value ?? '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
}

function linkMeta(url: string, custom: string | null, ar: boolean) {
  if (custom?.trim()) return { label: custom.trim(), kind: 'external' }
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host === 'youtu.be' || host.endsWith('youtube.com')) return { label: 'YouTube', kind: 'youtube' }
    if (host.endsWith('drive.google.com')) return { label: 'Google Drive', kind: 'drive' }
    if (host === 't.me' || host.endsWith('telegram.me')) return { label: 'Telegram', kind: 'telegram' }
    if (host.endsWith('github.com')) return { label: 'GitHub', kind: 'github' }
    if (host.endsWith('figma.com')) return { label: 'Figma', kind: 'figma' }
    return { label: host || (ar ? 'فتح العمل' : 'Open work'), kind: 'external' }
  } catch {
    return { label: ar ? 'فتح العمل' : 'Open work', kind: 'external' }
  }
}

type Props = {
  eventId: string
  ar: boolean
  resultsPublished: boolean
  showcasePublished: boolean
  winners: CompetitionWinner[]
}

export function CompetitionShowcaseSection({ eventId, ar, resultsPublished, showcasePublished, winners }: Props) {
  const db = publicSupabase as any
  const [entries, setEntries] = useState<CompetitionEntry[]>([])
  const [links, setLinks] = useState<CompetitionEntryLink[]>([])

  useEffect(() => {
    let active = true
    async function load() {
      if (!resultsPublished || !showcasePublished) {
        if (active) { setEntries([]); setLinks([]) }
        return
      }
      try {
        const { data, error } = await db.from('competition_entries').select('*').eq('event_id', eventId).order('position').order('created_at')
        if (error) throw error
        const nextEntries = (data ?? []) as CompetitionEntry[]
        if (!active) return
        setEntries(nextEntries)
        if (!nextEntries.length) { setLinks([]); return }
        const linkResult = await db.from('competition_entry_links').select('*').in('entry_id', nextEntries.map((entry) => entry.id)).order('position').order('created_at')
        if (linkResult.error) throw linkResult.error
        if (active) setLinks((linkResult.data ?? []) as CompetitionEntryLink[])
      } catch (error) {
        console.error('Could not load competition participant showcase', error)
        if (active) { setEntries([]); setLinks([]) }
      }
    }
    void load()
    return () => { active = false }
  }, [eventId, resultsPublished, showcasePublished])

  const linksByEntry = useMemo(() => {
    const map = new Map<string, CompetitionEntryLink[]>()
    for (const link of links) {
      const current = map.get(link.entry_id) ?? []
      current.push(link)
      map.set(link.entry_id, current)
    }
    return map
  }, [links])
  const winnerById = useMemo(() => new Map(winners.map((winner) => [winner.id, winner])), [winners])

  if (!resultsPublished || !showcasePublished || !entries.length) return null

  return <section className="competition-public-section competition-showcase-section">
    <div className="competition-section-heading competition-showcase-heading">
      <span>{ar ? 'أرشيف المشاركات' : 'Participant archive'}</span>
      <h2>{ar ? 'مشاريع الفرق المشاركة' : 'Teams and their work'}</h2>
      <p>{ar ? 'مساحة لحفظ وعرض الأفكار والمشاريع والتصاميم التي خرجت من المسابقة، عشان تظل مرجعًا مفيدًا بعد انتهائها.' : 'A lasting showcase of the ideas, projects, designs, and work created during the competition.'}</p>
    </div>
    <div className="competition-showcase-grid">
      {entries.map((entry, index) => {
        const winner = entry.winner_id ? winnerById.get(entry.winner_id) : null
        const entryLinks = linksByEntry.get(entry.id) ?? []
        const members = lines(entry.members)
        return <article className={`competition-showcase-card ${winner ? 'is-winner' : ''}`} key={entry.id}>
          <header className="competition-showcase-card-head">
            <span className="competition-showcase-number">{String(index + 1).padStart(2, '0')}</span>
            <div><small>{ar ? 'الفريق' : 'Team'}</small><h3 dir="auto">{entry.team_name}</h3></div>
            {winner && <span className="competition-showcase-winner-badge">🏆 {winner.award_title || (winner.rank ? (ar ? `المركز ${winner.rank}` : `Rank ${winner.rank}`) : (ar ? 'فائز' : 'Winner'))}</span>}
          </header>

          <div className="competition-showcase-work">
            <span>{entry.work_type || (ar ? 'عمل الفريق' : 'Team work')}</span>
            <h4 dir="auto">{entry.work_title}</h4>
            {entry.description && <p dir="auto">{entry.description}</p>}
          </div>

          {(entry.leader_name || entry.track) && <div className="competition-showcase-facts">
            {entry.leader_name && <div><small>{ar ? 'قائد الفريق' : 'Team leader'}</small><strong dir="auto">{entry.leader_name}</strong></div>}
            {entry.track && <div><small>{ar ? 'المسار' : 'Track'}</small><strong dir="auto">{entry.track}</strong></div>}
          </div>}

          {members.length > 0 && <div className="competition-showcase-members"><small>{ar ? 'أعضاء الفريق' : 'Team members'}</small><div>{members.map((member) => <span dir="auto" key={member}>{member}</span>)}</div></div>}

          {entryLinks.length > 0 && <div className="competition-showcase-links">{entryLinks.map((link) => {
            const meta = linkMeta(link.link_url, link.label, ar)
            return <a key={link.id} href={link.link_url} target="_blank" rel="noopener noreferrer" className={`competition-showcase-link link-${meta.kind}`}><span>{meta.label}</span><b aria-hidden="true">↗</b></a>
          })}</div>}
        </article>
      })}
    </div>
  </section>
}
