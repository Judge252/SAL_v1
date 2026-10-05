"use client";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Keyboard,
  ArrowUp,
  RotateCcw,
  ShieldCheck,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Captions,
} from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { useSalLiveSession } from "@/hooks/use-sal-live-session";
import { SalMascot } from "./mascot";
import { DoctorCard } from "@/components/doctors/doctor-card";
import { Button } from "@/components/ui";
import { t } from "@/lib/utils";
import { emergencyResponse } from "@/lib/ai/safety";
import type { Message, SalSession, Locale, Doctor, Slot } from "@/types";
import type { SalVoiceState } from "@/lib/sal/voice-state";

function useAudioAnalyser(
  root: RefObject<HTMLDivElement | null>,
  levels: () => { user: number; sal: number },
  active: boolean,
) {
  const reader = useRef(levels);
  useEffect(() => {
    reader.current = levels;
  }, [levels]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    if (!active) {
      element.style.setProperty("--user-level", "0");
      element.style.setProperty("--sal-level", "0");
      return;
    }
    let frame = 0,
      previousUser = 0,
      previousSal = 0;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const tick = () => {
      const value = reader.current();
      previousUser += (value.user - previousUser) * 0.35;
      previousSal += (value.sal - previousSal) * 0.35;
      element.style.setProperty("--user-level", previousUser.toFixed(3));
      element.style.setProperty(
        "--sal-level",
        (reduced.matches ? 0 : previousSal).toFixed(3),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, root]);
}

const statusText: Record<SalVoiceState, [string, string]> = {
  idle: ["Your AI care companion", "رفيقك الذكي للرعاية"],
  connecting: ["Connecting to SAL…", "جارٍ الاتصال بسال…"],
  listening: ["Listening…", "أستمع إليك…"],
  thinking: ["Thinking…", "أفكر معك…"],
  speaking: ["SAL is speaking", "سال يتحدث"],
  recommendation: ["Your next step, together", "خطوتك التالية، معًا"],
  muted: [
    "Microphone muted · you can still type",
    "الميكروفون مكتوم · يمكنك الكتابة",
  ],
  error: ["Let’s try again", "لنحاول مجددًا"],
  ended: [
    "Call ended · your conversation stays here",
    "انتهى الاتصال · محادثتك محفوظة هنا",
  ],
};
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function SalStatus({
  state,
  locale,
}: {
  state: SalVoiceState;
  locale: Locale;
}) {
  return (
    <p className="voice-status" role="status">
      <span className={`voice-status-dot state-${state}`} />
      {t(locale, ...statusText[state])}
    </p>
  );
}
export function SalWaveform({ active }: { active: boolean }) {
  return (
    <div className="sal-waveform" aria-hidden="true" data-active={active}>
      {Array.from({ length: 21 }, (_, i) => (
        <i
          key={i}
          style={
            {
              "--bar-weight": 0.35 + (1 - Math.abs(10 - i) / 10) * 0.65,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
export function SalDoctorRecommendations({
  doctors,
  availability,
  locale,
}: {
  doctors: Doctor[];
  availability: Record<string, Slot[]>;
  locale: Locale;
}) {
  if (!doctors.length) return null;
  return (
    <section
      className="voice-recommendations sal-recommendations"
      aria-label={t(locale, "Doctors from our directory", "أطباء من دليلنا")}
    >
      <div className="voice-recommendation-heading">
        <div>
          <span className="eyebrow">
            {t(locale, "Your next step", "خطوتك التالية")}
          </span>
          <h2>
            {t(
              locale,
              "Care to explore, together.",
              "لنجد الرعاية المناسبة معًا.",
            )}
          </h2>
        </div>
        <Link href="/doctors" className="text-link">
          {t(locale, "View all", "عرض الكل")}
          <ArrowUpRight size={16} className="directional" />
        </Link>
      </div>
      <div className="doctor-grid">
        {doctors.map((doctor) => (
          <DoctorCard
            key={doctor.id}
            doctor={doctor}
            locale={locale}
            availability={availability[doctor.id]}
          />
        ))}
      </div>
    </section>
  );
}

export function SalVoiceExperience({
  session = null,
  initialMessages = [],
  emergencyPhone = null,
  home = false,
}: {
  session?: SalSession | null;
  initialMessages?: Message[];
  emergencyPhone?: string | null;
  home?: boolean;
}) {
  const locale = useLocale();
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const live = useSalLiveSession({
    locale,
    initialSessionId: session?.id || null,
    initialMessages,
  });
  const root = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [captions, setCaptions] = useState(true);
  useAudioAnalyser(root, live.audioLevels, live.connected);
  const active = live.connected || live.state === "connecting";
  const last = live.messages.at(-1);
  const captionUser =
    live.caption.user ||
    [...live.messages].reverse().find((m) => m.role === "user")?.content ||
    "";
  const captionSal =
    live.caption.sal ||
    [...live.messages].reverse().find((m) => m.role === "assistant")?.content ||
    "";
  useEffect(() => {
    if (live.textOpen) composer.current?.focus();
  }, [live.textOpen]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    const text = value;
    setValue("");
    await live.sendText(text);
    composer.current?.focus();
  }
  return (
    <div
      ref={root}
      className={`sal-voice-experience ${home ? "voice-home" : "voice-page"}`}
      data-voice-state={live.state}
      data-live-connected={live.connected}
      data-mic-muted={live.muted}
    >
      <section
        className="voice-stage"
        aria-label={t(locale, "Talk to SAL", "تحدّث مع سال")}
      >
        {!home && (
          <div className="voice-page-actions">
            <button
              onClick={() => void live.reset()}
              className="voice-small-action"
              disabled={live.textBusy}
            >
              <Plus size={15} />
              {t(locale, "New conversation", "محادثة جديدة")}
            </button>
            <button
              className="voice-small-action"
              aria-pressed={captions}
              onClick={() => setCaptions((v) => !v)}
            >
              <Captions size={17} />
              {t(locale, "Captions", "النص المصاحب")}
            </button>
          </div>
        )}
        {live.urgent && (
          <div className="urgent-panel voice-urgent" role="alert">
            <AlertTriangle size={24} />
            <div>
              <h1>
                {t(
                  locale,
                  "Please seek urgent medical help",
                  "اطلب المساعدة الطبية العاجلة",
                )}
              </h1>
              <p>{emergencyResponse(locale).message}</p>
              {emergencyPhone && (
                <a
                  className="button button-danger"
                  href={`tel:${emergencyPhone}`}
                >
                  {t(locale, "Call emergency help", "اتصل بالطوارئ")}
                </a>
              )}
            </div>
          </div>
        )}
        <span className="voice-companion eyebrow light">
          {t(locale, "Your AI care companion", "رفيقك الذكي للرعاية")}
        </span>
        <div
          className={`voice-mascot-scene ${live.urgent ? "voice-urgent-scene" : ""}`}
        >
          <div className="voice-halo" aria-hidden="true" />
          <div className="voice-listening-ring" aria-hidden="true" />
          <SalMascot
            size={440}
            state={
              live.state === "speaking"
                ? "speaking"
                : live.state === "thinking"
                  ? "thinking"
                  : active
                    ? "listening"
                    : "idle"
            }
            className="voice-mascot"
            priority
          />
          <div className="voice-ground-shadow" aria-hidden="true" />
        </div>
        {!live.urgent && (
          <h1>
            {live.messages.length
              ? t(locale, "I’m here. Let’s talk.", "أنا هنا معك. لنتحدّث.")
              : t(locale, "Hi, I’m SAL.", "مرحبًا، أنا سال.")}{" "}
            <span>
              {t(locale, "Tell me what’s bothering you.", "أخبرني بما يزعجك.")}
            </span>
          </h1>
        )}
        <SalStatus state={live.state} locale={locale} />
        <SalWaveform active={live.connected && !live.muted} />
        <div className="voice-call-controls">
          {active ? (
            <>
              <button
                className="sal-mic-button"
                onClick={live.toggleMute}
                disabled={!live.connected}
                aria-label={
                  live.muted
                    ? t(locale, "Unmute microphone", "تشغيل الميكروفون")
                    : t(locale, "Mute microphone", "كتم الميكروفون")
                }
                aria-pressed={live.muted}
              >
                {live.muted ? <MicOff size={29} /> : <Mic size={29} />}
                <span>
                  {live.muted
                    ? t(locale, "Unmute", "تشغيل")
                    : t(locale, "Mute", "كتم")}
                </span>
              </button>
              <button
                className="voice-end-button"
                onClick={live.end}
                aria-label={t(locale, "End call", "إنهاء الاتصال")}
              >
                <PhoneOff size={20} />
                <span>{t(locale, "End", "إنهاء")}</span>
              </button>
            </>
          ) : (
            <button
              className="sal-mic-button start-call"
              onClick={() => void live.start()}
              disabled={!hydrated || live.textBusy}
            >
              {live.state === "error" ? (
                <RotateCcw size={28} />
              ) : (
                <Mic size={30} />
              )}
              <span>{t(locale, "Talk to SAL", "تحدّث مع سال")}</span>
            </button>
          )}
        </div>
        <div className="voice-secondary-controls">
          <button
            className="voice-text-toggle"
            onClick={() => live.setTextOpen(!live.textOpen)}
            aria-expanded={live.textOpen}
            aria-controls="sal-text-fallback"
          >
            <Keyboard size={17} />
            {live.textOpen
              ? t(locale, "Hide typing", "إخفاء المحادثة النصية")
              : t(
                  locale,
                  "Prefer typing? Start text chat",
                  "تفضّل الكتابة؟ ابدأ محادثة نصية",
                )}
          </button>
          {home && (live.connected || live.messages.length > 0) && (
            <button
              className="voice-small-action"
              aria-pressed={captions}
              onClick={() => setCaptions((v) => !v)}
            >
              <Captions size={17} />
              {t(locale, "Captions", "النص المصاحب")}
            </button>
          )}
        </div>
        {live.error && (
          <div className="voice-error error-notice" role="alert">
            <p>{live.error}</p>
            {live.pendingText && !live.urgent && (
              <Button
                variant="secondary"
                loading={live.textBusy}
                onClick={() =>
                  void live.sendText(live.pendingText!.message, true)
                }
              >
                {t(locale, "Try again", "حاول مجددًا")}
              </Button>
            )}
          </div>
        )}
        {live.saveError && (
          <div className="voice-error error-notice" role="alert">
            <p>
              {t(
                locale,
                "Your latest transcript hasn’t saved yet. Keep this page open and try saving again.",
                "لم يتم حفظ آخر جزء من المحادثة بعد. أبقِ الصفحة مفتوحة وحاول الحفظ مجددًا.",
              )}
            </p>
            <Button variant="secondary" onClick={() => void live.persist()}>
              {t(locale, "Retry saving", "إعادة الحفظ")}
            </Button>
          </div>
        )}
        {captions && !live.urgent && (captionUser || captionSal) && (
          <div
            className="voice-captions"
            aria-label={t(locale, "Recent exchange", "آخر جزء من المحادثة")}
          >
            {captionUser && (
              <p className="voice-caption-user" dir="auto">
                <small>{t(locale, "You", "أنت")}</small>
                {captionUser}
              </p>
            )}
            {captionSal && (
              <p className="sal-message voice-caption-sal" dir="auto">
                <small>SAL</small>
                {captionSal}
              </p>
            )}
          </div>
        )}
        {live.textOpen && (
          <div id="sal-text-fallback" className="sal-text-fallback">
            <form onSubmit={submit} className="voice-text-form">
              <label className="sr-only" htmlFor="voice-text-message">
                {t(locale, "Your message to SAL", "رسالتك إلى سال")}
              </label>
              <textarea
                ref={composer}
                id="voice-text-message"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                maxLength={2000}
                rows={2}
                placeholder={t(
                  locale,
                  "Tell SAL what you’re feeling…",
                  "أخبر سال بما تشعر به…",
                )}
                disabled={
                  live.textBusy || live.urgent || live.state === "connecting"
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <Button
                type="submit"
                disabled={
                  !value.trim() || live.urgent || live.state === "connecting"
                }
                loading={live.textBusy}
                aria-label={t(locale, "Send message", "إرسال الرسالة")}
              >
                <ArrowUp size={19} />
              </Button>
            </form>
            <p className="voice-text-hint">
              {live.connected
                ? t(
                    locale,
                    "Same conversation. SAL will reply with voice.",
                    "المحادثة نفسها، وسيجيبك سال بصوته.",
                  )
                : t(
                    locale,
                    "Continue by text, or turn on voice whenever you’re ready.",
                    "تابع بالكتابة، أو فعّل الصوت متى كنت مستعدًا.",
                  )}
            </p>
          </div>
        )}
        {live.messages.length > 0 && (
          <details className="voice-transcript">
            <summary>
              {t(locale, "Conversation transcript", "نص المحادثة")}{" "}
              <span>{live.messages.length}</span>
            </summary>
            <div
              className="conversation-log"
              role="log"
              aria-label={t(locale, "Conversation", "المحادثة")}
            >
              {live.messages.map((m) => (
                <div
                  className={
                    m.role === "user"
                      ? "patient-message"
                      : "voice-transcript-sal"
                  }
                  key={m.id}
                >
                  <small>
                    {m.role === "user" ? t(locale, "You", "أنت") : "SAL"}
                  </small>
                  <p dir="auto">{m.content}</p>
                  {m.structured_data?.sources.map((source) => (
                    <a
                      key={source.id}
                      href={source.source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {source.title}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </details>
        )}
        <p className="voice-boundary">
          <ShieldCheck size={13} />
          {t(
            locale,
            "Care guidance, not a diagnosis. No account needed to talk.",
            "إرشاد للرعاية، وليس تشخيصًا. لا تحتاج إلى حساب لبدء المحادثة.",
          )}
        </p>
        <Link href="/privacy" className="voice-privacy">
          {t(
            locale,
            "Voice processed by Gemini · text transcripts saved",
            "يُعالج الصوت عبر Gemini · تُحفظ نصوص المحادثة",
          )}
        </Link>
        {live.textBusy && (
          <span className="sr-only" role="status">
            {t(locale, "SAL is thinking…", "سال يفكر…")}
          </span>
        )}
        {!active && last?.structured_data?.symptomSummary && live.textOpen && (
          <p className="voice-text-summary" dir="auto">
            {last.structured_data.symptomSummary}
          </p>
        )}
      </section>
      {!live.urgent && (
        <SalDoctorRecommendations
          doctors={live.doctors}
          availability={live.availability}
          locale={locale}
        />
      )}
    </div>
  );
}
