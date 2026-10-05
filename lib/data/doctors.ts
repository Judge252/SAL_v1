import "server-only";
import { adminDb } from "@/lib/supabase/admin";
import type { Doctor, Slot, Specialty } from "@/types";
const specialtyFields = "id,slug,name_en,name_ar,description_en,description_ar";
const doctorFields = `id,slug,name,name_ar,bio,bio_ar,photo_url,city,address,languages,years_experience,price,currency,is_verified,is_active,is_demo,consultation_types,clinic_doctor_specialties(is_primary,clinic_specialties(${specialtyFields}))`;
type RawDoctor = Omit<Doctor, "specialties" | "profile_id"> & {
  clinic_doctor_specialties: {
    is_primary: boolean;
    clinic_specialties: Specialty;
  }[];
};
function normalize(row: RawDoctor): Doctor {
  const { clinic_doctor_specialties: links, ...doctor } = row;
  return {
    ...doctor,
    profile_id: null,
    specialties: (links || [])
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((x) => x.clinic_specialties)
      .filter(Boolean),
  };
}
export async function getSpecialties(): Promise<Specialty[]> {
  const { data, error } = await adminDb()
    .from("clinic_specialties")
    .select(specialtyFields)
    .order("name_en");
  if (error) throw new Error("CATALOG_UNAVAILABLE");
  return data || [];
}
export async function getDoctors(
  filters: {
    q?: string;
    specialty?: string;
    city?: string;
    language?: string;
    type?: string;
  } = {},
): Promise<Doctor[]> {
  const { data, error } = await adminDb()
    .from("clinic_doctors")
    .select(doctorFields)
    .eq("is_active", true)
    .order("name")
    .limit(200);
  if (error) throw new Error("CATALOG_UNAVAILABLE");
  const query = (filters.q || "").toLocaleLowerCase();
  return ((data || []) as unknown as RawDoctor[])
    .map(normalize)
    .filter(
      (d) =>
        (!query ||
          [
            d.name,
            d.name_ar,
            d.bio,
            d.bio_ar,
            ...d.specialties.flatMap((s) => [s.name_ar, s.name_en]),
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query)) &&
        (!filters.specialty ||
          d.specialties.some((s) => s.slug === filters.specialty)) &&
        (!filters.city || d.city === filters.city) &&
        (!filters.language || d.languages.includes(filters.language)) &&
        (!filters.type || d.consultation_types.includes(filters.type)),
    );
}
export async function getDoctorBySlug(slug: string): Promise<Doctor | null> {
  const { data, error } = await adminDb()
    .from("clinic_doctors")
    .select(doctorFields)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error("CATALOG_UNAVAILABLE");
  return data ? normalize(data as unknown as RawDoctor) : null;
}
export async function getAvailableSlots(doctorId: string): Promise<Slot[]> {
  const { data, error } = await adminDb().rpc("clinic_available_slots", {
    p_doctor: doctorId,
  });
  if (error) throw new Error("AVAILABILITY_UNAVAILABLE");
  return data || [];
}
