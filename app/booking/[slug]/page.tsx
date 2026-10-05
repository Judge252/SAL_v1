import { notFound } from "next/navigation";
import { getDoctorBySlug, getAvailableSlots } from "@/lib/data/doctors";
import { getIdentity } from "@/lib/auth";
import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { BookingFlow } from "@/components/booking/booking-flow";
export const metadata = {
  title: "Book an appointment",
  robots: { index: false, follow: false },
};
export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ slot?: string }>;
}) {
  const [{ slug }, query, identity, locale] = await Promise.all([
    params,
    searchParams,
    getIdentity(),
    getLocale(),
  ]);
  const doctor = await getDoctorBySlug(slug);
  if (!doctor) notFound();
  const slots = await getAvailableSlots(doctor.id);
  return (
    <div className="container page-shell">
      <div className="page-heading">
        <span className="eyebrow">
          {t(locale, "The next step, made simple", "خطوة تالية أبسط")}
        </span>
        <h1>{t(locale, "Make time for your care.", "حدد وقتًا لرعايتك.")}</h1>
      </div>
      <BookingFlow
        doctor={doctor}
        initialSlots={slots}
        profile={identity?.profile || null}
        initialSlot={query.slot}
      />
    </div>
  );
}
