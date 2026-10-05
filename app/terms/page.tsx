import { getLocale } from "@/lib/i18n";
import { t } from "@/lib/utils";
export const metadata = { title: "Terms of use" };
export default async function TermsPage() {
  const locale = await getLocale();
  return (
    <article className="container page-shell legal-page">
      <div className="page-heading">
        <h1>{t(locale, "Terms of use.", "شروط الاستخدام.")}</h1>
      </div>
      <h2>{t(locale, "SAL’s role", "دور سال")}</h2>
      <p>
        {t(
          locale,
          "SAL helps you navigate care. Its responses may contain mistakes and are not a medical diagnosis, prescription, or substitute for a licensed clinician. Do not delay seeking professional or emergency care because of a conversation.",
          "سال يساعدك على الوصول للرعاية. قد تحتوي إجاباته على أخطاء ولا تمثل تشخيصًا أو وصفة أو بديلاً عن الطبيب المرخص. لا تؤخر طلب الرعاية الطبية أو الطوارئ بسبب المحادثة.",
        )}
      </p>
      <h2>
        {t(
          locale,
          "Appointments and development data",
          "المواعيد والبيانات التجريبية",
        )}
      </h2>
      <p>
        {t(
          locale,
          "A confirmed booking reserves a database appointment time. Profiles marked Demo represent fictional clinicians, and bookings with them are for software testing only. This application does not collect payments or provide a video-call service.",
          "الحجز المؤكد يحجز وقتًا في قاعدة البيانات. الملفات المعلّمة كتجريبية تمثل أطباء افتراضيين، وحجوزاتها لاختبار البرنامج فقط. هذا التطبيق لا يجمع المدفوعات ولا يقدم خدمة مكالمات فيديو.",
        )}
      </p>
      <h2>{t(locale, "Responsible use", "الاستخدام المسؤول")}</h2>
      <p>
        {t(
          locale,
          "Use your own account and provide accurate appointment information. Do not attempt to access another person’s records, upload harmful content, or bypass access controls. The operator must complete these development terms before public release.",
          "استخدم حسابك الخاص وقدم بيانات مواعيد صحيحة. لا تحاول الوصول إلى سجلات الآخرين أو إضافة محتوى ضار أو تجاوز صلاحيات الوصول. على الجهة المشغلة إكمال هذه الشروط التطويرية قبل الإطلاق العام.",
        )}
      </p>
    </article>
  );
}
