import type { CompetitionAttendanceMode, CompetitionDetails, CompetitionKind, CompetitionParticipationMode, CompetitionPhase } from '../types/domain'

const kindLabels: Record<CompetitionKind, { ar: string; en: string }> = {
  problem_solving: { ar: 'Problem Solving', en: 'Problem Solving' },
  hackathon: { ar: 'هاكاثون', en: 'Hackathon' },
  ctf: { ar: 'CTF', en: 'CTF' },
  innovation: { ar: 'ابتكار', en: 'Innovation' },
  other: { ar: 'مسابقة أكاديمية', en: 'Academic competition' },
}

const phaseLabels: Record<CompetitionPhase, { ar: string; en: string }> = {
  announced: { ar: 'الإعلان', en: 'Announced' },
  registration: { ar: 'التسجيل', en: 'Registration' },
  in_progress: { ar: 'المسابقة جارية', en: 'In progress' },
  judging: { ar: 'التحكيم', en: 'Judging' },
  completed: { ar: 'انتهت', en: 'Completed' },
}

const participationLabels: Record<CompetitionParticipationMode, { ar: string; en: string }> = {
  individual: { ar: 'فردي', en: 'Individual' },
  team: { ar: 'فرق', en: 'Teams' },
  both: { ar: 'فردي أو فرق', en: 'Individual or teams' },
}

const attendanceLabels: Record<CompetitionAttendanceMode, { ar: string; en: string }> = {
  in_person: { ar: 'حضوري', en: 'In person' },
  online: { ar: 'أونلاين', en: 'Online' },
  hybrid: { ar: 'هجين', en: 'Hybrid' },
}

export function competitionKindLabel(kind: CompetitionKind, ar: boolean) {
  return ar ? kindLabels[kind].ar : kindLabels[kind].en
}

export function competitionPhaseLabel(phase: CompetitionPhase, ar: boolean) {
  return ar ? phaseLabels[phase].ar : phaseLabels[phase].en
}

export function competitionParticipationLabel(mode: CompetitionParticipationMode, ar: boolean) {
  return ar ? participationLabels[mode].ar : participationLabels[mode].en
}

export function competitionAttendanceLabel(mode: CompetitionAttendanceMode, ar: boolean) {
  return ar ? attendanceLabels[mode].ar : attendanceLabels[mode].en
}

export function competitionRegistrationOpen(details: CompetitionDetails, at = Date.now()) {
  if (details.phase !== 'registration' || !details.registration_url) return false
  const opens = details.registration_opens_at ? new Date(details.registration_opens_at).getTime() : Number.NEGATIVE_INFINITY
  const closes = details.registration_closes_at ? new Date(details.registration_closes_at).getTime() : Number.POSITIVE_INFINITY
  return at >= opens && at <= closes
}

export function competitionPublicStatus(details: CompetitionDetails, ar: boolean) {
  if (details.results_published) return ar ? 'النتائج منشورة' : 'Results published'
  if (details.phase === 'judging') return ar ? 'جارٍ التحكيم وإعداد النتائج' : 'Judging and results in progress'
  if (details.phase === 'in_progress') return ar ? 'المسابقة جارية' : 'Competition in progress'
  if (details.phase === 'completed') return ar ? 'انتهت المسابقة — النتائج قريبًا' : 'Competition ended — results soon'
  if (competitionRegistrationOpen(details)) return ar ? 'التسجيل مفتوح' : 'Registration open'
  if (details.phase === 'registration') return ar ? 'التسجيل مغلق' : 'Registration closed'
  return ar ? 'التسجيل قريبًا' : 'Registration coming soon'
}
