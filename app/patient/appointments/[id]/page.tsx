import { notFound } from "next/navigation";
import { requireIdentity } from "@/lib/auth";
import { uuid } from "@/lib/validation";
import { getLocale, renderTime } from "@/lib/i18n";
import { t, dateLabel, statusLabel } from "@/lib/utils";
import { Badge, LinkButton } from "@/components/ui";
import { CancelAppointment } from "@/components/dashboard/patient-dashboard";
import type { Appointment } from "@/types";
export const metadata = {
  title: "Appointment details",
  robots: { index: false, follow: false },
};
export default async function AppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const [identity, locale] = await Promise.all([
    requireIdentity(`/patient/appointments/${id}`),
    getLocale(),
  ]);
  const { data, error } = await identity.db
    .from("clinic_appointments")
    .select(
      "*,doctors:clinic_doctors(id,slug,name,name_ar,bio,bio_ar,photo_url,city,address,languages,years_experience,price,currency,is_verified,is_active,is_demo,consultation_types)",
    )
    .eq("id", id)
    .eq("patient_id", identity.user.id)
    .maybeSingle();
  if (error || !data) notFound();
  const a = data as unknown as Appointment;
  return (
    <div className="container page-shell" style={{ maxWidth: 820 }}>
      <div className="page-heading">
        <span className="eyebrow">
          {t(locale, "Your appointment", "موعدك")}
        </span>
        <h1>
          {t(locale, "The details of your next step.", "تفاصيل خطوتك التالية.")}
        </h1>
      </div>
      <div className="card" style={{ padding: 30 }}>
        <Badge className="badge-teal">{statusLabel(a.status, locale)}</Badge>
        {a.doctors?.is_demo && (
          <p className="success-notice" style={{ marginTop: 20 }}>
            {t(
              locale,
              "Development appointment. This does not arrange real medical care.",
              "موعد للاختبار. لا يمثل موعد رعاية طبية حقيقية.",
            )}
          </p>
        )}
        {[
          [
            t(locale, "Doctor", "الطبيب"),
            a.doctors
              ? locale === "ar"
                ? a.doctors.name_ar || a.doctors.name
                : a.doctors.name
              : "—",
          ],
          [
            t(locale, "Date & time", "التاريخ والوقت"),
            dateLabel(a.start_at, locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          ],
          [
            t(locale, "Time zone", "المنطقة الزمنية"),
            t(locale, "Cairo time", "توقيت القاهرة"),
          ],
          [
            t(locale, "Visit type", "نوع الزيارة"),
            a.consultation_type === "video"
              ? t(locale, "Video consultation", "استشارة فيديو")
              : t(locale, "In-person visit", "زيارة في العيادة"),
          ],
          [t(locale, "Location", "الموقع"), a.doctors?.address || "—"],
          [t(locale, "Reason for visit", "سبب الزيارة"), a.reason],
        ].map(([label, value]) => (
          <div className="summary-row" key={label}>
            <span>{label}</span>
            <span
              style={{
                maxWidth: "70%",
                whiteSpace: "pre-line",
                overflowWrap: "anywhere",
              }}
            >
              {value}
            </span>
          </div>
        ))}
        <div className="booking-nav">
          <LinkButton href="/patient" variant="secondary">
            {t(locale, "Back to my care space", "العودة لحساب الرعاية")}
          </LinkButton>
          {["pending", "confirmed"].includes(a.status) &&
            new Date(a.start_at).getTime() > renderTime() && (
              <CancelAppointment id={a.id} />
            )}
        </div>
      </div>
    </div>
  );
}
