import "server-only";
import { userDb } from "@/lib/supabase/server";
import type { Appointment, SalSession } from "@/types";
export async function getPatientData(userId: string) {
  const db = await userDb();
  const [appointments, sessions, favorites] = await Promise.all([
    db
      .from("clinic_appointments")
      .select(
        "*,doctors:clinic_doctors(id,slug,name,name_ar,bio,bio_ar,photo_url,city,address,languages,years_experience,price,currency,is_verified,is_active,is_demo,consultation_types)",
      )
      .eq("patient_id", userId)
      .order("start_at", { ascending: false }),
    db
      .from("clinic_sal_sessions")
      .select("id,title,locale,created_at,updated_at,user_id")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    db.from("clinic_favorites").select("doctor_id").eq("user_id", userId),
  ]);
  if (appointments.error || sessions.error || favorites.error)
    throw new Error("DASHBOARD_UNAVAILABLE");
  return {
    appointments: (appointments.data || []) as unknown as Appointment[],
    sessions: (sessions.data || []) as SalSession[],
    favoriteIds: (favorites.data || []).map((f) => f.doctor_id as string),
  };
}
