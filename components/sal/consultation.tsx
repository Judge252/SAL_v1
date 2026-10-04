"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  ShieldCheck,
  AlertTriangle,
  MessageCircle,
  Plus,
  CornerDownRight,
} from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { SalMascot } from "./mascot";
import { DoctorCard } from "@/components/doctors/doctor-card";
import { Button, LinkButton } from "@/components/ui";
import { t } from "@/lib/utils";
import { requestJson, errorText } from "@/lib/client";
import { parseSalReply } from "@/lib/validation/sal-reply";
import { hasUrgentRedFlag, emergencyResponse } from "@/lib/ai/safety";
import type { Message, SalSession, Specialty } from "@/types";
export function Consultation({
  session,
  initialMessages,
  specialties,
  emergencyPhone,
}: {
  session: SalSession | null;
  initialMessages: Message[];
  specialties: Specialty[];
  emergencyPhone: string | null;
}) {
  const locale = useLocale(),
    router = useRouter();
  const [messages, setMessages] = useState(initialMessages),
    [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [localUrgent, setLocalUrgent] = useState(false);
  const [sessionId, setSessionId] = useState(session?.id || null);
  const [pending, setPending] = useState<{
    message: string;
    id: string;
  } | null>(null);
  const end = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null);
  const lastResponse = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")?.structured_data;
  const urgent = localUrgent || !!lastResponse?.safety.urgent;
  useEffect(() => {
    if (messages.length > 0)
      end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages.length, busy]);
  async function send(message: string, retry = false) {
    if (!message.trim() || busy || urgent) return;
    setBusy(true);
    setError("");
    setValue("");
    const attempt =
      retry && pending ? pending : { message, id: crypto.randomUUID() };
    setPending(attempt);
    if (!retry) {
      setMessages((old) => [
        ...old,
        {
          id: attempt.id,
          role: "user",
          content: message,
          structured_data: null,
          created_at: new Date().toISOString(),
          request_id: attempt.id,
        },
      ]);
    }
    if (hasUrgentRedFlag(message)) setLocalUrgent(true);
    try {
      const data = await requestJson<{ sessionId: string; message: Message }>(
        "/api/sal/message",
        { message, sessionId, requestId: attempt.id, locale },
        "POST",
        parseSalReply,
      );
      setSessionId(data.sessionId);
      setMessages((old) => [...old, data.message]);
      setPending(null);
      if (!sessionId)
        router.replace(`/sal?session=${data.sessionId}`, { scroll: false });
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
    } finally {
      setBusy(false);
      composer.current?.focus();
    }
  }
  return (
    <div className="container consultation-shell">
      <div className="consultation-heading">
        <div>
          <span className="eyebrow" style={{ marginBottom: 12 }}>
            {t(locale, "Your care starts here", "رعايتك تبدأ هنا")}
          </span>
          <h1>{t(locale, "A conversation with SAL.", "محادثة مع سال.")}</h1>
        </div>
        <LinkButton href="/sal" variant="secondary">
          <Plus size={15} />
          {t(locale, "New conversation", "محادثة جديدة")}
        </LinkButton>
      </div>
      <div className="consultation-layout">
        <section
          className="consultation-panel"
          aria-label={t(locale, "SAL consultation", "محادثة سال")}
        >
          <div className="consultation-topbar">
            <span>
              <MessageCircle size={15} />
              {session?.title ||
                t(locale, "Let’s find your next step", "لنجد خطوتك التالية")}
            </span>
            <span>{t(locale, "Care navigation", "إرشاد للرعاية")}</span>
          </div>
          {messages.length === 0 && (
            <div className="sal-welcome">
              <div className="sal-label">SAL</div>
              <h2>
                {t(locale, "Hi. What’s on your mind?", "أهلاً. ما الذي يقلقك؟")}
              </h2>
              <p>
                {t(
                  locale,
                  "Tell me what you’re feeling, in your own words. I’ll ask a few questions and help you find an appropriate next step.",
                  "أخبرني بما تشعر به بكلماتك. سأطرح بعض الأسئلة لأساعدك على اختيار الخطوة المناسبة.",
                )}
              </p>
              <div className="chip-row">
                {[
                  ["I have a headache", "أشعر بصداع"],
                  ["My stomach hurts", "معدتي تؤلمني"],
                  ["I’m not sure where to start", "لا أعرف من أين أبدأ"],
                ].map(([en, ar]) => (
                  <button
                    className="chip"
                    key={en}
                    onClick={() => void send(t(locale, en, ar))}
                    disabled={busy}
                  >
                    {t(locale, en, ar)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className="conversation-log"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={t(locale, "Conversation", "المحادثة")}
          >
            {messages.map((m) =>
              m.role === "user" ? (
                <div className="patient-message" key={m.id}>
                  <div className="patient-message-label">
                    {t(locale, "YOU", "أنت")}
                  </div>
                  {m.content}
                </div>
              ) : (
                <div key={m.id}>
                  <div className="sal-label">SAL</div>
                  {m.structured_data?.safety.urgent ? (
                    <UrgentPanel message={m.content} phone={emergencyPhone} />
                  ) : (
                    <>
                      <div className="sal-message">{m.content}</div>
                      {m.structured_data?.followUpQuestions.length ? (
                        <div className="sal-followups">
                          {m.structured_data.followUpQuestions
                            .filter((q) => !m.content.includes(q))
                            .map((q) => (
                              <p key={q}>
                                <CornerDownRight
                                  size={13}
                                  className="directional"
                                />
                                {q}
                              </p>
                            ))}
                        </div>
                      ) : null}
                      {m.structured_data?.symptomSummary && (
                        <div className="sal-response-block">
                          <h3>{t(locale, "What you’ve shared", "ما وصفته")}</h3>
                          <p>{m.structured_data.symptomSummary}</p>
                        </div>
                      )}
                      {m.structured_data?.suggestedSpecialties.length ? (
                        <div className="sal-response-block">
                          <h3>
                            {t(
                              locale,
                              "A possible care path",
                              "مسار رعاية مناسب محتمل",
                            )}
                          </h3>
                          <div className="chip-row">
                            {m.structured_data.suggestedSpecialties.map(
                              (slug) => {
                                const s = specialties.find(
                                  (s) => s.slug === slug,
                                );
                                return s ? (
                                  <LinkButton
                                    variant="secondary"
                                    href={`/doctors?specialty=${slug}`}
                                    key={slug}
                                  >
                                    {locale === "ar" ? s.name_ar : s.name_en}
                                  </LinkButton>
                                ) : null;
                              },
                            )}
                          </div>
                        </div>
                      ) : null}
                      {m.structured_data?.stage === "recommendation" && (
                        <div className="sal-recommendations">
                          <div className="sal-response-block">
                            <h3>
                              {t(
                                locale,
                                "Doctors from our directory",
                                "أطباء من دليلنا",
                              )}
                            </h3>
                            {m.structured_data.doctors.length ? (
                              <div className="doctor-grid">
                                {m.structured_data.doctors.map((d) => (
                                  <DoctorCard
                                    key={d.id}
                                    doctor={d}
                                    locale={locale}
                                  />
                                ))}
                              </div>
                            ) : (
                              <p>
                                {t(
                                  locale,
                                  "There are no matching doctors in our directory yet. You can browse other care options.",
                                  "لا يوجد أطباء مطابقون في الدليل حالياً. يمكنك استكشاف خيارات الرعاية الأخرى.",
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                      {m.structured_data?.safety.message && (
                        <p className="sal-safety">
                          <ShieldCheck size={14} />
                          {m.structured_data.safety.message}
                        </p>
                      )}
                      {m.structured_data?.sources.length ? (
                        <div className="sal-sources">
                          {t(locale, "Curated references: ", "مراجع مختارة: ")}
                          {m.structured_data.sources.map((s) => (
                            <a
                              key={s.id}
                              href={s.source}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {s.title}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              ),
            )}
            {localUrgent && !lastResponse?.safety.urgent && (
              <UrgentPanel
                message={emergencyResponse(locale).message}
                phone={emergencyPhone}
              />
            )}{" "}
            {busy && !urgent && (
              <div className="sal-thinking-row" role="status">
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>
                {t(
                  locale,
                  "SAL is thinking through your next step…",
                  "سال يفكر في خطوتك التالية…",
                )}
              </div>
            )}
            <div ref={end} />
          </div>
          {error && !urgent && (
            <div className="error-notice sal-error" role="alert">
              <p>{error}</p>
              {pending && (
                <Button
                  variant="secondary"
                  onClick={() => void send(pending!.message, true)}
                  loading={busy}
                >
                  {t(locale, "Try again", "حاول مرة أخرى")}
                </Button>
              )}
            </div>
          )}
          <form
            className="sal-composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send(value);
            }}
          >
            <div className="composer-box">
              <textarea
                ref={composer}
                aria-label={t(locale, "Your message to SAL", "رسالتك إلى سال")}
                placeholder={
                  urgent
                    ? t(
                        locale,
                        "Please seek emergency care now.",
                        "اطلب رعاية طارئة الآن.",
                      )
                    : t(
                        locale,
                        "Tell SAL what you’re feeling…",
                        "أخبر سال بما تشعر به…",
                      )
                }
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={busy || urgent}
                maxLength={2000}
                rows={2}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    void send(value);
                  }
                }}
              />
              <button
                disabled={busy || urgent || !value.trim()}
                aria-label={t(locale, "Send message", "أرسل الرسالة")}
              >
                <ArrowUp size={21} />
              </button>
            </div>
            <div className="composer-hint">
              <span>
                {t(
                  locale,
                  "Share only what you feel comfortable sharing.",
                  "شارك فقط ما تشعر بالراحة في مشاركته.",
                )}
              </span>
              <span>
                {t(
                  locale,
                  "Enter to send · Shift + Enter for a new line",
                  "Enter للإرسال · Shift + Enter لسطر جديد",
                )}
              </span>
            </div>
          </form>
          <p className="sal-safety">
            <ShieldCheck size={14} />
            {t(
              locale,
              "SAL helps you navigate care and may make mistakes. It doesn’t provide a medical diagnosis.",
              "سال يرشدك للرعاية وقد يخطئ. لا يقدم تشخيصاً طبياً.",
            )}
          </p>
        </section>
        <aside className="sal-context">
          <SalMascot
            size={265}
            state={
              busy
                ? "thinking"
                : lastResponse?.stage === "recommendation"
                  ? "recommendation"
                  : "listening"
            }
          />
          <h2>
            {t(locale, "Here to help you begin.", "هنا ليساعدك على البدء.")}
          </h2>
          <p>
            {t(
              locale,
              "A thoughtful question at a time. A little more clarity with every answer.",
              "سؤال مفيد في كل خطوة. ووضوح أكبر مع كل إجابة.",
            )}
          </p>
          <div className="sal-context-detail">
            <strong>{t(locale, "YOUR CONVERSATION", "محادثتك")}</strong>
            <p>
              {lastResponse?.symptomSummary ||
                t(
                  locale,
                  "Your concern, in your words. We’ll build a clearer picture together.",
                  "ما يقلقك، بكلماتك. نبني فهماً أوضح معاً.",
                )}
            </p>
          </div>
          <div className="sal-context-detail">
            <strong>{t(locale, "YOUR NEXT STEP", "خطوتك التالية")}</strong>
            <p>
              {urgent
                ? t(
                    locale,
                    "Seek emergency medical care.",
                    "اطلب رعاية طبية طارئة.",
                  )
                : lastResponse?.stage === "recommendation"
                  ? t(
                      locale,
                      "Review suitable care options and book a doctor.",
                      "راجع خيارات الرعاية المناسبة واحجز طبيباً.",
                    )
                  : t(
                      locale,
                      "Tell SAL a little more about how you’re feeling.",
                      "أخبر سال بالمزيد عما تشعر به.",
                    )}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
function UrgentPanel({
  message,
  phone,
}: {
  message: string;
  phone: string | null;
}) {
  const locale = useLocale();
  return (
    <div className="urgent-panel" role="alert">
      <h2>
        <AlertTriangle size={22} />
        {t(
          locale,
          "Please seek emergency care now",
          "يرجى طلب رعاية طارئة الآن",
        )}
      </h2>
      <p>{message}</p>
      {phone && (
        <a
          className="button button-danger"
          href={`tel:${phone}`}
          style={{ marginTop: 15 }}
        >
          {t(locale, "Call emergency services", "اتصل بالطوارئ")}
        </a>
      )}
    </div>
  );
}
