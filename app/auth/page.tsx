import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { SalMascot } from "@/components/sal/mascot";
import { getLocale } from "@/lib/i18n";
import { getIdentity } from "@/lib/auth";
import { safeNext, t, rolePath } from "@/lib/utils";
export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};
export default async function AuthPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string; error?: string }>;
}) {
  const [query, locale, identity] = await Promise.all([
    searchParams,
    getLocale(),
    getIdentity(),
  ]);
  if (identity)
    redirect(
      query.next ? safeNext(query.next) : rolePath(identity.profile.role),
    );
  const mode =
    query.mode === "signup" || query.mode === "forgot" ? query.mode : "login";
  return (
    <div className="container page-shell">
      <div className="auth-layout">
        <div className="auth-story">
          <span className="eyebrow">
            {t(locale, "Your care, connected", "رعايتك في مكان واحد")}
          </span>
          <h2>
            {t(locale, "One less thing to worry about.", "خطوة أسهل لرعايتك.")}
          </h2>
          <p>
            {t(
              locale,
              "Keep your SAL conversations, favorite doctors, and appointments in one calm place.",
              "احتفظ بمحادثات سال، وأطبائك المفضلين، ومواعيدك في مكان هادئ واحد.",
            )}
          </p>
          <SalMascot size={320} />
        </div>
        <AuthForm
          mode={mode}
          next={query.next ? safeNext(query.next) : undefined}
          confirmationError={!!query.error}
        />
      </div>
    </div>
  );
}
