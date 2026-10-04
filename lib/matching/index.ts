import type { Doctor, Locale } from "@/types";
export function matchDoctors(
  doctors: Doctor[],
  specialtySlugs: string[],
  locale: Locale,
  city?: string,
) {
  return doctors
    .filter(
      (d) =>
        d.is_active &&
        d.specialties.some((s) => specialtySlugs.includes(s.slug)),
    )
    .map((d) => ({
      doctor: d,
      score:
        d.specialties.filter((s) => specialtySlugs.includes(s.slug)).length *
          10 +
        (d.languages.includes(locale === "ar" ? "Arabic" : "English") ? 2 : 0) +
        (city && d.city === city ? 3 : 0),
    }))
    .sort(
      (a, b) => b.score - a.score || a.doctor.name.localeCompare(b.doctor.name),
    )
    .slice(0, 3)
    .map((d) => d.doctor);
}
