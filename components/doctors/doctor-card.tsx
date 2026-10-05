import Image from "next/image";
import { MapPin, Languages, BadgeCheck, CalendarDays } from "lucide-react";
import { Badge, LinkButton } from "@/components/ui";
import { t, money, specialtyName } from "@/lib/utils";
import type { Doctor, Locale, Slot } from "@/types";
export function DoctorAvatar({
  doctor,
  size = 62,
  locale = "en",
}: {
  doctor: Doctor;
  size?: number;
  locale?: Locale;
}) {
  return (
    <div className="doctor-avatar">
      {doctor.photo_url ? (
        <Image
          src={doctor.photo_url}
          width={size}
          height={size}
          alt={locale === "ar" ? doctor.name_ar || doctor.name : doctor.name}
          sizes={`${size}px`}
        />
      ) : (
        <span aria-hidden="true">
          {doctor.name
            .replace(/^Dr\.\s*/, "")
            .split(" ")
            .slice(0, 2)
            .map((x) => x[0])
            .join("")}
        </span>
      )}
    </div>
  );
}
export function DoctorCard({
  doctor,
  locale,
  availability,
}: {
  doctor: Doctor;
  locale: Locale;
  availability?: Slot[];
}) {
  return (
    <article className="card doctor-card">
      {doctor.is_demo ? (
        <Badge className="badge-demo">
          {t(
            locale,
            "Demo profile · test bookings only",
            "ملف تجريبي · حجوزات للاختبار فقط",
          )}
        </Badge>
      ) : doctor.is_verified ? (
        <Badge className="badge-teal">
          <BadgeCheck size={13} />
          {t(locale, "Verified profile", "ملف موثّق")}
        </Badge>
      ) : null}
      <div className="doctor-card-head">
        <DoctorAvatar doctor={doctor} locale={locale} />
        <div>
          <h3>
            <bdi lang={locale === "ar" && doctor.name_ar ? "ar" : "en"}>
              {locale === "ar" ? doctor.name_ar || doctor.name : doctor.name}
            </bdi>
          </h3>
          <p className="doctor-specialty">
            {doctor.specialties[0]
              ? specialtyName(doctor.specialties[0], locale)
              : t(locale, "Doctor", "طبيب")}
          </p>
        </div>
      </div>
      {doctor.city && (
        <p className="doctor-meta">
          <MapPin size={14} />
          <bdi>{doctor.city}</bdi>
        </p>
      )}
      <p className="doctor-meta">
        <Languages size={14} />
        <bdi>
          {doctor.languages
            .map((l) =>
              locale === "ar"
                ? { Arabic: "العربية", English: "الإنجليزية" }[l] || l
                : l,
            )
            .join(" · ")}
        </bdi>
      </p>
      <div className="doctor-price">
        <span>
          <bdi>{money(doctor.price, doctor.currency, locale)}</bdi>
        </span>{" "}
        <small>{t(locale, "per consultation", "للاستشارة")}</small>
      </div>
      {availability !== undefined && (
        <p className="doctor-meta doctor-next-slot">
          <CalendarDays size={14} />
          {availability.length ? (
            <span>
              {t(locale, "Next: ", "التالي: ")}
              <bdi>
                {new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Cairo",
                }).format(new Date(availability[0].start_at))}
              </bdi>
            </span>
          ) : (
            t(
              locale,
              "No bookable times currently",
              "لا توجد مواعيد متاحة حاليًا",
            )
          )}
        </p>
      )}
      <div className="doctor-actions">
        <LinkButton href={`/doctors/${doctor.slug}`} variant="secondary">
          {t(locale, "View profile", "عرض الملف")}
        </LinkButton>
        <LinkButton href={`/booking/${doctor.slug}`}>
          {t(locale, "Book a visit", "احجز موعدًا")}
        </LinkButton>
      </div>
    </article>
  );
}
