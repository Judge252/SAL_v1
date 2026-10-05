import type { Metadata } from "next";
import { directoryFilters } from "@/lib/validation";
import { getDoctors, getSpecialties } from "@/lib/data/doctors";
import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { Directory } from "@/components/doctors/directory";
export const metadata: Metadata = { title: "Find a doctor" };
export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, locale] = await Promise.all([searchParams, getLocale()]);
  const parsed = directoryFilters.safeParse(params);
  const filters = parsed.success ? parsed.data : {};
  const [allDoctors, specialties] = await Promise.all([
    getDoctors(),
    getSpecialties(),
  ]);
  const doctors = allDoctors.filter(
    (d) =>
      (!filters.q ||
        [
          d.name,
          d.name_ar,
          d.bio,
          ...d.specialties.flatMap((s) => [s.name_en, s.name_ar]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(filters.q.toLowerCase())) &&
      (!filters.specialty ||
        d.specialties.some((s) => s.slug === filters.specialty)) &&
      (!filters.city || d.city === filters.city) &&
      (!filters.language || d.languages.includes(filters.language)) &&
      (!filters.type || d.consultation_types.includes(filters.type)),
  );
  return (
    <div className="container page-shell">
      <div className="page-heading">
        <span className="eyebrow">
          {t(locale, "Care, on your terms", "رعاية تناسبك")}
        </span>
        <h1>{t(locale, "Find your next step.", "اختر خطوتك التالية.")}</h1>
        <p>
          {t(
            locale,
            "Explore doctors by specialty, location, and language. Choose the care that feels right for you.",
            "استكشف الأطباء حسب التخصص والمدينة واللغة. واختر الرعاية المناسبة لك.",
          )}
        </p>
      </div>
      <Directory
        key={JSON.stringify(filters)}
        doctors={doctors}
        allDoctors={allDoctors}
        specialties={specialties}
        initialFilters={filters}
      />
    </div>
  );
}
