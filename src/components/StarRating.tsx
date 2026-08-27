type StarRatingProps = {
  value: number
  onChange?: (value: number) => void
  label: string
  disabled?: boolean
  readOnly?: boolean
}

export function StarRating({ value, onChange, label, disabled = false, readOnly = false }: StarRatingProps) {
  const rounded = Math.max(0, Math.min(5, Math.round(value)))

  return (
    <div className={`star-rating ${readOnly ? 'is-readonly' : ''}`} role={readOnly ? undefined : 'radiogroup'} aria-label={label}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= rounded
        if (readOnly) {
          return <span key={star} className={active ? 'is-active' : ''} aria-hidden="true">★</span>
        }
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${label}: ${star}/5`}
            className={active ? 'is-active' : ''}
            disabled={disabled}
            onClick={() => onChange?.(star)}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}
