"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, ArrowRight } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  LinkButton,
} from "@/components/ui";
import { DoctorAvatar } from "@/components/doctors/doctor-card";
import { t, dateLabel, money } from "@/lib/utils";
import { requestJson, errorText } from "@/lib/client";
import type { Appointment, Doctor, Profile, Slot } from "@/types";
function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function BookingFlow({
  doctor,
  initialSlots,
  profile,
  initialSlot,
}: {
  doctor: Doctor;
  initialSlots: Slot[];
  profile: Profile | null;
  initialSlot?: string;
}) {
  const locale = useLocale(),
    router = useRouter(),
    initial = initialSlots.find((s) => s.id === initialSlot);
  const [slots, setSlots] = useState(initialSlots),
    [day, setDay] = useState(
      initial
        ? dayKey(initial.start_at)
        : initialSlots[0]
          ? dayKey(initialSlots[0].start_at)
          : "",
    ),
    [selected, setSelected] = useState(initial?.id || ""),
    [step, setStep] = useState(initial && profile ? 1 : 0),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [appointment, setAppointment] = useState<Appointment | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null),
    slot = slots.find((s) => s.id === selected),
    dates = [...new Set(slots.map((s) => dayKey(s.start_at)))];
  function next() {
    if (!slot) return;
    if (!profile) {
      router.push(
        `/auth?next=${encodeURIComponent(`/booking/${doctor.slug}?slot=${slot.id}`)}`,
      );
      return;
    }
    if (step === 1 && reason.trim().length < 3) {
      reasonRef.current?.focus();
      return;
    }
    setError("");
    setStep(step + 1);
  }
  async function book() {
    if (!slot) return;
    setBusy(true);
    setError("");
    try {
      const data = await requestJson<{ appointment: Appointment }>(
        "/api/appointments",
        { slotId: slot.id, reason },
      );
      setAppointment(data.appointment);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(errorText(code, locale));
      if (code === "AUTH_REQUIRED") {
        router.push(
          `/auth?next=${encodeURIComponent(`/booking/${doctor.slug}?slot=${slot.id}`)}`,
        );
      }
      if (code === "SLOT_UNAVAILABLE" || code === "INVALID_SLOT") {
        const data = await requestJson<{ slots: Slot[] }>(
          `/api/doctors/${doctor.id}/availability`,
          undefined,
          "GET",
        );
        setSlots(data.slots);
        setSelected("");
        setStep(0);
      }
    } finally {
      setBusy(false);
    }
  }
  if (appointment)
    return (
      <div className="card booking-confirmed">
        <CheckCircle2 size={44} strokeWidth={1.5} />
        <h1>{t(locale, "You’re all set.", "تم حفظ موعدك.")}</h1>
        <p>
          {doctor.is_demo
            ? t(
                locale,
                "Your test appointment has been saved. This demo booking does not arrange real medical care.",
                "تم حفظ الموعد التجريبي. هذا الحجز لا يحدد موعد رعاية طبية حقيقية.",
              )
            : t(
                locale,
                "Your appointment is confirmed. You can find the details in your care space.",
                "تم تأكيد موعدك. يمكنك الاطلاع على التفاصيل في حسابك.",
              )}
        </p>
        <div className="summary-row">
          <span>{t(locale, "Doctor", "الطبيب")}</span>
          <span>
            {locale === "ar" ? doctor.name_ar || doctor.name : doctor.name}
          </span>
        </div>
        <div className="summary-row">
          <span>{t(locale, "Appointment", "الموعد")}</span>
          <span>
            {dateLabel(appointment.start_at, locale, {
              weekday: "short",
              day: "numeric",
              month: "long",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="summary-row">
          <span>{t(locale, "Status", "الحالة")}</span>
          <span>{t(locale, "Confirmed", "مؤكد")}</span>
        </div>
        <div
          className="chip-row"
          style={{ justifyContent: "center", marginTop: 28 }}
        >
          <LinkButton href={`/patient/appointments/${appointment.id}`}>
            {t(locale, "View appointment", "عرض الموعد")}
          </LinkButton>
          <LinkButton href="/patient" variant="secondary">
            {t(locale, "My care space", "حساب الرعاية")}
          </LinkButton>
        </div>
      </div>
    );
  return (
    <div className="booking-layout">
      <section className="card booking-main">
        <div
          className="booking-stepper"
          aria-label={t(locale, "Booking progress", "خطوات الحجز")}
        >
          {[
            t(locale, "Choose a time", "اختر الوقت"),
            t(locale, "Your details", "بياناتك"),
            t(locale, "Review & confirm", "راجع وأكّد"),
          ].map((name, i) => (
            <div
              className={`booking-step ${step === i ? "active" : ""}`}
              key={i}
              aria-current={step === i ? "step" : undefined}
            >
              <span>{i + 1}</span>
              {name}
            </div>
          ))}
        </div>
        {error && (
          <p className="error-notice" role="alert" style={{ marginBottom: 22 }}>
            {error}
          </p>
        )}
        {step === 0 ? (
          <>
            <h2 style={{ fontSize: "2rem" }}>
              {t(locale, "A time that works for you.", "وقت يناسبك.")}
            </h2>
            {slots.length ? (
              <>
                <div
                  className="date-options"
                  aria-label={t(locale, "Available dates", "الأيام المتاحة")}
                >
                  {dates.map((d) => {
                    const representative = slots.find(
                      (s) => dayKey(s.start_at) === d,
                    )!;
                    return (
                      <button
                        type="button"
                        className={`date-option ${day === d ? "selected" : ""}`}
                        key={d}
                        aria-pressed={day === d}
                        onClick={() => {
                          setDay(d);
                          setSelected("");
                        }}
                      >
                        <span>
                          {dateLabel(representative.start_at, locale, {
                            weekday: "short",
                          })}
                        </span>
                        <strong>
                          {dateLabel(representative.start_at, locale, {
                            day: "numeric",
                          })}
                        </strong>
                        <span>
                          {dateLabel(representative.start_at, locale, {
                            month: "short",
                          })}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <h3 style={{ fontSize: ".9rem" }}>
                  {t(locale, "Available times", "الأوقات المتاحة")}
                </h3>
                <div className="time-options">
                  {slots
                    .filter((s) => dayKey(s.start_at) === day)
                    .map((s) => (
                      <button
                        className={`time-option ${selected === s.id ? "selected" : ""}`}
                        type="button"
                        key={s.id}
                        aria-pressed={selected === s.id}
                        onClick={() => setSelected(s.id)}
                      >
                        {dateLabel(s.start_at, locale, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {s.consultation_type === "video" &&
                          ` · ${t(locale, "Video", "فيديو")}`}
                      </button>
                    ))}
                </div>
                <p className="time-zone-note">
                  {t(
                    locale,
                    "All times are in Cairo time. Availability is checked again when you confirm.",
                    "جميع المواعيد بتوقيت القاهرة. يُتحقق من إتاحة الموعد مجدداً عند التأكيد.",
                  )}
                </p>
              </>
            ) : (
              <EmptyState
                title={t(
                  locale,
                  "No appointment times available.",
                  "لا يوجد مواعيد متاحة.",
                )}
                description={t(
                  locale,
                  "Try another doctor or check back when new availability is added.",
                  "جرّب طبيباً آخر أو عد عند إضافة مواعيد جديدة.",
                )}
              >
                <LinkButton href="/doctors" variant="secondary">
                  {t(locale, "Find another doctor", "ابحث عن طبيب آخر")}
                </LinkButton>
              </EmptyState>
            )}
          </>
        ) : step === 1 ? (
          <>
            <h2 style={{ fontSize: "2rem", marginBottom: 24 }}>
              {t(
                locale,
                "A little about your visit.",
                "بعض التفاصيل عن زيارتك.",
              )}
            </h2>
            <div className="form-grid">
              <FormField label={t(locale, "Patient", "المريض")}>
                <input className="input" value={profile?.name || ""} readOnly />
              </FormField>
              <FormField
                label={t(
                  locale,
                  "What would you like help with?",
                  "بماذا تريد المساعدة؟",
                )}
                hint={t(
                  locale,
                  "Share a brief reason for your visit. This is shared with your doctor.",
                  "اكتب سبباً مختصراً للزيارة. سيُشارك مع طبيبك.",
                )}
              >
                <textarea
                  ref={reasonRef}
                  className="textarea"
                  rows={4}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  minLength={3}
                  maxLength={2000}
                  required
                />
              </FormField>
            </div>
          </>
        ) : (
          <div className="booking-review">
            <h2 style={{ fontSize: "2rem", marginBottom: 18 }}>
              {t(locale, "One last look.", "مراجعة أخيرة.")}
            </h2>
            <p>
              {t(
                locale,
                "Check the appointment and your reason for visiting before you confirm.",
                "راجع الموعد وسبب الزيارة قبل التأكيد.",
              )}
            </p>
            <div className="summary-row">
              <span>{t(locale, "Patient", "المريض")}</span>
              <span>{profile?.name}</span>
            </div>
            <div className="summary-row">
              <span>{t(locale, "Reason for visit", "سبب الزيارة")}</span>
              <span
                style={{
                  maxWidth: "70%",
                  whiteSpace: "pre-line",
                  overflowWrap: "anywhere",
                }}
              >
                {reason}
              </span>
            </div>
            {doctor.is_demo && (
              <p className="success-notice" style={{ marginTop: 20 }}>
                {t(
                  locale,
                  "This is a development booking with a fictional doctor. It is not a real appointment.",
                  "هذا حجز للاختبار مع طبيب افتراضي. ليس موعداً حقيقياً.",
                )}
              </p>
            )}
          </div>
        )}
        <div className="booking-nav">
          {step > 0 ? (
            <Button
              variant="secondary"
              onClick={() => setStep(step - 1)}
              disabled={busy}
            >
              {t(locale, "Back", "العودة")}
            </Button>
          ) : (
            <span />
          )}
          {step < 2 ? (
            <Button
              onClick={next}
              disabled={!slot || (step === 1 && reason.trim().length < 3)}
            >
              {t(locale, "Continue", "متابعة")}
              <ArrowRight size={16} className="directional" />
            </Button>
          ) : (
            <Button onClick={() => void book()} loading={busy}>
              {t(locale, "Confirm appointment", "أكد الموعد")}
            </Button>
          )}
        </div>
      </section>
      <aside className="card booking-summary">
        <h2>{t(locale, "Your appointment.", "موعدك.")}</h2>
        {doctor.is_demo && (
          <Badge className="badge-demo">
            {t(locale, "Test booking only", "حجز للاختبار فقط")}
          </Badge>
        )}
        <div className="doctor-card-head" style={{ marginTop: 22 }}>
          <DoctorAvatar doctor={doctor} locale={locale} />
          <div>
            <h3>
              {locale === "ar" ? doctor.name_ar || doctor.name : doctor.name}
            </h3>
            <p className="doctor-specialty">
              {doctor.specialties[0]
                ? locale === "ar"
                  ? doctor.specialties[0].name_ar
                  : doctor.specialties[0].name_en
                : ""}
            </p>
          </div>
        </div>
        <div className="summary-row">
          <span>
            <CalendarDays
              size={14}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            {t(locale, "When", "الوقت")}
          </span>
          <span>
            {slot
              ? dateLabel(slot.start_at, locale, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })
              : t(locale, "Choose a time", "اختر وقتاً")}
          </span>
        </div>
        <div className="summary-row">
          <span>{t(locale, "Visit type", "نوع الزيارة")}</span>
          <span>
            {slot?.consultation_type === "video"
              ? t(locale, "Video consultation", "استشارة فيديو")
              : t(locale, "In-person visit", "زيارة في العيادة")}
          </span>
        </div>
        <div className="summary-row">
          <span>{t(locale, "Location", "الموقع")}</span>
          <span>{doctor.city}</span>
        </div>
        <div className="summary-row">
          <span>{t(locale, "Consultation fee", "رسوم الاستشارة")}</span>
          <span>{money(doctor.price, doctor.currency, locale)}</span>
        </div>
        <p className="time-zone-note">
          {t(
            locale,
            "Your booking is saved only after confirmation.",
            "يُحفظ الحجز بعد التأكيد فقط.",
          )}
        </p>
      </aside>
    </div>
  );
}
