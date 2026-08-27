import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Language = 'ar' | 'en'
export type Theme = 'light' | 'dark'

const ar = {
  'nav.sessions': 'السيشنات', 'nav.dashboard': 'لوحتي', 'nav.profile': 'الملف الشخصي', 'nav.admin': 'الإدارة',
  'nav.learning': 'التعلّم', 'nav.account': 'الحساب', 'nav.explore': 'استكشف',
  'common.signIn': 'تسجيل الدخول', 'common.signOut': 'تسجيل الخروج', 'common.save': 'حفظ التعديلات', 'common.add': 'إضافة',
  'common.edit': 'تعديل', 'common.delete': 'حذف', 'common.cancel': 'إلغاء', 'common.close': 'إغلاق', 'common.loading': 'جاري التحميل…',
  'common.success': 'تم بنجاح', 'common.error': 'تعذر تنفيذ الإجراء', 'common.search': 'بحث', 'common.all': 'الكل',
  'common.language': 'English', 'common.dark': 'الوضع الداكن', 'common.light': 'الوضع الفاتح', 'common.menu': 'فتح القائمة',
  'sessions.eyebrow': 'تعلّم • شارك • تطور', 'sessions.title': 'اكتشف السيشن المناسبة لك',
  'sessions.subtitle': 'ابحث بالعنوان أو الوصف أو التصنيف أو اسم المتحدث، وسجّل مباشرة من المنصة.',
  'sessions.placeholder': 'ابحث عن Session أو Speaker…', 'sessions.allCategories': 'كل التصنيفات', 'sessions.noResults': 'لا توجد نتائج مطابقة. جرّب كلمة أو تصنيفًا مختلفًا.',
  'sessions.loading': 'جاري تحميل السيشنات…', 'sessions.details': 'عرض التفاصيل', 'sessions.general': 'عام', 'sessions.speakerLater': 'متحدث يحدد لاحقًا',
  'details.speaker': 'المتحدث', 'details.date': 'الموعد', 'details.location': 'المكان', 'details.capacity': 'السعة',
  'details.online': 'أونلاين / يحدد لاحقًا', 'details.signInHint': 'سجل الدخول للتسجيل والحفظ والتقييم.',
  'details.register': 'سجل في السيشن', 'details.unregister': 'إلغاء التسجيل', 'details.bookmark': 'حفظ', 'details.unbookmark': 'إزالة من المحفوظات',
  'details.rating': 'تقييمك', 'details.stars': 'النجوم', 'details.comment': 'تعليق', 'details.saveRating': 'حفظ التقييم',
  'details.resources': 'المصادر', 'details.resourceLogin': 'سجل الدخول لفتح ملفات السيشن.', 'details.recordingAvailable': 'التسجيل متاح',
  'details.watchHere': 'شاهد السيشن هنا', 'details.mainRecording': 'التسجيل الرئيسي', 'details.part': 'الجزء {n}',
  'details.oneVideo': 'فيديو واحد', 'details.videos': '{n} فيديوهات', 'details.calendar': 'أضف للتقويم', 'details.googleCalendar': 'Google Calendar',
  'details.downloadIcs': 'تحميل ملف التقويم', 'details.series': 'ضمن السلسلة', 'details.seriesPart': 'الجزء {n}',
  'details.registeredToast': 'تم التسجيل في السيشن.', 'details.unregisteredToast': 'تم إلغاء التسجيل.', 'details.savedToast': 'تم حفظ السيشن.',
  'details.unsavedToast': 'تمت إزالة السيشن من المحفوظات.', 'details.feedbackToast': 'تم حفظ تقييمك.', 'details.calendarToast': 'تم تنزيل ملف التقويم.',
  'video.progress': 'شاهدت {n}%', 'video.continue': 'كمل المشاهدة من {time}', 'video.completed': 'اكتملت المشاهدة',
  'dashboard.eyebrow': 'Dashboard', 'dashboard.title': 'لوحتي', 'dashboard.registrations': 'تسجيلات', 'dashboard.bookmarks': 'محفوظات',
  'dashboard.feedback': 'تقييمات', 'dashboard.progress': 'فيديوهات بدأت', 'dashboard.registered': 'السيشنات المسجل بها',
  'dashboard.noRegistered': 'لم تسجل في سيشنات بعد. اكتشف سيشنًا يناسبك وابدأ من هناك.', 'dashboard.continueWatching': 'كمل المشاهدة',
  'dashboard.noProgress': 'عندما تبدأ مشاهدة تسجيل، سيظهر تقدمك هنا.',
  'profile.eyebrow': 'حسابك', 'profile.title': 'الملف الشخصي', 'profile.subtitle': 'حدّث بياناتك وصورتك واختر إعدادات الإشعارات لهذا الجهاز.',
  'profile.fullName': 'الاسم الكامل', 'profile.university': 'الجامعة', 'profile.department': 'القسم', 'profile.level': 'المستوى', 'profile.bio': 'نبذة',
  'profile.photo': 'الصورة الشخصية', 'profile.photoHint': 'اختر أي صورة. سنضغطها تلقائيًا إلى 50KB أو أقل قبل رفعها.', 'profile.choosePhoto': 'اختر صورة',
  'profile.preparing': 'جاري التجهيز…', 'profile.lastCompression': 'آخر ضغط: {value}', 'profile.saved': 'تم حفظ التعديلات.', 'profile.photoSaved': 'تم تحديث الصورة وضغطها إلى أقل من 50KB.',
  'profile.deviceNotifications': 'إشعارات هذا الجهاز', 'profile.pushOn': 'الإشعارات مفعّلة. ستصلك تحديثات السيشنات على هذا الجهاز.',
  'profile.pushDenied': 'المتصفح يمنع الإشعارات. غيّر الإذن من إعدادات الموقع ثم حاول مرة أخرى.', 'profile.pushUnsupported': 'هذا المتصفح لا يدعم Push Notifications.',
  'profile.pushOff': 'فعّل الإشعارات لتصلك تحديثات السيشنات حتى عندما لا تكون الصفحة مفتوحة.', 'profile.enablePush': 'تفعيل الإشعارات', 'profile.disablePush': 'إيقاف الإشعارات',
  'auth.welcome': 'مرحبًا بك', 'auth.signIn': 'تسجيل الدخول', 'auth.signUp': 'إنشاء حساب', 'auth.email': 'البريد الإلكتروني', 'auth.password': 'كلمة المرور',
  'auth.fullName': 'الاسم الكامل', 'auth.signing': 'جاري التنفيذ…', 'auth.create': 'إنشاء الحساب', 'auth.noAccount': 'ليس لديك حساب؟ أنشئ واحدًا',
  'auth.hasAccount': 'لديك حساب؟ سجل الدخول', 'auth.checkEmail': 'تم إنشاء الحساب. افتح رسالة التأكيد في بريدك لإكمال التسجيل.',
  'notifications.title': 'الإشعارات', 'notifications.markAll': 'تحديد الكل كمقروء', 'notifications.empty': 'لا توجد تحديثات جديدة. ستظهر هنا تغييرات السيشنات والتسجيلات.',
  'notifications.unread': '{n} غير مقروء', 'notifications.open': 'فتح الإشعارات', 'notifications.reminderTitle': 'السيشن يبدأ قريبًا',
  'notifications.reminderBody': 'باقي أقل من ساعة على {title}.',
  'admin.eyebrow': 'إدارة المنصة', 'admin.title': 'لوحة الإدارة', 'admin.subtitle': 'إدارة المحتوى والمستخدمين وقراءة أداء المنصة من مكان واحد.',
  'admin.users': 'المستخدمون', 'admin.sessions': 'السيشنات', 'admin.registrations': 'التسجيلات', 'admin.speakers': 'المتحدثون',
  'admin.analytics': 'التحليلات', 'admin.userManagement': 'إدارة المستخدمين', 'admin.series': 'سلاسل السيشنات', 'admin.content': 'المحتوى',
  'admin.superOnly': 'هذه الأدوات متاحة للـSuper Admin فقط.', 'admin.promote': 'ترقية إلى Admin', 'admin.demote': 'سحب صلاحية Admin', 'admin.disable': 'تعطيل الحساب', 'admin.enable': 'إعادة تفعيل الحساب',
  'admin.roleAdmin': 'Admin', 'admin.roleStudent': 'Student', 'admin.superAdmin': 'Super Admin', 'admin.lastSignIn': 'آخر دخول', 'admin.activity': 'النشاط',
  'admin.views': 'مشاهدات التفاصيل', 'admin.attendanceRate': 'نسبة الحضور', 'admin.avgRating': 'متوسط التقييم', 'admin.videoStarts': 'مشاهدات الفيديو',
  'admin.conversion': 'تحويل مشاهدة → تسجيل', 'admin.topCategories': 'أكثر التصنيفات اهتمامًا', 'admin.topSpeakers': 'المتحدثون الأكثر جذبًا', 'admin.activeStudents': 'الطلاب الأكثر نشاطًا',
  'admin.newSeries': 'سلسلة جديدة', 'admin.seriesTitle': 'عنوان السلسلة', 'admin.seriesDescription': 'وصف السلسلة', 'admin.createSeries': 'إنشاء السلسلة',
  'admin.category': 'التصنيفات', 'admin.addCategory': 'إضافة تصنيف', 'admin.name': 'الاسم', 'admin.organization': 'الجهة', 'admin.addSpeaker': 'إضافة متحدث',
  'admin.createSession': 'إنشاء سيشن', 'admin.titleField': 'العنوان', 'admin.description': 'الوصف', 'admin.date': 'الموعد', 'admin.capacity': 'السعة', 'admin.noCategory': 'بدون تصنيف',
  'admin.noSpeaker': 'بدون متحدث', 'admin.noSeries': 'بدون سلسلة', 'admin.seriesPosition': 'رقم الجزء', 'admin.cover': 'غلاف', 'admin.resource': 'ملف',
  'admin.youtube': 'تسجيلات YouTube', 'admin.youtubeHint': 'الصق رابط الفيديو بعد رفعه على YouTube. سيظهر للطلاب داخل صفحة السيشن.', 'admin.videoSession': 'السيشن',
  'admin.videoTitle': 'عنوان التسجيل', 'admin.youtubeUrl': 'رابط YouTube', 'admin.addRecording': 'إضافة التسجيل', 'admin.preview': 'معاينة قبل الحفظ',
  'admin.push': 'إرسال Push Notification', 'admin.pushTitle': 'العنوان', 'admin.pushBody': 'النص', 'admin.pushPath': 'المسار داخل التطبيق', 'admin.sendPush': 'إرسال الإشعار',
} as const

const en: Record<keyof typeof ar, string> = {
  'nav.sessions': 'Sessions', 'nav.dashboard': 'Dashboard', 'nav.profile': 'Profile', 'nav.admin': 'Admin', 'nav.learning': 'Learning', 'nav.account': 'Account', 'nav.explore': 'Explore',
  'common.signIn': 'Sign in', 'common.signOut': 'Sign out', 'common.save': 'Save changes', 'common.add': 'Add', 'common.edit': 'Edit', 'common.delete': 'Delete', 'common.cancel': 'Cancel', 'common.close': 'Close',
  'common.loading': 'Loading…', 'common.success': 'Done', 'common.error': 'Could not complete the action', 'common.search': 'Search', 'common.all': 'All', 'common.language': 'العربية',
  'common.dark': 'Dark mode', 'common.light': 'Light mode', 'common.menu': 'Open menu',
  'sessions.eyebrow': 'Learn • Share • Grow', 'sessions.title': 'Find the right session for you', 'sessions.subtitle': 'Search by title, description, category, or speaker and register directly from the platform.',
  'sessions.placeholder': 'Search for a session or speaker…', 'sessions.allCategories': 'All categories', 'sessions.noResults': 'No matching results. Try a different word or category.', 'sessions.loading': 'Loading sessions…',
  'sessions.details': 'View details', 'sessions.general': 'General', 'sessions.speakerLater': 'Speaker to be announced',
  'details.speaker': 'Speaker', 'details.date': 'Date', 'details.location': 'Location', 'details.capacity': 'Capacity', 'details.online': 'Online / to be announced', 'details.signInHint': 'Sign in to register, save, and rate this session.',
  'details.register': 'Register', 'details.unregister': 'Cancel registration', 'details.bookmark': 'Save', 'details.unbookmark': 'Remove from saved', 'details.rating': 'Your rating', 'details.stars': 'Stars', 'details.comment': 'Comment',
  'details.saveRating': 'Save rating', 'details.resources': 'Resources', 'details.resourceLogin': 'Sign in to open session files.', 'details.recordingAvailable': 'Recording available', 'details.watchHere': 'Watch the session here',
  'details.mainRecording': 'Main recording', 'details.part': 'Part {n}', 'details.oneVideo': '1 video', 'details.videos': '{n} videos', 'details.calendar': 'Add to calendar', 'details.googleCalendar': 'Google Calendar',
  'details.downloadIcs': 'Download calendar file', 'details.series': 'Part of the series', 'details.seriesPart': 'Part {n}', 'details.registeredToast': 'You are registered for this session.', 'details.unregisteredToast': 'Registration cancelled.',
  'details.savedToast': 'Session saved.', 'details.unsavedToast': 'Session removed from saved.', 'details.feedbackToast': 'Your rating was saved.', 'details.calendarToast': 'Calendar file downloaded.',
  'video.progress': 'Watched {n}%', 'video.continue': 'Continue from {time}', 'video.completed': 'Completed',
  'dashboard.eyebrow': 'Dashboard', 'dashboard.title': 'My dashboard', 'dashboard.registrations': 'Registrations', 'dashboard.bookmarks': 'Saved', 'dashboard.feedback': 'Ratings', 'dashboard.progress': 'Videos started',
  'dashboard.registered': 'Registered sessions', 'dashboard.noRegistered': 'You have not registered for a session yet. Explore sessions and start from there.', 'dashboard.continueWatching': 'Continue watching', 'dashboard.noProgress': 'Videos you start watching will appear here.',
  'profile.eyebrow': 'Your account', 'profile.title': 'Profile', 'profile.subtitle': 'Update your details, photo, and notification preferences for this device.', 'profile.fullName': 'Full name', 'profile.university': 'University',
  'profile.department': 'Department', 'profile.level': 'Level', 'profile.bio': 'Bio', 'profile.photo': 'Profile photo', 'profile.photoHint': 'Choose any photo. We will automatically compress it to 50KB or less before upload.',
  'profile.choosePhoto': 'Choose photo', 'profile.preparing': 'Preparing…', 'profile.lastCompression': 'Last compression: {value}', 'profile.saved': 'Changes saved.', 'profile.photoSaved': 'Photo updated and compressed to under 50KB.',
  'profile.deviceNotifications': 'Notifications on this device', 'profile.pushOn': 'Notifications are enabled. Session updates can reach this device.', 'profile.pushDenied': 'Your browser blocks notifications. Change the site permission, then try again.',
  'profile.pushUnsupported': 'This browser does not support push notifications.', 'profile.pushOff': 'Enable notifications to receive session updates even when the page is closed.', 'profile.enablePush': 'Enable notifications', 'profile.disablePush': 'Disable notifications',
  'auth.welcome': 'Welcome', 'auth.signIn': 'Sign in', 'auth.signUp': 'Create account', 'auth.email': 'Email', 'auth.password': 'Password', 'auth.fullName': 'Full name', 'auth.signing': 'Working…', 'auth.create': 'Create account',
  'auth.noAccount': 'No account? Create one', 'auth.hasAccount': 'Already have an account? Sign in', 'auth.checkEmail': 'Account created. Open the confirmation email to finish signing up.',
  'notifications.title': 'Notifications', 'notifications.markAll': 'Mark all as read', 'notifications.empty': 'No new updates. Session and registration changes will appear here.', 'notifications.unread': '{n} unread', 'notifications.open': 'Open notifications',
  'notifications.reminderTitle': 'Session starts soon', 'notifications.reminderBody': '{title} starts in less than an hour.',
  'admin.eyebrow': 'Platform management', 'admin.title': 'Admin dashboard', 'admin.subtitle': 'Manage content and users, and understand platform performance from one place.', 'admin.users': 'Users', 'admin.sessions': 'Sessions',
  'admin.registrations': 'Registrations', 'admin.speakers': 'Speakers', 'admin.analytics': 'Analytics', 'admin.userManagement': 'User management', 'admin.series': 'Session series', 'admin.content': 'Content',
  'admin.superOnly': 'These tools are available to the Super Admin only.', 'admin.promote': 'Promote to Admin', 'admin.demote': 'Remove Admin access', 'admin.disable': 'Disable account', 'admin.enable': 'Enable account', 'admin.roleAdmin': 'Admin',
  'admin.roleStudent': 'Student', 'admin.superAdmin': 'Super Admin', 'admin.lastSignIn': 'Last sign in', 'admin.activity': 'Activity', 'admin.views': 'Detail views', 'admin.attendanceRate': 'Attendance rate', 'admin.avgRating': 'Average rating',
  'admin.videoStarts': 'Video starts', 'admin.conversion': 'View → registration conversion', 'admin.topCategories': 'Most popular categories', 'admin.topSpeakers': 'Most engaging speakers', 'admin.activeStudents': 'Most active students',
  'admin.newSeries': 'New series', 'admin.seriesTitle': 'Series title', 'admin.seriesDescription': 'Series description', 'admin.createSeries': 'Create series', 'admin.category': 'Categories', 'admin.addCategory': 'Add category',
  'admin.name': 'Name', 'admin.organization': 'Organization', 'admin.addSpeaker': 'Add speaker', 'admin.createSession': 'Create session', 'admin.titleField': 'Title', 'admin.description': 'Description', 'admin.date': 'Date', 'admin.capacity': 'Capacity',
  'admin.noCategory': 'No category', 'admin.noSpeaker': 'No speaker', 'admin.noSeries': 'No series', 'admin.seriesPosition': 'Part number', 'admin.cover': 'Cover', 'admin.resource': 'Resource',
  'admin.youtube': 'YouTube recordings', 'admin.youtubeHint': 'Paste the YouTube link after uploading it. Students will watch it inside the session page.', 'admin.videoSession': 'Session', 'admin.videoTitle': 'Recording title',
  'admin.youtubeUrl': 'YouTube URL', 'admin.addRecording': 'Add recording', 'admin.preview': 'Preview before saving', 'admin.push': 'Send Push Notification', 'admin.pushTitle': 'Title', 'admin.pushBody': 'Message', 'admin.pushPath': 'Path inside the app', 'admin.sendPush': 'Send notification',
}

type Key = keyof typeof ar
type UiContextValue = {
  language: Language
  theme: Theme
  direction: 'rtl' | 'ltr'
  locale: string
  t: (key: Key, vars?: Record<string, string | number>) => string
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const UiContext = createContext<UiContextValue | null>(null)

function initialTheme(): Theme {
  const stored = localStorage.getItem('sessions-theme')
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => localStorage.getItem('sessions-language') === 'en' ? 'en' : 'ar')
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    localStorage.setItem('sessions-language', language)
  }, [language])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    localStorage.setItem('sessions-theme', theme)
  }, [theme])

  const value = useMemo<UiContextValue>(() => ({
    language,
    theme,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    locale: language === 'ar' ? 'ar-SA' : 'en-GB',
    t: (key, vars) => {
      let value = (language === 'ar' ? ar : en)[key]
      for (const [name, replacement] of Object.entries(vars ?? {})) value = value.replaceAll(`{${name}}`, String(replacement))
      return value
    },
    setLanguage: setLanguageState,
    toggleLanguage: () => setLanguageState((current) => current === 'ar' ? 'en' : 'ar'),
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((current) => current === 'dark' ? 'light' : 'dark'),
  }), [language, theme])

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>
}

export function useUi() {
  const context = useContext(UiContext)
  if (!context) throw new Error('useUi must be used inside UiProvider')
  return context
}
