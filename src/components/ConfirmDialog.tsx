import { Icon } from './Icon'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  tone?: 'danger' | 'warning' | 'primary'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel, tone = 'primary', busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  if (!open) return null

  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => {
    if (event.currentTarget === event.target && !busy) onCancel()
  }}>
    <section className={`confirm-dialog confirm-${tone}`} role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
      <div className="confirm-icon"><Icon name={tone === 'danger' ? 'error' : tone === 'warning' ? 'shield' : 'check'} /></div>
      <div className="confirm-copy">
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{description}</p>
      </div>
      <div className="confirm-actions">
        <button type="button" className="button button-ghost" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className={`button confirm-submit confirm-submit-${tone}`} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </section>
  </div>
}
