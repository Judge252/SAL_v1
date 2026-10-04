"use client";
import { useState } from "react";
import { ShieldCheck, MessageCircle } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { SalMascot } from "./mascot";
import { DoctorCard } from "@/components/doctors/doctor-card";
import { LinkButton } from "@/components/ui";
import { t } from "@/lib/utils";
import type { Doctor } from "@/types";
export function ProductPreview({ doctors }: { doctors: Doctor[] }) {
  const locale = useLocale(),
    [stage, setStage] = useState(0);
  const steps = [
    t(locale, "A conversation", "المحادثة"),
    t(locale, "A clearer picture", "فهم أوضح"),
    t(locale, "Your next step", "خطوتك التالية"),
  ];
  return (
    <div className="product-panel">
      <aside className="preview-aside">
        <div>
          <span className="eyebrow">
            {t(locale, "A little clarity", "وضوح أكثر")}
          </span>
          <h3>
            {t(locale, "Meet your care companion.", "تعرّف على رفيق رعايتك.")}
          </h3>
        </div>
        <SalMascot
          size={245}
          state={stage === 2 ? "recommendation" : "explaining"}
        />
        <div
          className="preview-tabs"
          role="tablist"
          aria-label={t(locale, "Explore an example", "استكشف مثالاً")}
        >
          {steps.map((name, i) => (
            <button
              role="tab"
              key={i}
              aria-selected={stage === i}
              aria-controls="preview-content"
              id={`preview-tab-${i}`}
              onClick={() => setStage(i)}
            >
              <span>0{i + 1}</span>
              {name}
            </button>
          ))}
        </div>
      </aside>
      <div
        className="preview-content"
        id="preview-content"
        role="tabpanel"
        aria-labelledby={`preview-tab-${stage}`}
      >
        <div className="preview-bar">
          <span>
            {t(
              locale,
              "An example of care navigation",
              "مثال على الإرشاد للرعاية",
            )}
          </span>
          <span>
            <ShieldCheck
              size={13}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            {t(locale, "Guidance, not diagnosis", "إرشاد وليس تشخيصاً")}
          </span>
        </div>
        <div className="preview-dialogue">
          <div className="patient-message">
            <div className="patient-message-label">
              {t(locale, "YOU", "أنت")}
            </div>
            {t(
              locale,
              "I’ve had stomach discomfort since yesterday.",
              "أشعر بألم في معدتي منذ أمس.",
            )}
          </div>
          <div className="sal-label">SAL</div>
          <p className="sal-message">
            {t(
              locale,
              "Let’s understand it a little better. Where do you feel the discomfort, and how strong is it?",
              "دعنا نفهم الأمر أكثر. أين تشعر بالألم؟ وما مدى شدته؟",
            )}
          </p>
          {stage >= 1 && (
            <div className="preview-stage">
              <h3>
                {t(locale, "Putting the pieces together", "نجمع التفاصيل معاً")}
              </h3>
              <p>
                {t(
                  locale,
                  "SAL considers what you describe, asks about changes and other symptoms, and helps you decide on an appropriate next step.",
                  "سال يفهم ما تصفه، ويسأل عن التغيرات والأعراض الأخرى، ليساعدك على اختيار الخطوة المناسبة.",
                )}
              </p>
            </div>
          )}
          {stage === 2 && (
            <div className="preview-stage">
              <h3>
                {t(
                  locale,
                  "Explore the right kind of care",
                  "استكشف نوع الرعاية المناسب",
                )}
              </h3>
              <p style={{ marginBottom: 16 }}>
                {t(
                  locale,
                  "When a specialty is appropriate, you can review matching profiles from the directory.",
                  "عندما يكون التخصص مناسباً، يمكنك مراجعة الملفات المطابقة من الدليل.",
                )}
              </p>
              {doctors[0] ? (
                <DoctorCard doctor={doctors[0]} locale={locale} />
              ) : (
                <LinkButton href="/doctors" variant="secondary">
                  {t(locale, "Explore the directory", "استكشف دليل الأطباء")}
                </LinkButton>
              )}
            </div>
          )}
        </div>
        <div className="preview-bottom">
          <span>
            <MessageCircle
              size={13}
              style={{ display: "inline", verticalAlign: "middle" }}
            />{" "}
            {t(
              locale,
              "Your real conversation starts with you.",
              "محادثتك الحقيقية تبدأ بما تشعر به.",
            )}
          </span>
          <LinkButton href="/sal" variant="secondary" arrow>
            {t(locale, "Talk to SAL", "تحدث مع سال")}
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
