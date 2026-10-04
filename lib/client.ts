import type { Locale } from "@/types";
export async function requestJson<T>(
  url: string,
  body?: unknown,
  method = "POST",
  parse?: (value: unknown) => T,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(85000),
  });
  const data = await response.json().catch(() => {
    throw new Error("SERVICE_UNAVAILABLE");
  });
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("SERVICE_UNAVAILABLE");
  if (!response.ok || data.error)
    throw new Error(
      typeof data.error === "string" ? data.error : "SERVICE_UNAVAILABLE",
    );
  return parse ? parse(data) : (data as T);
}
export function errorText(code: string, locale: Locale) {
  const errors: Record<string, [string, string]> = {
    MIC_DENIED: [
      "Microphone access is blocked. Check this site’s microphone permission in your browser, then try again, or continue by typing below.",
      "الوصول للميكروفون محظور. راجع إذن الميكروفون لهذا الموقع في متصفحك، ثم حاول مجدداً، أو تابع بالكتابة أدناه.",
    ],
    MIC_SYSTEM_BLOCKED: [
      "The browser or system blocked microphone capture. Open SAL in your regular browser, or check microphone access in your system settings. You can also continue by typing.",
      "منع المتصفح أو النظام تشغيل الميكروفون. افتح سال في متصفحك المعتاد، أو راجع وصول المتصفح للميكروفون في إعدادات النظام. يمكنك أيضاً المتابعة بالكتابة.",
    ],
    MIC_AUDIO_FAILED: [
      "We couldn’t start audio capture. Try again or use another browser. You can also continue by typing.",
      "تعذر تجهيز الصوت للتحدث. حاول مجدداً أو استخدم متصفحاً آخر. يمكنك أيضاً المتابعة بالكتابة.",
    ],
    MIC_NOT_FOUND: [
      "We couldn’t find a microphone. Connect one or continue by typing.",
      "لم نجد ميكروفوناً. وصّل ميكروفوناً أو تابع بالكتابة.",
    ],
    MIC_BUSY: [
      "Your microphone is unavailable. Check whether another app is using it, or continue by typing.",
      "الميكروفون غير متاح. تحقق إن كان تطبيق آخر يستخدمه، أو تابع بالكتابة.",
    ],
    MIC_UNSUPPORTED: [
      "Voice needs a supported browser over HTTPS (or localhost). You can continue by typing.",
      "الصوت يحتاج متصفحاً مدعوماً عبر HTTPS (أو localhost). يمكنك المتابعة بالكتابة.",
    ],
    MIC_ENDED: [
      "The microphone disconnected. Reconnect it and try again, or continue by typing.",
      "انقطع الميكروفون. أعد توصيله وحاول مجدداً، أو تابع بالكتابة.",
    ],
    LIVE_UNAVAILABLE: [
      "We couldn’t connect SAL’s voice. Try Talk to SAL again, or continue by typing.",
      "تعذر الاتصال بصوت سال. حاول التحدث مجدداً، أو تابع بالكتابة.",
    ],
    LIVE_DISCONNECTED: [
      "The voice connection was interrupted. Your saved conversation stays here. Tap Talk to SAL to reconnect.",
      "انقطع الاتصال الصوتي. محادثتك المحفوظة موجودة هنا. اضغط تحدث مع سال للاتصال مجدداً.",
    ],
    LIVE_TIMEOUT: [
      "SAL’s voice response took too long. Reconnect or continue by typing.",
      "استغرقت إجابة سال الصوتية وقتاً طويلاً. أعد الاتصال أو تابع بالكتابة.",
    ],
    AUDIO_UNAVAILABLE: [
      "Audio playback stopped. Try reconnecting or continue by typing.",
      "توقف تشغيل الصوت. حاول الاتصال مجدداً أو تابع بالكتابة.",
    ],
    AUTH_FAILED: [
      "The email or password could not be verified. Please try again.",
      "تعذر التحقق من البريد أو كلمة المرور. حاول مرة أخرى.",
    ],
    SIGNUP_FAILED: [
      "We couldn’t create the account. Check your details and try again.",
      "تعذر إنشاء الحساب. راجع البيانات وحاول مرة أخرى.",
    ],
    AUTH_REQUIRED: [
      "Please sign in to continue.",
      "يرجى تسجيل الدخول للمتابعة.",
    ],
    AI_RATE_LIMITED: [
      "SAL is receiving more requests than usual. Please try again later.",
      "هناك طلبات كثيرة على سال الآن. حاول لاحقاً.",
    ],
    RATE_LIMITED: [
      "You’ve reached the limit for today. Please try again tomorrow.",
      "وصلت إلى الحد اليومي. حاول مرة أخرى غداً.",
    ],
    AI_INVALID_RESPONSE: [
      "SAL couldn’t reliably prepare that response. Please try again.",
      "تعذر على سال إعداد إجابة موثوقة. حاول مرة أخرى.",
    ],
    AI_UNAVAILABLE: [
      "Something interrupted SAL’s response. Please try again.",
      "انقطعت إجابة سال. حاول مرة أخرى.",
    ],
    CONVERSATION_BUSY: [
      "SAL is still working on your previous message. Please wait a moment.",
      "سال ما زال يجيب على رسالتك السابقة. انتظر قليلاً.",
    ],
    SESSION_NOT_FOUND: [
      "This conversation is unavailable on this device or account.",
      "هذه المحادثة غير متاحة لهذا الجهاز أو الحساب.",
    ],
    SLOT_UNAVAILABLE: [
      "That time has just been booked. Please choose another time.",
      "تم حجز هذا الموعد للتو. اختر وقتاً آخر.",
    ],
    INVALID_SLOT: [
      "That appointment time is no longer available. Please choose another.",
      "هذا الموعد لم يعد متاحاً. اختر موعداً آخر.",
    ],
    CANNOT_CANCEL: [
      "This appointment can’t be cancelled now. Refresh to check its status.",
      "لا يمكن إلغاء هذا الموعد الآن. حدّث الصفحة للتحقق من حالته.",
    ],
    INVALID_INPUT: [
      "Please check the information and try again.",
      "راجع البيانات وحاول مرة أخرى.",
    ],
    OAUTH_UNAVAILABLE: [
      "Google sign-in isn’t available right now. You can use email instead.",
      "تسجيل الدخول عبر جوجل غير متاح الآن. يمكنك استخدام البريد.",
    ],
    RECOVERY_UNAVAILABLE: [
      "We couldn’t send the reset email right now. Please try again later.",
      "تعذر إرسال رسالة استعادة كلمة المرور الآن. حاول لاحقاً.",
    ],
    CONFLICT: [
      "This record is still in use. Please update its linked records first.",
      "هذه البيانات ما زالت مرتبطة بسجلات أخرى. حدّث السجلات المرتبطة أولاً.",
    ],
  };
  return (errors[code] || [
    "We couldn’t complete that right now. Please try again.",
    "تعذر إكمال الطلب الآن. حاول مرة أخرى.",
  ])[locale === "ar" ? 1 : 0];
}
