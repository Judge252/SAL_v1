import Link from "next/link";
import type { Locale } from "@/types";
import { t } from "@/lib/utils";
export function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <div>
          <Link href="/" className="footer-brand">
            THE CLINIC<span>®</span>
          </Link>
          <p>
            {t(
              locale,
              "A little clarity. A better next step.",
              "وضوح أكثر. وخطوة أفضل للرعاية.",
            )}
          </p>
        </div>
        <nav aria-label={t(locale, "Footer navigation", "روابط أسفل الصفحة")}>
          <Link href="/doctors">
            {t(locale, "Find a doctor", "ابحث عن طبيب")}
          </Link>
          <Link href="/sal">{t(locale, "Meet SAL", "تعرّف على سال")}</Link>
          <Link href="/#how-it-works">
            {t(locale, "How it works", "كيف يعمل")}
          </Link>
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} The Clinic</span>
        <p>
          {t(
            locale,
            "SAL guides your next step. A doctor provides your care.",
            "سال يرشد خطوتك التالية. والطبيب يقدم رعايتك.",
          )}
        </p>
        <div>
          <Link href="/privacy">{t(locale, "Privacy", "الخصوصية")}</Link>
          <Link href="/terms">{t(locale, "Terms", "الشروط")}</Link>
        </div>
      </div>
    </footer>
  );
}
