import { requireIdentity } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { AdminDashboard } from "@/components/dashboard/admin-dashboard";
import type {
  Appointment,
  Doctor,
  KnowledgeDocument,
  Profile,
  Specialty,
} from "@/types";
export const metadata = {
  title: "Clinic administration",
  robots: { index: false, follow: false },
};
export default async function AdminPage() {
  await requireIdentity("/admin", ["admin"]);
  const db = adminDb();
  const [doctors, specialties, links, appointments, users, documents] =
    await Promise.all([
      db.from("clinic_doctors").select("*").order("name"),
      db.from("clinic_specialties").select("*").order("name_en"),
      db.from("clinic_doctor_specialties").select("*"),
      db
        .from("clinic_appointments")
        .select("*,doctors:clinic_doctors(name)")
        .order("start_at", { ascending: false })
        .limit(300),
      db
        .from("clinic_profiles")
        .select("id,name,role,locale,created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("clinic_knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false }),
    ]);
  if (
    [doctors, specialties, links, appointments, users, documents].some(
      (r) => r.error,
    )
  )
    throw new Error("ADMIN_UNAVAILABLE");
  const allSpecialties = (specialties.data || []) as Specialty[];
  const allDoctors = (doctors.data || []).map((d) => ({
    ...d,
    specialties: (links.data || [])
      .filter((l) => l.doctor_id === d.id)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((l) => allSpecialties.find((s) => s.id === l.specialty_id))
      .filter(Boolean),
  })) as Doctor[];
  return (
    <div className="container page-shell">
      <AdminDashboard
        doctors={allDoctors}
        specialties={allSpecialties}
        appointments={(appointments.data || []) as unknown as Appointment[]}
        users={
          (users.data || []) as (Pick<
            Profile,
            "id" | "name" | "role" | "locale"
          > & { created_at: string })[]
        }
        documents={(documents.data || []) as KnowledgeDocument[]}
      />
    </div>
  );
}
