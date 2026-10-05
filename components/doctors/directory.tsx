"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { DoctorCard } from "./doctor-card";
import {
  Button,
  EmptyState,
  FormField,
  Modal,
  Skeleton,
} from "@/components/ui";
import { t } from "@/lib/utils";
import type { Doctor, Specialty } from "@/types";
export function Directory({
  doctors,
  specialties,
  allDoctors,
  initialFilters,
}: {
  doctors: Doctor[];
  specialties: Specialty[];
  allDoctors: Doctor[];
  initialFilters: Record<string, string | undefined>;
}) {
  const locale = useLocale(),
    router = useRouter(),
    form = useRef<HTMLFormElement>(null),
    [pending, startTransition] = useTransition(),
    [mobileOpen, setMobileOpen] = useState(false),
    [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 430px)");
    const change = () => setNarrow(media.matches);
    const frame = requestAnimationFrame(change);
    media.addEventListener("change", change);
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener("change", change);
    };
  }, []);
  const cities = [...new Set(allDoctors.map((d) => d.city).filter(Boolean))],
    languages = [...new Set(allDoctors.flatMap((d) => d.languages))],
    types = [...new Set(allDoctors.flatMap((d) => d.consultation_types))];
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    new FormData(form.current!).forEach((v, k) => {
      if (v) params.set(k, String(v));
    });
    setMobileOpen(false);
    startTransition(() => router.push(`/doctors?${params}`));
  }
  const fields = (
    <>
      <FormField
        label={t(locale, "Doctor or keyword", "اسم الطبيب أو كلمة للبحث")}
      >
        <input
          className="input"
          name="q"
          defaultValue={initialFilters.q}
          maxLength={100}
          placeholder={t(locale, "Name or specialty", "اسم أو تخصص")}
        />
      </FormField>
      <FormField label={t(locale, "Specialty", "التخصص")}>
        <select
          className="select"
          name="specialty"
          defaultValue={initialFilters.specialty || ""}
        >
          <option value="">
            {t(locale, "All specialties", "جميع التخصصات")}
          </option>
          {specialties.map((s) => (
            <option value={s.slug} key={s.id}>
              {locale === "ar" ? s.name_ar : s.name_en}
            </option>
          ))}
        </select>
      </FormField>
      {cities.length > 0 && (
        <FormField label={t(locale, "City", "المدينة")}>
          <select
            className="select"
            name="city"
            defaultValue={initialFilters.city || ""}
          >
            <option value="">{t(locale, "All cities", "جميع المدن")}</option>
            {cities.map((city) => (
              <option key={city}>{city}</option>
            ))}
          </select>
        </FormField>
      )}
      {languages.length > 0 && (
        <FormField label={t(locale, "Language", "اللغة")}>
          <select
            className="select"
            name="language"
            defaultValue={initialFilters.language || ""}
          >
            <option value="">{t(locale, "Any language", "جميع اللغات")}</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {locale === "ar"
                  ? { Arabic: "العربية", English: "الإنجليزية" }[l] || l
                  : l}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {types.length > 1 && (
        <FormField label={t(locale, "Visit type", "نوع الموعد")}>
          <select
            className="select"
            name="type"
            defaultValue={initialFilters.type || ""}
          >
            <option value="">{t(locale, "Any type", "كل الأنواع")}</option>
            {types.map((type) => (
              <option value={type} key={type}>
                {type === "in_person"
                  ? t(locale, "In person", "في العيادة")
                  : t(locale, "Video consultation", "استشارة بالفيديو")}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <Button loading={pending}>
        <Search size={17} />
        {t(locale, "Search", "بحث")}
      </Button>
    </>
  );
  return (
    <>
      {narrow ? (
        <>
          <Button
            variant="secondary"
            onClick={() => setMobileOpen(true)}
            style={{ marginBottom: 22 }}
          >
            <SlidersHorizontal size={17} />
            {t(locale, "Search & filters", "البحث والتصفية")}
          </Button>
          <Modal
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            title={t(locale, "Find your doctor", "ابحث عن طبيبك")}
          >
            <form ref={form} className="form-grid" onSubmit={submit}>
              {fields}
            </form>
          </Modal>
        </>
      ) : (
        <form ref={form} className="card directory-filters" onSubmit={submit}>
          {fields}
        </form>
      )}
      <div className="directory-results">
        <span>
          {t(
            locale,
            `${doctors.length} ${doctors.length === 1 ? "doctor" : "doctors"} in your results`,
            `${doctors.length} طبيب في النتائج`,
          )}
        </span>
        <button
          className="text-link"
          type="button"
          style={{
            border: 0,
            background: "none",
            fontSize: "var(--text-caption)",
          }}
          onClick={() => router.push("/doctors")}
        >
          {t(locale, "Clear filters", "مسح خيارات البحث")}
        </button>
      </div>
      {pending ? (
        <div className="doctor-grid">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="skeleton-card" />
          ))}
        </div>
      ) : doctors.length ? (
        <div className="doctor-grid">
          {doctors.map((d) => (
            <DoctorCard key={d.id} doctor={d} locale={locale} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={t(
            locale,
            "No doctors match those filters.",
            "لم نعثر على أطباء بهذه الخيارات.",
          )}
          description={t(
            locale,
            "Try another specialty or remove a filter. SAL can help you find where to begin.",
            "جرّب تخصصًا آخر أو أزل أحد خيارات التصفية. يمكنك سؤال سال إن لم تعرف من أين تبدأ.",
          )}
        >
          <Button variant="secondary" onClick={() => router.push("/doctors")}>
            {t(locale, "Reset filters", "إعادة ضبط البحث")}
          </Button>
        </EmptyState>
      )}
    </>
  );
}
