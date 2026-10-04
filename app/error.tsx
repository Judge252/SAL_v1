"use client";
import { useLocale } from "@/components/locale-provider";
import { EmptyState, Button } from "@/components/ui";
import { t } from "@/lib/utils";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const locale = useLocale();
  return (
    <div className="container page-shell">
      <EmptyState
        title={t(
          locale,
          "Something interrupted this page.",
          "حدث خطأ أثناء تحميل الصفحة.",
        )}
        description={t(
          locale,
          "Please try again in a moment.",
          "حاول مرة أخرى بعد قليل.",
        )}
      >
        <Button onClick={reset}>
          {t(locale, "Try again", "حاول مرة أخرى")}
        </Button>
      </EmptyState>
    </div>
  );
}
