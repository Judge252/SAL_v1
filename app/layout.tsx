import type { Metadata } from "next";
import localFont from "next/font/local";
import { getLocale } from "@/lib/i18n";
import { getIdentity } from "@/lib/auth";
import { LocaleProvider } from "@/components/locale-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import "./globals.css";
const display = localFont({
  src: "../public/fonts/dm-serif-display.ttf",
  weight: "400",
  variable: "--font-display",
  display: "swap",
});
const sans = localFont({
  src: "../public/fonts/manrope.ttf",
  weight: "200 800",
  variable: "--font-sans",
  display: "swap",
});
const arabic = localFont({
  src: [
    { path: "../public/fonts/ibm-plex-sans-arabic-medium.ttf", weight: "500" },
    {
      path: "../public/fonts/ibm-plex-sans-arabic-semibold.ttf",
      weight: "600",
    },
  ],
  variable: "--font-arabic",
  display: "swap",
});
const arabicDisplay = localFont({
  src: "../public/fonts/alexandria.ttf",
  weight: "600 700",
  variable: "--font-arabic-display",
  display: "swap",
});
export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const title =
    locale === "ar"
      ? "ذا كلينك — رعايتك تبدأ بمحادثة"
      : "The Clinic — Your care starts with a conversation";
  return {
    metadataBase: new URL(
      process.env.APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000",
    ),
    title: { default: title, template: "%s · The Clinic" },
    icons: { icon: "/favicon.svg" },
    description:
      locale === "ar"
        ? "تحدّث مع سال لفهم خطوتك التالية، وابحث عن طبيب مناسب واحجز موعدك."
        : "Talk to SAL, find the right kind of care, and book a doctor. Healthcare navigation in English and Arabic.",
    openGraph: {
      title,
      description: "Your care starts with a conversation.",
      type: "website",
      images: [{ url: "/sal/welcome.png", width: 1312, height: 1200 }],
    },
    robots: { index: true, follow: true },
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [locale, identity] = await Promise.all([getLocale(), getIdentity()]);
  return (
    <html
      lang={locale}
      dir={locale === "ar" ? "rtl" : "ltr"}
      className={`${display.variable} ${sans.variable} ${arabic.variable} ${arabicDisplay.variable}`}
    >
      <body>
        <LocaleProvider locale={locale}>
          <a href="#main" className="skip-link">
            {locale === "ar" ? "انتقل إلى المحتوى" : "Skip to content"}
          </a>
          <Header
            profile={
              identity
                ? { name: identity.profile.name, role: identity.profile.role }
                : null
            }
          />
          <main id="main">{children}</main>
          <Footer locale={locale} />
        </LocaleProvider>
      </body>
    </html>
  );
}
