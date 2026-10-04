import "server-only";
import { cookies } from "next/headers";
import type { Locale } from "@/types";
export function renderTime() {
  return Date.now();
}
export async function getLocale(): Promise<Locale> {
  return (await cookies()).get("clinic-locale")?.value === "ar" ? "ar" : "en";
}
export function text(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}
