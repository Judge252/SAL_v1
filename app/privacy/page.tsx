import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
export const metadata = { title: "Privacy notice" };
export default async function PrivacyPage() {
  const locale = await getLocale();
  return (
    <article className="container page-shell legal-page">
      <div className="page-heading">
        <span className="eyebrow">
          {t(locale, "Your words deserve care", "كلماتك تستحق الاهتمام")}
        </span>
        <h1>{t(locale, "Privacy notice.", "بيان الخصوصية.")}</h1>
        <p>
          {t(
            locale,
            "A description of how this application currently handles information.",
            "وصف لطريقة تعامل هذا التطبيق حالياً مع المعلومات.",
          )}
        </p>
      </div>
      <h2>{t(locale, "What is stored", "ما يتم تخزينه")}</h2>
      <p>
        {t(
          locale,
          "Your account details, SAL messages, selected doctors, and appointment details are stored in Supabase. Guest conversations are linked to a random token in a protected cookie. After sign-in, current guest conversations may be linked to your account.",
          "تُحفظ بيانات حسابك ورسائل سال والأطباء المحفوظون وتفاصيل المواعيد في Supabase. ترتبط محادثات الضيوف برمز عشوائي في ملف تعريف ارتباط محمي. بعد الدخول قد تُربط المحادثات الحالية بحسابك.",
        )}
      </p>
      <h2>
        {t(
          locale,
          "How SAL processes a conversation",
          "كيف يعالج سال المحادثة",
        )}
      </h2>
      <p>
        {t(
          locale,
          "Messages and relevant recent conversation history are sent to Google’s Gemini API to produce guidance. When you enable voice, microphone audio streams directly to Gemini Live and its spoken responses stream back to your browser. The application saves finalized text transcripts in Supabase, not audio recordings. Curated knowledge may be included. Share only information you are comfortable sending to these providers; avoid unnecessary identifiers. No conversation text is sent to analytics by this application.",
          "تُرسل الرسائل وسياق المحادثة الحديث إلى Gemini التابعة لجوجل لإعداد الإرشاد. عند تشغيل الصوت يُبث صوت الميكروفون مباشرةً إلى Gemini Live وتعود الإجابات الصوتية إلى متصفحك. يحفظ التطبيق النصوص النهائية للمحادثة في Supabase ولا يحفظ تسجيلات صوتية. قد تُضاف معلومات مختارة. شارك فقط ما ترتاح لإرساله إلى هذه الخدمات، وتجنب بيانات التعريف غير الضرورية. لا يرسل التطبيق نصوص المحادثات إلى خدمات التحليلات.",
        )}
      </p>
      <h2>
        {t(locale, "Who can see information", "من يستطيع رؤية المعلومات")}
      </h2>
      <p>
        {t(
          locale,
          "Access controls restrict saved conversations and patient records to the account owner. Doctors can see appointments assigned to them and the reason for the visit. Authorized clinic administrators can manage directory and appointment records. Infrastructure administrators may have privileged access.",
          "تحدد صلاحيات الوصول المحادثات والسجلات المحفوظة لصاحب الحساب. يستطيع الأطباء رؤية المواعيد المعينة لهم وسبب الزيارة. يمكن لمسؤولي العيادة المعتمدين إدارة الدليل وسجلات المواعيد. قد يمتلك مسؤولو البنية الأساسية صلاحيات إضافية.",
        )}
      </p>
      <h2>
        {t(
          locale,
          "Cookies and account controls",
          "ملفات الارتباط والتحكم في الحساب",
        )}
      </h2>
      <p>
        {t(
          locale,
          "Cookies maintain your login, guest conversation ownership, and language selection. This development notice must be reviewed and completed with the operator’s contact, retention, and data-request policies before public healthcare use.",
          "تُستخدم ملفات الارتباط للحفاظ على الدخول وملكية محادثات الضيوف واللغة. يجب مراجعة هذا البيان التطويري وإكماله بمعلومات الجهة المشغلة وسياسات الاحتفاظ وطلبات البيانات قبل الاستخدام الصحي العام.",
        )}
      </p>
    </article>
  );
}
