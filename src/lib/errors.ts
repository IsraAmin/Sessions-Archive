type ErrorLike = {
  message?: unknown
  details?: unknown
  hint?: unknown
  code?: unknown
  error_description?: unknown
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error.trim()

  if (typeof error === 'object' && error !== null) {
    const value = error as ErrorLike
    const code = text(value.code)
    const message = text(value.message) || text(value.error_description)
    const details = text(value.details)
    const hint = text(value.hint)

    if (code === '23505') return 'هذه القيمة مستخدمة من قبل. غيّري الاسم أو البيانات المتكررة ثم حاولي مرة أخرى.'
    if (code === '23514' && /Part/i.test(message) && /(المطلوب|next required|must start)/i.test(message)) return message
    if (code === '23514') return 'إحدى القيم لا تطابق شروط الحفظ. راجعي التاريخ والسعة والحقول المطلوبة ثم حاولي مرة أخرى.'
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
      return 'انتهت أو تغيّرت صلاحية الإدارة في الجلسة الحالية. حدّثي الصفحة أو سجّلي الدخول مرة أخرى ثم أعيدي المحاولة.'
    }

    const parts = [message, details, hint].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }

  return 'تعذر تنفيذ الإجراء. حدّثي الصفحة وحاولي مرة أخرى، وإذا استمر الخطأ تحققي من الحقول المطلوبة.'
}
