import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { EmptyState, LinkButton } from "@/components/ui";
export default async function NotFound() {
  const locale = await getLocale();
  return (
    <div className="container page-shell">
      <EmptyState
        title={t(locale, "We couldn’t find that page.", "لم نجد هذه الصفحة.")}
      >
        <LinkButton href="/">
          {t(locale, "Back to The Clinic", "العودة إلى ذا كلينك")}
        </LinkButton>
      </EmptyState>
    </div>
  );
}
