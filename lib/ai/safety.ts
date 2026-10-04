import type { Locale, SalResponse } from "@/types";
const patterns = [
  /\b(?:severe|crushing|intense)\s+(?:chest|heart)\s+(?:pain|pressure)\b/i,
  /\b(?:can't|cannot|unable to)\s+breathe\b/i,
  /\b(?:severe difficulty breathing|uncontrolled bleeding|bleeding heavily|loss of consciousness|unconscious|face drooping|sudden one[- ]sided weakness|overdose|suicidal|kill myself)\b/i,
  /(?:ألم|الم)\s*(?:شديد|قوي|قوى)\s*(?:في|فى)?\s*(?:الصدر|صدري|صدرى)/,
  /(?:مش قادر|مش قادرة|لا أستطيع|لا استطيع)\s*(?:أتنفس|اتنفس|التنفس)/,
  /(?:نزيف شديد|فقدان الوعي|فقدان الوعى|فاقد الوعي|شلل مفاجئ|انتحار|جرعة زائدة|صعوبة شديدة في التنفس)/,
];
export function hasUrgentRedFlag(message: string) {
  const segments = message.split(/[.!?;\n،]/);
  return segments.some(
    (segment) =>
      patterns.some((p) => p.test(segment)) &&
      !/\b(?:no|not having|don't have|do not have|without|denies)\b.{0,35}(?:pain|breath|bleed|weak|conscious|overdose)/i.test(
        segment,
      ) &&
      !/(?:لا يوجد|ليس لدي|معنديش|ما عندي).{0,25}(?:ألم|الم|نزيف|صعوبة)/.test(
        segment,
      ),
  );
}
export function emergencyResponse(locale: Locale): SalResponse {
  const message =
    locale === "ar"
      ? "الأعراض التي وصفتها قد تحتاج إلى رعاية طارئة. اطلب المساعدة الطبية الطارئة الآن أو اذهب إلى أقرب قسم طوارئ. لا تنتظر المحادثة أو حجز موعد. اطلب من شخص قريب البقاء معك إذا أمكن."
      : "The symptoms you described may need emergency care. Contact your local emergency service now or go to the nearest emergency department. Please do not wait for this conversation or an appointment. If possible, ask someone nearby to stay with you.";
  return {
    message,
    stage: "urgent",
    followUpQuestions: [],
    symptomSummary: null,
    suggestedSpecialties: [],
    recommendedDoctorIds: [],
    safety: { urgent: true, message },
    doctors: [],
    sources: [],
  };
}
