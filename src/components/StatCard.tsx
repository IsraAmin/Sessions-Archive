export function StatCard({ label, value }: { label: string; value: number | string }) {
  return <div className="stat-card"><strong>{value}</strong><span>{label}</span></div>
}
