import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
import { EmptyState, LinkButton } from "@/components/ui";
export const metadata = {
  title: "Access restricted",
  robots: { index: false, follow: false },
};
export default async function ForbiddenPage() {
  const locale = await getLocale();
  return (
    <div className="container page-shell">
      <EmptyState
        title={t(
          locale,
          "This area isn’t available to your account.",
          "هذا القسم غير متاح لحسابك.",
        )}
      >
        <LinkButton href="/patient">
          {t(locale, "Go to my care space", "انتقل إلى حساب الرعاية")}
        </LinkButton>
      </EmptyState>
    </div>
  );
}
