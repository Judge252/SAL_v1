import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getSpecialties } from "@/lib/data/doctors";
import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { LinkButton } from "@/components/ui";
export const metadata = { title: "Explore specialties" };
export default async function SpecialtiesPage() {
  const [specialties, locale] = await Promise.all([
    getSpecialties(),
    getLocale(),
  ]);
  return (
    <div className="container page-shell">
      <div className="page-heading">
        <span className="eyebrow">
          {t(locale, "Find your kind of care", "اكتشف الرعاية المناسبة لك")}
        </span>
        <h1>{t(locale, "Start with a specialty.", "ابدأ بتخصص.")}</h1>
        <p>
          {t(
            locale,
            "Not sure which one fits? Tell SAL what you’re feeling, and explore your next step together.",
            "لست متأكداً من التخصص المناسب؟ أخبر سال بما تشعر به لتستكشفا الخطوة التالية معًا.",
          )}
        </p>
        <LinkButton href="/sal" variant="secondary" className="mt-5">
          {t(locale, "Ask SAL", "اسأل سال")}
        </LinkButton>
      </div>
      <div className="specialties-grid">
        {specialties.map((s) => (
          <Link
            href={`/doctors?specialty=${s.slug}`}
            key={s.id}
            className="card specialty-card"
          >
            <ArrowUpRight size={23} className="directional" />
            <h3>{locale === "ar" ? s.name_ar : s.name_en}</h3>
            <p>{locale === "ar" ? s.description_ar : s.description_en}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
