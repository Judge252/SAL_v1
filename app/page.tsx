import Link from "next/link";
import {
  ArrowUpRight,
  MessageCircle,
  Search,
  CalendarDays,
  ShieldCheck,
  LockKeyhole,
  HeartHandshake,
  MessagesSquare,
} from "lucide-react";
import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { getDoctors, getSpecialties } from "@/lib/data/doctors";
import { SalMascot } from "@/components/sal/mascot";
import { SalVoiceExperience } from "@/components/sal/voice-experience";
import { liveHistory } from "@/lib/sal/live-session";
import { salOwner, ownedSession } from "@/lib/sal/session";
import { uuid } from "@/lib/validation";
import type { Message, SalSession } from "@/types";
import { ProductPreview } from "@/components/sal/product-preview";
import { DoctorCard } from "@/components/doctors/doctor-card";
import { LinkButton } from "@/components/ui";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const locale = await getLocale();
  const query = await searchParams;
  let session: SalSession | null = null;
  let messages: Message[] = [];
  if (query.session && uuid.safeParse(query.session).success) {
    try {
      session = (await ownedSession(
        query.session,
        await salOwner(false),
      )) as SalSession;
      messages = await liveHistory(query.session);
    } catch {
      session = null;
    }
  }
  const [doctorResult, specialtyResult] = await Promise.allSettled([
    getDoctors(),
    getSpecialties(),
  ]);
  const doctors = doctorResult.status === "fulfilled" ? doctorResult.value : [],
    specialties =
      specialtyResult.status === "fulfilled" ? specialtyResult.value : [];
  const steps = [
    {
      icon: MessageCircle,
      title: t(locale, "Start with your words.", "ابدأ بما تشعر به."),
      body: t(
        locale,
        "No need to know the specialty. Just tell SAL what’s on your mind.",
        "لا تحتاج لمعرفة التخصص. أخبر سال بما يقلقك.",
      ),
    },
    {
      icon: MessagesSquare,
      title: t(locale, "Make sense of the details.", "نفهم التفاصيل معاً."),
      body: t(
        locale,
        "A few thoughtful questions help SAL understand your concern.",
        "بعض الأسئلة المفيدة تساعد سال على فهم ما يزعجك.",
      ),
    },
    {
      icon: Search,
      title: t(locale, "Find care that fits.", "ابحث عن رعاية تناسبك."),
      body: t(
        locale,
        "Explore the right kind of care and matching doctors in our directory.",
        "استكشف نوع الرعاية المناسب والأطباء المطابقين في دليلنا.",
      ),
    },
    {
      icon: CalendarDays,
      title: t(locale, "Take the next step.", "اتخذ خطوتك التالية."),
      body: t(
        locale,
        "Choose a doctor and an available time. Your appointment, in one place.",
        "اختر طبيباً ووقتاً متاحاً. موعدك في مكان واحد.",
      ),
    },
  ];
  return (
    <>
      <SalVoiceExperience
        key={`${locale}:${session?.id || "new"}`}
        home
        session={session}
        initialMessages={messages}
        emergencyPhone={process.env.EMERGENCY_PHONE || null}
      />
      <section
        className="journey-strip"
        aria-label={t(locale, "Your care journey", "رحلة رعايتك")}
      >
        <div className="container journey-inner">
          {[
            [
              t(locale, "Talk", "تحدث"),
              t(locale, "Start with what you feel", "ابدأ بما تشعر به"),
            ],
            [
              t(locale, "Understand", "افهم"),
              t(locale, "Find a little clarity", "احصل على وضوح أكثر"),
            ],
            [
              t(locale, "Find care", "جد الرعاية"),
              t(
                locale,
                "Meet the right kind of doctor",
                "تعرف على التخصص المناسب",
              ),
            ],
            [
              t(locale, "Book", "احجز"),
              t(locale, "Choose your next step", "اختر خطوتك التالية"),
            ],
          ].map(([name, desc], i) => (
            <div className="journey-step" key={name}>
              <span>0{i + 1}</span>
              <div>
                <strong>{name}</strong>
                <small>{desc}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="section" id="how-it-works">
        <div className="container how-grid">
          <div className="how-copy">
            <span className="eyebrow">
              {t(locale, "A simpler beginning", "بداية أبسط")}
            </span>
            <h2>
              {t(
                locale,
                "You don’t need all the answers.",
                "لا تحتاج لمعرفة كل الإجابات.",
              )}
            </h2>
            <p>
              {t(
                locale,
                "Healthcare can feel complicated. Finding where to begin shouldn’t be. SAL helps you turn a concern into a thoughtful next step.",
                "قد تبدو الرعاية الصحية معقدة. لكن معرفة من أين تبدأ يجب أن تكون سهلة. سال يساعدك على تحويل ما يقلقك إلى خطوة واضحة.",
              )}
            </p>
            <Link href="/sal" className="text-link">
              {t(locale, "See how SAL can help", "اكتشف كيف يساعدك سال")}
              <ArrowUpRight size={16} className="directional" />
            </Link>
          </div>
          <div className="how-steps">
            {steps.map((step, i) => (
              <div className="how-step" key={i}>
                <div className="step-top">
                  <span>0{i + 1}</span>
                  <step.icon size={23} strokeWidth={1.5} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section preview-section">
        <div className="container">
          <div className="section-intro">
            <div>
              <span className="eyebrow">
                {t(
                  locale,
                  "One conversation. A clearer path.",
                  "محادثة واحدة. وطريق أوضح.",
                )}
              </span>
              <h2>
                {t(
                  locale,
                  "A companion for the in-between.",
                  "رفيق يوضح الخطوة التالية.",
                )}
              </h2>
            </div>
            <p>
              {t(
                locale,
                "Between feeling something is wrong and knowing what to do next. That’s where SAL helps.",
                "بين الشعور بأن هناك مشكلة، ومعرفة ماذا تفعل بعدها. هنا يساعدك سال.",
              )}
            </p>
          </div>
          <ProductPreview
            doctors={doctors.filter((d) =>
              d.specialties.some((s) => s.slug === "gastroenterology"),
            )}
          />
        </div>
      </section>
      <section className="section discovery">
        <div className="container">
          <div className="section-intro">
            <div>
              <span className="eyebrow">
                {t(locale, "Your care. Your choice.", "رعايتك. اختيارك.")}
              </span>
              <h2>
                {t(
                  locale,
                  "Already know what you need?",
                  "تعرف ما تحتاجه بالفعل؟",
                )}
              </h2>
            </div>
            <Link href="/doctors" className="text-link">
              {t(locale, "Explore all doctors", "استكشف جميع الأطباء")}
              <ArrowUpRight size={16} className="directional" />
            </Link>
          </div>
          <form action="/doctors" className="search-inline">
            <Search size={19} />
            <input
              name="q"
              aria-label={t(
                locale,
                "Search doctors or specialties",
                "ابحث عن طبيب أو تخصص",
              )}
              placeholder={t(
                locale,
                "Search a doctor, specialty, or concern",
                "ابحث عن طبيب، تخصص، أو ما يقلقك",
              )}
              maxLength={100}
            />
            <button className="button button-primary">
              {t(locale, "Find care", "ابحث عن رعاية")}
            </button>
          </form>
          <div className="specialty-links">
            {specialties.slice(0, 6).map((s) => (
              <Link
                className="chip"
                key={s.id}
                href={`/doctors?specialty=${s.slug}`}
              >
                {locale === "ar" ? s.name_ar : s.name_en}
              </Link>
            ))}
          </div>
          {doctors.length > 0 ? (
            <div className="doctor-grid">
              {doctors.slice(0, 3).map((d) => (
                <DoctorCard key={d.id} doctor={d} locale={locale} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>
                {doctorResult.status === "rejected"
                  ? t(
                      locale,
                      "We couldn’t load doctors right now.",
                      "تعذر تحميل الأطباء الآن.",
                    )
                  : t(
                      locale,
                      "New doctor profiles will appear here.",
                      "ستظهر ملفات الأطباء الجديدة هنا.",
                    )}
              </h3>
              <p>
                {t(
                  locale,
                  "You can still talk to SAL to explore an appropriate next step.",
                  "يمكنك التحدث مع سال لاستكشاف الخطوة المناسبة.",
                )}
              </p>
              <LinkButton href="/doctors" variant="secondary">
                {t(locale, "Open the directory", "افتح الدليل")}
              </LinkButton>
            </div>
          )}
        </div>
      </section>
      <section className="section trust-section">
        <div className="container trust-inner">
          <div>
            <span className="eyebrow">
              {t(locale, "Thoughtfully, always", "بعناية، دائماً")}
            </span>
            <h2>
              {t(
                locale,
                "A little support. A clear boundary.",
                "دعم يطمئنك. وحدود واضحة.",
              )}
            </h2>
          </div>
          <div className="trust-points">
            <div className="trust-point">
              <HeartHandshake size={25} strokeWidth={1.5} />
              <h3>
                {t(locale, "Guidance with humility", "إرشاد دون يقين زائف")}
              </h3>
              <p>
                {t(
                  locale,
                  "SAL helps you navigate care. A licensed doctor provides an evaluation and diagnosis.",
                  "سال يساعدك على الوصول للرعاية. والطبيب المرخص يقدم التقييم والتشخيص.",
                )}
              </p>
            </div>
            <div className="trust-point">
              <LockKeyhole size={25} strokeWidth={1.5} />
              <h3>
                {t(locale, "Your words deserve care", "كلماتك تستحق الاهتمام")}
              </h3>
              <p>
                {t(
                  locale,
                  "Conversations are protected by account and session access controls. No health text is sent to analytics.",
                  "المحادثات محمية بصلاحيات الحساب والجلسة. لا نرسل النصوص الصحية لخدمات التحليلات.",
                )}
              </p>
            </div>
            <p className="trust-note">
              <ShieldCheck
                size={15}
                style={{
                  display: "inline",
                  verticalAlign: "middle",
                  marginInlineEnd: 8,
                }}
              />
              {t(
                locale,
                "For severe or emergency symptoms, contact your local emergency service. SAL cannot provide emergency care.",
                "للأعراض الشديدة أو الطارئة، اتصل بالطوارئ المحلية. سال لا يقدم رعاية طارئة.",
              )}
            </p>
          </div>
        </div>
      </section>
      <section className="final-cta">
        <div className="container final-inner">
          <div>
            <span className="eyebrow light">
              {t(locale, "Start wherever you are", "ابدأ من حيث أنت")}
            </span>
            <h2>
              {t(locale, "Not sure where to start?", "لا تعرف من أين تبدأ؟")}
            </h2>
            <p>
              {t(
                locale,
                "You don’t have to figure it out alone.",
                "لا تحتاج لمعرفة الخطوة التالية وحدك.",
              )}
            </p>
            <LinkButton href="/sal" className="button-sal" arrow>
              {t(locale, "Talk to SAL", "تحدث مع سال")}
            </LinkButton>
          </div>
          <SalMascot size={300} />
        </div>
      </section>
    </>
  );
}
