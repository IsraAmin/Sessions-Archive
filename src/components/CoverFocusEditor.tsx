import { useState } from 'react'
import { publicStorageUrl } from '../lib/supabase'
import type { Session } from '../types/domain'

function clampFocus(value: number | null | undefined) {
  return Math.min(100, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 50))
}

export function CoverFocusEditor({ session, language }: { session: Session; language: 'ar' | 'en' }) {
  const ar = language === 'ar'
  const image = publicStorageUrl('session-covers', session.cover_path)
  const [x, setX] = useState(() => clampFocus(session.cover_focus_x))
  const [y, setY] = useState(() => clampFocus(session.cover_focus_y))

  if (!image) {
    return <div className="cover-focus-empty">{ar ? 'ارفعي غلاف السيشن أولاً، وبعدها سيظهر هنا التحكم في الجزء الظاهر داخل الكارد.' : 'Upload a session cover first, then the card crop controls will appear here.'}</div>
  }

  return <div className="cover-focus-editor">
    <div
      className="cover-focus-preview"
      style={{ backgroundImage: `url(${image})`, backgroundPosition: `${x}% ${y}%` }}
      role="img"
      aria-label={ar ? 'معاينة الجزء الظاهر من الغلاف في كارد السيشن' : 'Preview of the session card cover crop'}
    >
      <span>{ar ? 'معاينة الكارد' : 'Card preview'}</span>
    </div>

    <div className="cover-focus-controls">
      <label>
        <span><strong>{ar ? 'الموضع الأفقي' : 'Horizontal position'}</strong><b>{Math.round(x)}%</b></span>
        <input dir="ltr" name="cover_focus_x" type="range" min="0" max="100" step="1" value={x} onChange={(event) => setX(Number(event.target.value))} />
        <small>{ar ? 'حرّكيه لاختيار الجزء من اليسار إلى اليمين.' : 'Move it to choose the visible area from left to right.'}</small>
      </label>
      <label>
        <span><strong>{ar ? 'الموضع الرأسي' : 'Vertical position'}</strong><b>{Math.round(y)}%</b></span>
        <input dir="ltr" name="cover_focus_y" type="range" min="0" max="100" step="1" value={y} onChange={(event) => setY(Number(event.target.value))} />
        <small>{ar ? 'حرّكيه لاختيار الجزء من أعلى إلى أسفل.' : 'Move it to choose the visible area from top to bottom.'}</small>
      </label>
    </div>

    <div className="cover-focus-presets" aria-label={ar ? 'اختصارات موضع الغلاف' : 'Cover position presets'}>
      <button type="button" className="button button-ghost" onClick={() => setY(15)}>{ar ? 'أعلى' : 'Top'}</button>
      <button type="button" className="button button-ghost" onClick={() => { setX(50); setY(50) }}>{ar ? 'الوسط' : 'Center'}</button>
      <button type="button" className="button button-ghost" onClick={() => setY(85)}>{ar ? 'أسفل' : 'Bottom'}</button>
    </div>

    <p>{ar ? 'المعاينة دي تمثل القص المستخدم في كروت الصفحة الرئيسية والمحفوظات. الصورة الأصلية نفسها ما بتتقص ولا بتتغير.' : 'This preview matches the crop used on home and saved-session cards. The original image is never cropped or modified.'}</p>
  </div>
}
