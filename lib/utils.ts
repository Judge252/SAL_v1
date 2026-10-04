import type { Locale, Role, Specialty } from "@/types";
export function cx(...values: (string | false | undefined | null)[]) {
  return values.filter(Boolean).join(" ");
}
export function t(locale: Locale, en: string, ar: string) {
  return locale === "ar" ? ar : en;
}
export function specialtyName(specialty: Specialty, locale: Locale) {
  return locale === "ar" ? specialty.name_ar : specialty.name_en;
}
export function dateLabel(
  value: string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    timeZone: "Africa/Cairo",
    ...options,
  }).format(new Date(value));
}
export function money(value: number | null, currency: string, locale: Locale) {
  return value === null
    ? t(locale, "Price on request", "السعر عند التواصل")
    : new Intl.NumberFormat(locale === "ar" ? "ar-EG" : "en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);
}
export function safeNext(value: string | null | undefined) {
  return value?.startsWith("/") &&
    !value.startsWith("//") &&
    !/[\\\r\n]/.test(value) &&
    !value.startsWith("/auth")
    ? value
    : "/patient";
}
export function rolePath(role: Role) {
  return role === "admin"
    ? "/admin"
    : role === "doctor"
      ? "/doctor"
      : "/patient";
}
export function statusLabel(
  status: "pending" | "confirmed" | "cancelled" | "completed",
  locale: Locale,
) {
  return {
    pending: ["Pending", "قيد الانتظار"],
    confirmed: ["Confirmed", "مؤكد"],
    cancelled: ["Cancelled", "ملغى"],
    completed: ["Completed", "مكتمل"],
  }[status][locale === "ar" ? 1 : 0];
}
