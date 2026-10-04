import { requireIdentity } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { getLocale, renderTime } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { DoctorDashboard } from "@/components/dashboard/doctor-dashboard";
import type { Doctor, Appointment, Slot } from "@/types";
export const metadata = {
  title: "Doctor care space",
  robots: { index: false, follow: false },
};
export default async function DoctorPage() {
  const [identity, locale] = await Promise.all([
    requireIdentity("/doctor", ["doctor"]),
    getLocale(),
  ]);
  const db = adminDb(),
    { data: doctor, error } = await db
      .from("clinic_doctors")
      .select("*")
      .eq("profile_id", identity.user.id)
      .maybeSingle();
  if (error) throw error;
  if (!doctor)
    return (
      <div className="container page-shell">
        <EmptyState
          title={t(
            locale,
            "Your doctor profile is not connected yet.",
            "لم يُربط ملف الطبيب بحسابك بعد.",
          )}
          description={t(
            locale,
            "Ask your clinic administrator to connect your account to a doctor profile.",
            "اطلب من مسؤول العيادة ربط حسابك بملف الطبيب.",
          )}
        />
      </div>
    );
  const [appointments, slots] = await Promise.all([
    db
      .from("clinic_appointments")
      .select("*,patient:clinic_profiles(name)")
      .eq("doctor_id", doctor.id)
      .order("start_at"),
    db
      .from("clinic_doctor_availability")
      .select("*")
      .eq("doctor_id", doctor.id)
      .eq("is_active", true)
      .gt("start_at", new Date().toISOString())
      .order("start_at"),
  ]);
  if (appointments.error || slots.error)
    throw new Error("DASHBOARD_UNAVAILABLE");
  return (
    <div className="container page-shell">
      <DoctorDashboard
        renderTime={renderTime()}
        profile={identity.profile}
        doctor={{ ...doctor, specialties: [] } as Doctor}
        appointments={(appointments.data || []) as unknown as Appointment[]}
        slots={(slots.data || []) as Slot[]}
      />
    </div>
  );
}
