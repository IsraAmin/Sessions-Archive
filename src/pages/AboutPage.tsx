import { Link } from 'react-router-dom'
import '../landing.css'

const features = [
  ['أرشيف واحد لكل السيشنات', 'بدل ما التسجيلات والروابط تضيع بين الجروبات والدرايف، كل المحتوى يتجمع في مكان واحد مرتب وسهل الرجوع له.'],
  ['بحث أسرع وأذكى', 'ابحث بعنوان السيشن، الوصف، التصنيف أو اسم المتحدث ووصل للمحتوى المطلوب بدون تشتت.'],
  ['احفظ وارجع لاحقًا', 'احتفظ بالسيشنات المهمة في قائمتك الخاصة وارجع لها وقت ما تحتاجها.'],
  ['تجربة على كل أجهزتك', 'واجهة حديثة ومتجاوبة مصممة لتعمل بسلاسة على الموبايل والتابلت والديسكتوب.'],
  ['المتحدثون والفعاليات', 'اكتشف المحتوى من خلال المتحدثين والفعاليات والتصنيفات بدل الاعتماد على روابط منفصلة.'],
  ['محتوى يستمر معك', 'السيشنات السابقة تبقى محفوظة، والسيشنات الجديدة تنضم للأرشيف ليكبر مع الوقت.'],
]

export function AboutPage() {
  return (
    <main className="landing" dir="rtl">
      <section className="landing-hero">
        <div className="landing-orb landing-orb-one" />
        <div className="landing-orb landing-orb-two" />
        <div className="landing-hero-inner">
          <span className="landing-kicker">SESSIONS ARCHIVE · أرشيف ريبيد</span>
          <h1>كل سيشن مهمة.<br/><span>في مكان واحد.</span></h1>
          <p className="landing-lead">منصة تجمع السيشنات التعليمية وتُنظّمها في أرشيف واضح وسهل البحث، عشان المعرفة ما تضيع بين روابط الجروبات والملفات المتفرقة.</p>
          <div className="landing-actions">
            <Link className="landing-primary" to="/sessions">استكشف السيشنات <span>←</span></Link>
            <Link className="landing-secondary" to="/auth">أنشئ حسابك</Link>
          </div>
          <div className="landing-trust">
            <span>✦ بحث وتصنيفات</span><span>✦ حفظ السيشنات</span><span>✦ متاح من أي جهاز</span>
          </div>
        </div>
        <div className="landing-preview" aria-hidden="true">
          <div className="preview-top"><i/><i/><i/><b>Sessions Archive</b></div>
          <div className="preview-search">⌕ &nbsp; ابحث عن سيشن، متحدث، أو موضوع...</div>
          <div className="preview-grid">
            <article><em>تطوير</em><strong>رحلتك تبدأ من سيشن</strong><small>محتوى محفوظ للرجوع إليه دائمًا</small></article>
            <article><em>تقنية</em><strong>المعرفة ما بتضيع</strong><small>كل المصادر في مكان واحد</small></article>
            <article><em>مجتمع</em><strong>اكتشف وتعلّم واحفظ</strong><small>أرشيف ينمو مع كل سيشن</small></article>
          </div>
        </div>
      </section>

      <section className="landing-problem">
        <span>الفكرة ببساطة</span>
        <h2>السيشن خلصت، لكن قيمتها ما مفروض تنتهي.</h2>
        <p>كتير من المحتوى المفيد بيتشارك مرة في جروب، وبعد فترة الرابط يضيع وسط الرسائل. Sessions Archive اتعمل عشان يحوّل المحتوى المتفرق إلى مكتبة مرتبة، مستمرة، وسهلة الوصول.</p>
      </section>

      <section className="landing-features">
        <div className="landing-section-head"><span>مصممة للطالب</span><h2>أقل تشتت. وصول أسرع. استفادة أكبر.</h2></div>
        <div className="landing-feature-grid">
          {features.map(([title, text], index) => <article key={title}><b>{String(index + 1).padStart(2, '0')}</b><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>

      <section className="landing-flow">
        <div><span>كيف تستخدمها؟</span><h2>ثلاث خطوات، والباقي علينا.</h2></div>
        <ol>
          <li><b>01</b><strong>اكتشف</strong><p>تصفح السيشنات والفعاليات أو استخدم البحث.</p></li>
          <li><b>02</b><strong>اختار</strong><p>افتح التفاصيل، اعرف المتحدث وشوف الموارد المتاحة.</p></li>
          <li><b>03</b><strong>احفظ</strong><p>أضف المهم لقائمتك وارجع له في أي وقت.</p></li>
        </ol>
      </section>

      <section className="landing-cta">
        <span>المعرفة تستاهل مكان يليق بيها.</span>
        <h2>ابدأ من السيشن اللي فاتتك.</h2>
        <p>واخلي Sessions Archive هو المكان الأول اللي ترجع له لما تحتاج محتوى سيشن قديمة أو جديدة.</p>
        <Link className="landing-primary landing-primary-light" to="/sessions">دخول الأرشيف <span>←</span></Link>
      </section>
    </main>
  )
}
