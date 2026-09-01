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

    if (message === 'PINNED_SESSION_LIMIT_REACHED') return 'يمكن تثبيت 3 سيشنات كحد أقصى. فك تثبيت واحدة أولًا ثم حاول مرة أخرى.'
    if (code === '23505') return 'هذه القيمة مستخدمة من قبل. غيّر الاسم أو البيانات المتكررة ثم حاول مرة أخرى.'
    if (code === '23514' && /Part/i.test(message) && /(المطلوب|next required|must start)/i.test(message)) return message
    if (code === '23514') return 'إحدى القيم لا تطابق شروط الحفظ. راجع التاريخ والسعة والحقول المطلوبة ثم حاول مرة أخرى.'
    if (code === '42501' || /row-level security|permission denied/i.test(message)) {
      return 'انتهت أو تغيّرت صلاحية الإدارة في الجلسة الحالية. حدّث الصفحة أو سجّل الدخول مرة أخرى ثم أعد المحاولة.'
    }

    const parts = [message, details, hint].filter(Boolean)
    if (parts.length) return parts.join(' — ')
  }

  return 'تعذر تنفيذ الإجراء. حدّث الصفحة وحاول مرة أخرى، وإذا استمر الخطأ تحقق من الحقول المطلوبة.'
}
