"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  MessageCircle,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { requestJson, errorText } from "@/lib/client";
import { parseSalReply } from "@/lib/validation/sal-reply";
import { t } from "@/lib/utils";
export function HeroComposer() {
  const locale = useLocale(),
    router = useRouter(),
    attempt = useRef<{ text: string; id: string } | null>(null);
  const [value, setValue] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(concern: string) {
    if (!concern.trim() || busy) return;
    setValue(concern);
    setBusy(true);
    setError("");
    if (attempt.current?.text !== concern)
      attempt.current = { text: concern, id: crypto.randomUUID() };
    try {
      const data = await requestJson<{ sessionId: string }>(
        "/api/sal/message",
        { message: concern, requestId: attempt.current!.id, locale },
        "POST",
        parseSalReply,
      );
      router.push(`/sal?session=${data.sessionId}`);
    } catch (e) {
      setError(errorText(e instanceof Error ? e.message : "", locale));
      setBusy(false);
    }
  }
  return (
    <div className="hero-composer">
      <form
        className="hero-input"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
      >
        <MessageCircle size={21} aria-hidden="true" />
        <input
          aria-label={t(
            locale,
            "Tell SAL what you’re feeling",
            "أخبر سال بما تشعر به",
          )}
          placeholder={t(
            locale,
            "Tell SAL what you’re feeling…",
            "أخبر سال بما تشعر به…",
          )}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={2000}
          disabled={busy}
        />
        <button
          disabled={busy || !value.trim()}
          aria-label={t(locale, "Start your conversation", "ابدأ محادثتك")}
        >
          {busy ? (
            <LoaderCircle size={20} className="spin" />
          ) : (
            <ArrowRight size={20} className="directional" />
          )}
        </button>
      </form>
      <div className="chip-row">
        {[
          ["Headache", "صداع"],
          ["Stomach pain", "ألم في المعدة"],
          ["Follow-up", "متابعة"],
          ["I’m not sure where to start", "لا أعرف من أين أبدأ"],
        ].map(([en, ar]) => (
          <button
            key={en}
            className="chip"
            onClick={() => void submit(t(locale, en, ar))}
            disabled={busy}
          >
            {t(locale, en, ar)}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-notice" role="alert" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      <span className="hero-note">
        <ShieldCheck size={13} />
        {busy
          ? t(
              locale,
              "SAL is listening. Your conversation is starting…",
              "سال يستمع. تبدأ محادثتك الآن…",
            )
          : t(
              locale,
              "No account needed to start. Guidance, not a diagnosis.",
              "ابدأ دون حساب. إرشاد للرعاية، وليس تشخيصاً.",
            )}
      </span>
    </div>
  );
}
