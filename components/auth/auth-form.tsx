"use client";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/components/locale-provider";
import { Button, FormField } from "@/components/ui";
import { t } from "@/lib/utils";
import { requestJson, errorText } from "@/lib/client";
type Mode = "login" | "signup" | "forgot" | "reset";
export function AuthForm({
  mode,
  next,
  confirmationError = false,
}: {
  mode: Mode;
  next?: string;
  confirmationError?: boolean;
}) {
  const locale = useLocale(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const title =
    mode === "signup"
      ? t(locale, "A place for your care.", "مكان لرعايتك.")
      : mode === "forgot"
        ? t(locale, "Reset your password.", "استعادة كلمة المرور.")
        : mode === "reset"
          ? t(locale, "Choose a new password.", "اختر كلمة مرور جديدة.")
          : t(locale, "Welcome back.", "مرحبًا بعودتك.");
  async function act(body: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestJson<{ next?: string; message?: string }>(
        "/api/auth",
        body,
      );
      if (result.next) window.location.assign(result.next);
      else {
        setNotice(
          result.message === "CONFIRM_EMAIL"
            ? t(
                locale,
                "Check your email to confirm your account. Then return to continue.",
                "تحقق من بريدك لتأكيد حسابك، ثم عد للمتابعة.",
              )
            : t(
                locale,
                "If an account exists for this email, you’ll receive a password reset link.",
                "إذا كان هناك حساب لهذا البريد، فستصلك رسالة لاستعادة كلمة المرور.",
              ),
        );
        setBusy(false);
      }
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
      setBusy(false);
    }
  }
  const query = next ? `&next=${encodeURIComponent(next)}` : "";
  return (
    <div className="card auth-card">
      <h1>{title}</h1>
      <p className="muted" style={{ fontSize: ".84rem" }}>
        {mode === "login"
          ? t(
              locale,
              "Your conversations and appointments, together.",
              "محادثاتك ومواعيدك، في مكان واحد.",
            )
          : mode === "signup"
            ? t(
                locale,
                "Save your conversations. Book your next step.",
                "احفظ محادثاتك. واحجز خطوتك التالية.",
              )
            : t(
                locale,
                "We’ll help you get back to your care.",
                "نساعدك على العودة لرعايتك.",
              )}
      </p>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void act({
            mode,
            next,
            email: mode === "reset" ? undefined : form.get("email"),
            password: mode === "forgot" ? undefined : form.get("password"),
            name: mode === "signup" ? form.get("name") : undefined,
          });
        }}
      >
        {mode === "signup" && (
          <FormField label={t(locale, "Your name", "اسمك")}>
            <input
              className="input"
              name="name"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
            />
          </FormField>
        )}
        {mode !== "reset" && (
          <FormField label={t(locale, "Email address", "البريد الإلكتروني")}>
            <input
              className="input"
              name="email"
              type="email"
              dir="ltr"
              required
              autoComplete="email"
            />
          </FormField>
        )}
        {mode !== "forgot" && (
          <FormField
            label={t(locale, "Password", "كلمة المرور")}
            hint={
              mode !== "login"
                ? t(
                    locale,
                    "Use at least 10 characters.",
                    "استخدم 10 أحرف على الأقل.",
                  )
                : undefined
            }
          >
            <input
              className="input"
              name="password"
              type="password"
              dir="ltr"
              required
              minLength={mode === "login" ? 1 : 10}
              maxLength={128}
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
            />
          </FormField>
        )}
        {mode === "login" && (
          <Link
            href={`/auth?mode=forgot${query}`}
            className="text-link"
            style={{
              fontSize: "var(--text-caption)",
              justifySelf: "end",
              marginTop: -12,
            }}
          >
            {t(locale, "Forgot password?", "نسيت كلمة المرور؟")}
          </Link>
        )}
        {(error || confirmationError) && (
          <p className="error-notice" role="alert">
            {error ||
              t(
                locale,
                "This confirmation link could not be verified. Please request a new one.",
                "تعذر التحقق من رابط التأكيد. اطلب رابطاً جديداً.",
              )}
          </p>
        )}
        {notice && (
          <p className="success-notice" role="status">
            {notice}
          </p>
        )}
        <Button loading={busy}>
          {mode === "login"
            ? t(locale, "Log in", "تسجيل الدخول")
            : mode === "signup"
              ? t(locale, "Create account", "إنشاء حساب")
              : mode === "forgot"
                ? t(locale, "Send reset link", "أرسل رابط الاستعادة")
                : t(locale, "Save new password", "احفظ كلمة المرور الجديدة")}
        </Button>
      </form>
      {(mode === "login" || mode === "signup") && (
        <>
          <div className="auth-divider">{t(locale, "or", "أو")}</div>
          <Button
            variant="secondary"
            loading={busy}
            onClick={() => void act({ mode: "google", next })}
          >
            <span
              aria-hidden="true"
              style={{ fontWeight: 700, fontSize: "1.1rem" }}
            >
              G
            </span>
            {t(locale, "Continue with Google", "المتابعة باستخدام جوجل")}
          </Button>
        </>
      )}
      <p className="auth-switch">
        {mode === "login" ? (
          <>
            {t(locale, "New to The Clinic? ", "هل هذه زيارتك الأولى؟ ")}
            <Link href={`/auth?mode=signup${query}`}>
              {t(locale, "Create an account", "أنشئ حسابًا")}
            </Link>
          </>
        ) : (
          <Link href={`/auth?mode=login${query}`}>
            {t(locale, "Back to log in", "العودة لتسجيل الدخول")}
          </Link>
        )}
      </p>
      <p className="auth-footnote">
        {t(locale, "By continuing, you agree to our ", "بالمتابعة، توافق على ")}
        <Link href="/terms" style={{ textDecoration: "underline" }}>
          {t(locale, "Terms", "الشروط")}
        </Link>
        {t(locale, " and acknowledge our ", " وتقر بسياسة ")}
        <Link href="/privacy" style={{ textDecoration: "underline" }}>
          {t(locale, "Privacy notice", "الخصوصية")}
        </Link>
        .
      </p>
    </div>
  );
}
