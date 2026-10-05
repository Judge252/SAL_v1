"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Menu, X, ArrowUpRight, UserRound, LogOut } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { t, cx, rolePath } from "@/lib/utils";
import { requestJson, errorText } from "@/lib/client";
import type { Profile } from "@/types";
export function Header({
  profile,
}: {
  profile: Pick<Profile, "name" | "role"> | null;
}) {
  const locale = useLocale(),
    pathname = usePathname(),
    router = useRouter();
  const [scrolled, setScrolled] = useState(false),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [pending, startTransition] = useTransition();
  const accountMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!accountMenu.current?.contains(event.target as Node))
        accountMenu.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 32);
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  const switchLanguage = () =>
    startTransition(async () => {
      setError("");
      try {
        await requestJson("/api/locale", {
          locale: locale === "en" ? "ar" : "en",
        });
        router.refresh();
      } catch (e) {
        setError(errorText(e instanceof Error ? e.message : "", locale));
      }
    });
  const logout = () =>
    startTransition(async () => {
      setError("");
      try {
        await requestJson("/api/auth", { mode: "logout" });
        setOpen(false);
        accountMenu.current?.removeAttribute("open");
        router.replace("/");
        router.refresh();
      } catch (e) {
        setError(errorText(e instanceof Error ? e.message : "", locale));
      }
    });
  const links = [
    ["/doctors", t(locale, "Find a doctor", "ابحث عن طبيب")],
    ["/specialties", t(locale, "Specialties", "التخصصات")],
    ["/#how-it-works", t(locale, "How it works", "كيف نساعدك")],
  ];
  const dark = pathname === "/" && !scrolled;
  return (
    <header
      className={cx("site-header", dark ? "header-dark" : "header-light")}
    >
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="The Clinic home">
          <Image
            src={dark ? "/logo_light.png" : "/logo_dark.png"}
            alt="The Clinic"
            width={2172}
            height={724}
            className="brand-logo"
            sizes="(max-width: 360px) 85px, (max-width: 430px) 95px, (max-width: 768px) 105px, 130px"
            loading="eager"
          />
        </Link>
        <nav
          className="desktop-nav"
          aria-label={t(locale, "Main navigation", "التنقل الرئيسي")}
        >
          {links.map(([href, label]) => (
            <Link href={href} key={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <button
            className="language-switch"
            onClick={switchLanguage}
            disabled={pending}
            lang={locale === "en" ? "ar" : "en"}
            aria-label={t(locale, "Switch to Arabic", "Switch to English")}
          >
            {locale === "en" ? "العربية" : "EN"}
          </button>
          {profile ? (
            <details
              ref={accountMenu}
              className="account-menu"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  accountMenu.current?.removeAttribute("open");
                  accountMenu.current?.querySelector("summary")?.focus();
                }
              }}
            >
              <summary
                className="account-link"
                aria-label={t(locale, "Open account menu", "فتح قائمة الحساب")}
              >
                <UserRound size={16} />
                <span>
                  <bdi>
                    {profile.name.split(" ")[0] ||
                      t(locale, "My account", "حسابي")}
                  </bdi>
                </span>
              </summary>
              <nav
                className="account-dropdown"
                aria-label={t(locale, "Account navigation", "التنقل في الحساب")}
              >
                <Link
                  href={rolePath(profile.role)}
                  onClick={() => accountMenu.current?.removeAttribute("open")}
                >
                  {t(locale, "My care space", "حساب الرعاية")}
                </Link>
                <button onClick={logout} disabled={pending}>
                  <LogOut size={16} />
                  {t(locale, "Log out", "تسجيل الخروج")}
                </button>
              </nav>
            </details>
          ) : (
            <>
              <Link href="/auth" className="account-link">
                {t(locale, "Log in", "تسجيل الدخول")}
              </Link>
              <Link
                href="/auth?mode=signup"
                className="account-link signup-link"
              >
                {t(locale, "Sign up", "إنشاء حساب")}
              </Link>
            </>
          )}
          <Link className="button button-sal header-sal" href="/sal">
            {t(locale, "Talk to SAL", "تحدّث مع سال")}
            <ArrowUpRight size={16} className="directional" />
          </Link>
          <button
            className="icon-button menu-toggle"
            aria-label={t(locale, "Open menu", "فتح القائمة")}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <nav
          id="mobile-menu"
          className="mobile-nav"
          aria-label={t(locale, "Mobile navigation", "قائمة الهاتف")}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          {links.map(([href, label]) => (
            <Link href={href} key={href} onClick={() => setOpen(false)}>
              {label}
            </Link>
          ))}
          <Link
            href={profile ? rolePath(profile.role) : "/auth"}
            onClick={() => setOpen(false)}
          >
            {profile
              ? t(locale, "My care space", "حساب الرعاية")
              : t(locale, "Log in", "تسجيل الدخول")}
          </Link>
          {profile ? (
            <button onClick={logout} disabled={pending}>
              {t(locale, "Log out", "تسجيل الخروج")}
            </button>
          ) : (
            <Link href="/auth?mode=signup" onClick={() => setOpen(false)}>
              {t(locale, "Sign up", "إنشاء حساب")}
            </Link>
          )}
        </nav>
      )}
      {error && (
        <p className="header-error error-notice" role="alert">
          {error}
        </p>
      )}
    </header>
  );
}
