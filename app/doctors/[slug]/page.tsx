import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, CalendarDays, Languages, BadgeCheck } from "lucide-react";
import { getDoctorBySlug, getAvailableSlots } from "@/lib/data/doctors";
import { getIdentity } from "@/lib/auth";
import { getLocale } from "@/lib/i18n";
import { t, money, specialtyName, dateLabel } from "@/lib/utils";
import { DoctorAvatar } from "@/components/doctors/doctor-card";
import { Badge, LinkButton } from "@/components/ui";
import { FavoriteButton } from "@/components/doctors/favorite";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params,
    locale = await getLocale(),
    doctor = await getDoctorBySlug(slug);
  return {
    title: doctor
      ? locale === "ar"
        ? doctor.name_ar || doctor.name
        : doctor.name
      : "Doctor profile",
    description: doctor?.bio.slice(0, 160),
  };
}
export default async function DoctorPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [doctor, locale, identity] = await Promise.all([
    getDoctorBySlug(slug),
    getLocale(),
    getIdentity(),
  ]);
  if (!doctor) notFound();
  const slots = await getAvailableSlots(doctor.id);
  const favorite = identity
    ? await identity.db
        .from("clinic_favorites")
        .select("doctor_id")
        .eq("user_id", identity.user.id)
        .eq("doctor_id", doctor.id)
        .maybeSingle()
    : null;
  return (
    <div className="container page-shell">
      <div className="doctor-profile-grid">
        <article className="card doctor-profile-card">
          <div className="doctor-profile-identity">
            <DoctorAvatar doctor={doctor} size={120} locale={locale} />
            <div>
              {doctor.is_demo ? (
                <Badge className="badge-demo">
                  {t(
                    locale,
                    "Fictional development profile",
                    "ملف افتراضي للاختبار",
                  )}
                </Badge>
              ) : doctor.is_verified ? (
                <Badge className="badge-teal">
                  <BadgeCheck size={13} />
                  {t(locale, "Verified profile", "ملف موثق")}
                </Badge>
              ) : null}
              <h1 style={{ marginTop: 12 }}>
                {locale === "ar" ? doctor.name_ar || doctor.name : doctor.name}
              </h1>
              <p className="doctor-specialty">
                {doctor.specialties
                  .map((s) => specialtyName(s, locale))
                  .join(" · ")}
              </p>
            </div>
          </div>
          {doctor.is_demo && (
            <p className="success-notice" style={{ marginBottom: 24 }}>
              {t(
                locale,
                "This is test data. Bookings with this profile do not arrange real medical care.",
                "هذا ملف للاختبار. الحجز عبره لا يحدد موعد رعاية طبية حقيقية.",
              )}
            </p>
          )}
          <section className="doctor-profile-section">
            <h2>{t(locale, "About this doctor", "عن الطبيب")}</h2>
            <p>{locale === "ar" ? doctor.bio_ar || doctor.bio : doctor.bio}</p>
            {doctor.years_experience !== null && (
              <p style={{ marginTop: 15 }}>
                {t(
                  locale,
                  `${doctor.years_experience} years of experience`,
                  `${doctor.years_experience} سنوات من الخبرة`,
                )}
              </p>
            )}
          </section>
          <section className="doctor-profile-section">
            <h2>{t(locale, "Location", "الموقع")}</h2>
            <p>
              <MapPin
                size={15}
                style={{
                  display: "inline",
                  verticalAlign: "middle",
                  marginInlineEnd: 7,
                }}
              />
              {doctor.city}
            </p>
            <p style={{ marginTop: 8 }}>{doctor.address}</p>
          </section>
          <section className="doctor-profile-section">
            <h2>
              {t(
                locale,
                "Languages & consultation types",
                "اللغات وأنواع الاستشارة",
              )}
            </h2>
            <p>
              <Languages
                size={15}
                style={{
                  display: "inline",
                  verticalAlign: "middle",
                  marginInlineEnd: 7,
                }}
              />
              {doctor.languages
                .map((l) =>
                  locale === "ar"
                    ? { Arabic: "العربية", English: "الإنجليزية" }[l] || l
                    : l,
                )
                .join(" · ")}
            </p>
            <div className="chip-row" style={{ marginTop: 15 }}>
              {doctor.consultation_types.map((type) => (
                <Badge key={type}>
                  {type === "video"
                    ? t(locale, "Video consultation", "استشارة فيديو")
                    : t(locale, "In-person visit", "زيارة في العيادة")}
                </Badge>
              ))}
            </div>
          </section>
        </article>
        <aside className="card booking-panel">
          <span className="eyebrow">
            {t(locale, "Your next step", "خطوتك التالية")}
          </span>
          <h2>{t(locale, "Make time for care.", "حدد وقتاً لرعايتك.")}</h2>
          <p>
            {t(
              locale,
              "Choose an available appointment that works for you.",
              "اختر موعداً متاحاً يناسبك.",
            )}
          </p>
          <div className="doctor-price">
            <strong>{money(doctor.price, doctor.currency, locale)}</strong>
            <small>{t(locale, "per consultation", "للاستشارة")}</small>
          </div>
          {slots[0] ? (
            <p className="slot-preview">
              <CalendarDays size={17} />
              {t(locale, "Next available: ", "أقرب موعد: ")}
              {dateLabel(slots[0].start_at, locale, {
                weekday: "short",
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          ) : (
            <p className="slot-preview">
              {t(
                locale,
                "No appointment times available yet.",
                "لا يوجد مواعيد متاحة حالياً.",
              )}
            </p>
          )}
          <LinkButton href={`/booking/${doctor.slug}`}>
            {t(locale, "Book an appointment", "احجز موعداً")}
          </LinkButton>
          <FavoriteButton
            doctorId={doctor.id}
            slug={doctor.slug}
            saved={!!favorite?.data}
          />
          <p className="time-zone-note">
            {t(
              locale,
              "Appointment times are shown in Cairo time.",
              "المواعيد بتوقيت القاهرة.",
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
