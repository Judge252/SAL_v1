"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionCall, LiveServerMessage, Session } from "@google/genai";
import { LiveAudio, MicrophoneError } from "@/lib/audio/live-audio";
import { requestJson, errorText } from "@/lib/client";
import { parseSalReply } from "@/lib/validation/sal-reply";
import { parseLiveToolResult } from "@/lib/validation/live-tool-result";
import { emergencyResponse, hasUrgentRedFlag } from "@/lib/ai/safety";
import {
  mergeTranscript,
  voiceTransition,
  type SalVoiceState,
  type VoiceEvent,
} from "@/lib/sal/voice-state";
import type { LiveTurn } from "@/lib/sal/live-validation";
import type { Doctor, Locale, Message, Slot } from "@/types";

type Runtime = {
  mounted: boolean;
  active: boolean;
  generation: number;
  socket: Session | null;
  audio: LiveAudio | null;
  sessionId: string | null;
  initialRequestId: string;
  state: SalVoiceState;
  muted: boolean;
  urgent: boolean;
  input: string;
  output: string;
  inputId: string;
  outputId: string;
  messages: Message[];
  doctors: Doctor[];
  unsaved: LiveTurn[];
  saving: Promise<void> | null;
  cancelled: Set<string>;
  tools: Map<string, AbortController>;
  reconnects: number;
  handle: string | null;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  expiry: ReturnType<typeof setTimeout> | null;
  connect: (() => Promise<void>) | null;
};
export function useSalLiveSession({
  locale,
  initialSessionId,
  initialMessages,
}: {
  locale: Locale;
  initialSessionId: string | null;
  initialMessages: Message[];
}) {
  const latest = [...initialMessages]
    .reverse()
    .find((m) => m.role === "assistant")?.structured_data;
  const rt = useRef<Runtime>({
    mounted: true,
    active: false,
    generation: 0,
    socket: null,
    audio: null,
    sessionId: initialSessionId,
    initialRequestId: "",
    state: "idle",
    muted: false,
    urgent: !!latest?.safety.urgent,
    input: "",
    output: "",
    inputId: "",
    outputId: "",
    messages: initialMessages,
    doctors: latest?.doctors || [],
    unsaved: [],
    saving: null,
    cancelled: new Set(),
    tools: new Map(),
    reconnects: 0,
    handle: null,
    startedAt: 0,
    timer: null,
    expiry: null,
    connect: null,
  });
  const [state, setState] = useState<SalVoiceState>("idle");
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [urgent, setUrgent] = useState(!!latest?.safety.urgent);
  const [messages, setMessages] = useState(initialMessages);
  const [caption, setCaption] = useState({ user: "", sal: "" });
  const [doctors, setDoctors] = useState<Doctor[]>(latest?.doctors || []);
  const [availability, setAvailability] = useState<Record<string, Slot[]>>({});
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [textBusy, setTextBusy] = useState(false);
  const [textOpen, setTextOpen] = useState(false);
  const [pendingText, setPendingText] = useState<{
    message: string;
    id: string;
  } | null>(null);
  const textLock = useRef(false);

  const transition = useCallback((event: VoiceEvent) => {
    const r = rt.current;
    r.state = voiceTransition(
      r.state,
      event,
      r.muted,
      !r.urgent && r.doctors.length > 0,
    );
    if (r.mounted) setState(r.state);
  }, []);
  const updateUrl = useCallback((id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);
  const showMessages = useCallback((next: Message[]) => {
    rt.current.messages = next;
    if (rt.current.mounted) setMessages(next);
  }, []);

  const persist = useCallback(() => {
    const r = rt.current;
    if (r.saving) return r.saving;
    r.saving = (async () => {
      while (r.sessionId && r.unsaved.length) {
        const batch = r.unsaved.slice(0, 4);
        try {
          const result = await requestJson<{ saved: boolean; urgent: boolean }>(
            "/api/sal/live-turns",
            { sessionId: r.sessionId, locale, turns: batch },
          );
          if (!result.saved) throw new Error("CONVERSATION_UNAVAILABLE");
          r.unsaved.splice(0, batch.length);
          if (r.mounted) setSaveError(false);
        } catch {
          if (r.mounted) setSaveError(true);
          break;
        }
      }
    })().finally(() => {
      r.saving = null;
    });
    return r.saving;
  }, [locale]);

  const finalize = useCallback(
    (role: "user" | "assistant", interrupted = false) => {
      const r = rt.current;
      let content = (role === "user" ? r.input : r.output).trim();
      if (!content) return;
      const id =
        (role === "user" ? r.inputId : r.outputId) || crypto.randomUUID();
      if (interrupted)
        content += locale === "ar" ? " (تمت المقاطعة)" : " (interrupted)";
      content = content.slice(0, 6000);
      const structured =
        role === "user"
          ? null
          : r.urgent
            ? emergencyResponse(locale)
            : {
                message: content,
                stage: r.doctors.length
                  ? ("recommendation" as const)
                  : ("question" as const),
                followUpQuestions: [],
                symptomSummary: null,
                suggestedSpecialties: [],
                recommendedDoctorIds: r.doctors.map((d) => d.id),
                doctors: r.doctors,
                sources: [],
                safety: { urgent: false, message: null },
              };
      showMessages([
        ...r.messages,
        {
          id,
          role,
          content: structured?.message || content,
          structured_data: structured,
          request_id: id,
          created_at: new Date().toISOString(),
        },
      ]);
      r.unsaved.push({
        requestId: id,
        role,
        content,
        doctorIds:
          !r.urgent && role === "assistant" ? r.doctors.map((d) => d.id) : [],
      });
      if (role === "user") {
        r.input = "";
        r.inputId = "";
      } else {
        r.output = "";
        r.outputId = "";
      }
    },
    [locale, showMessages],
  );

  const cleanup = useCallback(() => {
    const r = rt.current;
    r.active = false;
    r.generation++;
    if (r.timer) clearTimeout(r.timer);
    if (r.expiry) clearTimeout(r.expiry);
    r.timer = r.expiry = null;
    for (const controller of r.tools.values()) controller.abort();
    r.tools.clear();
    r.socket?.close();
    r.socket = null;
    r.audio?.close();
    r.audio = null;
    if (r.mounted) setConnected(false);
  }, []);
  const end = useCallback(() => {
    finalize("user");
    finalize("assistant", true);
    cleanup();
    void persist();
    transition("end");
  }, [finalize, cleanup, persist, transition]);
  const fail = useCallback(
    (code: string) => {
      finalize("user");
      finalize("assistant", true);
      cleanup();
      void persist();
      transition("fail");
      if (rt.current.mounted) {
        setError(errorText(code, locale));
        setTextOpen(true);
      }
    },
    [cleanup, finalize, locale, persist, transition],
  );
  const emergency = useCallback(
    (cue = true) => {
      const r = rt.current;
      if (r.urgent) return;
      r.urgent = true;
      r.doctors = [];
      if (r.mounted) {
        setUrgent(true);
        setDoctors([]);
        setAvailability({});
      }
      r.audio?.interrupt();
      if (cue && r.socket)
        r.socket.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [
                {
                  text: `Please stop routine care navigation and speak urgent guidance now: ${emergencyResponse(locale).message}`,
                },
              ],
            },
          ],
          turnComplete: true,
        });
    },
    [locale],
  );

  const runTool = useCallback(
    async (call: FunctionCall, generation: number) => {
      const r = rt.current;
      if (!call.id || !call.name || !r.sessionId) return;
      const controller = new AbortController();
      r.tools.set(call.id, controller);
      transition("user");
      try {
        finalize("user");
        await persist();
        const response = await fetch("/api/sal/live-tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: r.sessionId,
            locale,
            context:
              r.input ||
              r.messages
                .filter((m) => m.role === "user")
                .slice(-2)
                .map((m) => m.content)
                .join("\n"),
            call: { name: call.name, args: call.args || {} },
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(25000),
          ]),
        });
        if (!response.ok) throw new Error("DIRECTORY_UNAVAILABLE");
        const data = parseLiveToolResult(await response.json());
        if (generation !== r.generation || r.cancelled.has(call.id)) return;
        if (data.urgent) {
          emergency(false);
          if (data.urgentRequestId) r.outputId = data.urgentRequestId;
        }
        if (data.doctors && !r.urgent) {
          r.doctors = data.doctors;
          if (r.mounted) {
            setDoctors(data.doctors);
            setAvailability((old) => ({ ...old, ...data.availability }));
          }
          transition("recommend");
        }
        r.socket?.sendToolResponse({
          functionResponses: [{ id: call.id, name: call.name, response: data }],
        });
      } catch {
        if (
          !controller.signal.aborted &&
          generation === r.generation &&
          !r.cancelled.has(call.id)
        )
          r.socket?.sendToolResponse({
            functionResponses: [
              {
                id: call.id,
                name: call.name,
                response: {
                  error: "DIRECTORY_UNAVAILABLE",
                  message:
                    "The lookup failed. Do not invent profiles or availability. Ask the person to retry or browse the directory.",
                },
              },
            ],
          });
      } finally {
        r.tools.delete(call.id);
      }
    },
    [emergency, finalize, locale, persist, transition],
  );

  const receive = useCallback(
    (message: LiveServerMessage, generation: number) => {
      const r = rt.current;
      if (generation !== r.generation || !r.active) return;
      const update = message.sessionResumptionUpdate;
      if (update?.resumable && update.newHandle) r.handle = update.newHandle;
      for (const id of message.toolCallCancellation?.ids || []) {
        r.cancelled.add(id);
        r.tools.get(id)?.abort();
      }
      for (const call of message.toolCall?.functionCalls || [])
        void runTool(call, generation);
      const content = message.serverContent;
      if (content?.interrupted) {
        r.audio?.interrupt();
        finalize("user");
        finalize("assistant", true);
        transition("interrupt");
      }
      if (content?.inputTranscription?.text) {
        r.inputId ||= crypto.randomUUID();
        r.input = mergeTranscript(r.input, content.inputTranscription.text);
        if (r.mounted) setCaption((old) => ({ ...old, user: r.input }));
        if (hasUrgentRedFlag(r.input)) emergency();
        if (!r.audio?.playing)
          transition(content.inputTranscription.finished ? "user" : "listen");
      }
      if (content?.outputTranscription?.text) {
        if (!r.audio?.playing) transition("user");
        r.outputId ||= crypto.randomUUID();
        r.output = mergeTranscript(r.output, content.outputTranscription.text);
        if (r.mounted) setCaption((old) => ({ ...old, sal: r.output }));
      }
      for (const part of content?.modelTurn?.parts || []) {
        if (
          part.inlineData?.data &&
          part.inlineData.mimeType?.startsWith("audio/pcm")
        ) {
          if (r.timer) {
            clearTimeout(r.timer);
            r.timer = null;
          }
          try {
            r.audio?.play(part.inlineData.data, part.inlineData.mimeType);
            transition("audio");
          } catch {
            fail("AUDIO_UNAVAILABLE");
            return;
          }
        }
      }
      if (content?.turnComplete) {
        finalize("user");
        finalize("assistant");
        void persist();
        if (!r.audio?.playing) transition("complete");
        if (r.timer) {
          clearTimeout(r.timer);
          r.timer = null;
        }
      }
      if (message.goAway && r.connect && r.active) {
        // Invalidate the old callbacks before closing; resume using the latest handle.
        r.generation++;
        r.socket?.close();
        r.socket = null;
        r.audio?.interrupt();
        void r.connect().catch(() => fail("LIVE_DISCONNECTED"));
      }
    },
    [emergency, fail, finalize, persist, runTool, transition],
  );

  const start = useCallback(async () => {
    const r = rt.current;
    if (r.active || textLock.current) return;
    r.active = true;
    r.muted = false;
    r.handle = null;
    r.reconnects = 0;
    r.startedAt = Date.now();
    r.generation++;
    r.cancelled.clear();
    setError("");
    setMuted(false);
    transition("connect");
    const activation = r.generation;
    let audio: LiveAudio;
    try {
      audio = new LiveAudio();
      r.audio = audio;
    } catch {
      fail("MIC_UNSUPPORTED");
      return;
    }
    audio.onDrain = () => {
      if (r.active) transition("complete");
    };
    audio.onMicrophoneEnded = () => fail("MIC_ENDED");
    try {
      // Permission starts from this tap, before any token/network work.
      await audio.microphone((data) => {
        if (r.active && !r.muted)
          r.socket?.sendRealtimeInput({
            audio: { data, mimeType: "audio/pcm;rate=16000" },
          });
      });
      if (!r.active || activation !== r.generation) return;
      if (r.unsaved.length) {
        await persist();
        if (r.unsaved.length) throw new Error("CONVERSATION_UNAVAILABLE");
      }
      r.initialRequestId ||= crypto.randomUUID();
      const info = await requestJson<{
        sessionId: string;
        model: string;
        apiVersion: string;
      }>("/api/sal/live-session", {
        sessionId: r.sessionId,
        requestId: r.initialRequestId,
        locale,
      });
      if (!r.active || activation !== r.generation) return;
      r.sessionId = info.sessionId;
      updateUrl(info.sessionId);
      const { GoogleGenAI } = await import("@google/genai");
      r.connect = async () => {
        if (!r.active) return;
        if (r.reconnects++ > 2) throw new Error("LIVE_DISCONNECTED");
        transition("connect");
        setConnected(false);
        const generation = ++r.generation;
        const { token } = await requestJson<{ token: string }>(
          "/api/sal/live-token",
          { sessionId: r.sessionId, locale },
        );
        if (!r.active || generation !== r.generation) return;
        const ai = new GoogleGenAI({
          apiKey: token,
          httpOptions: { apiVersion: info.apiVersion },
        });
        const setup = ai.live.connect({
          model: info.model,
          config: { sessionResumption: r.handle ? { handle: r.handle } : {} },
          callbacks: {
            onmessage: (m) => receive(m, generation),
            onerror: () => {
              /* close reports the recoverable disconnection without logging conversation/credentials */
            },
            onclose: () => {
              if (r.active && generation === r.generation) {
                if (!r.socket) {
                  fail("LIVE_UNAVAILABLE");
                  return;
                }
                r.socket = null;
                r.audio?.interrupt();
                finalize("user");
                finalize("assistant", true);
                void persist();
                void r.connect?.().catch(() => fail("LIVE_DISCONNECTED"));
              }
            },
          },
        });
        // A closed socket can leave the SDK's setup promise pending. Stop the
        // microphone and recover the UI even if no setup acknowledgement arrives.
        let setupTimer: ReturnType<typeof setTimeout> | undefined;
        void setup
          .then((s) => {
            if (!r.active || generation !== r.generation) s.close();
          })
          .catch(() => {});
        let socket: Session;
        try {
          socket = await Promise.race([
            setup,
            new Promise<never>((_, reject) => {
              setupTimer = setTimeout(
                () => reject(new Error("LIVE_TIMEOUT")),
                25000,
              );
            }),
          ]);
        } finally {
          if (setupTimer) clearTimeout(setupTimer);
        }
        if (!r.active || generation !== r.generation) {
          socket.close();
          return;
        }
        r.socket = socket;
        setConnected(true);
        transition("connected");
        if (!r.handle)
          socket.sendRealtimeInput({
            text: r.urgent
              ? `Please say this urgent guidance: ${emergencyResponse(locale).message}`
              : r.messages.length
                ? "We are continuing the same conversation. Briefly invite me to continue; do not repeat questions already answered."
                : locale === "ar"
                  ? "حيّني باختصار باسم سال، واسألني عمّا يزعجني."
                  : "Briefly greet me as SAL and ask what's bothering me.",
          });
      };
      await r.connect();
      if (!r.active) return;
      r.expiry = setTimeout(end, 20 * 60000);
    } catch (e) {
      if (!r.active || (e instanceof DOMException && e.name === "AbortError"))
        return;
      fail(e instanceof MicrophoneError ? e.code : "LIVE_UNAVAILABLE");
    }
  }, [end, fail, finalize, locale, persist, receive, transition, updateUrl]);

  const toggleMute = useCallback(() => {
    const r = rt.current;
    if (!r.audio || !r.active) return;
    r.muted = !r.muted;
    r.audio.setMuted(r.muted);
    setMuted(r.muted);
    if (r.muted) r.socket?.sendRealtimeInput({ audioStreamEnd: true });
    transition(r.muted ? "mute" : "unmute");
  }, [transition]);

  const reset = useCallback(async () => {
    end();
    await persist();
    const r = rt.current;
    if (r.unsaved.length) return;
    r.sessionId = null;
    r.initialRequestId = "";
    r.handle = null;
    r.doctors = [];
    r.urgent = false;
    r.messages = [];
    r.input = r.output = r.inputId = r.outputId = "";
    r.state = "idle";
    r.muted = false;
    setMessages([]);
    setDoctors([]);
    setAvailability({});
    setUrgent(false);
    setCaption({ user: "", sal: "" });
    setError("");
    setPendingText(null);
    setTextOpen(false);
    setMuted(false);
    setState("idle");
    window.history.replaceState(null, "", "/sal");
  }, [end, persist]);

  const sendText = useCallback(
    async (text: string, retry = false) => {
      const r = rt.current;
      if (
        !text.trim() ||
        textLock.current ||
        r.urgent ||
        r.state === "connecting"
      )
        return;
      const attempt =
        retry && pendingText
          ? pendingText
          : { message: text.trim(), id: crypto.randomUUID() };
      if (r.socket && r.active) {
        finalize("user");
        finalize("assistant", true);
        r.audio?.interrupt();
        r.input = attempt.message;
        r.inputId = attempt.id;
        finalize("user");
        setCaption({ user: attempt.message, sal: "" });
        r.socket.sendRealtimeInput({ text: attempt.message });
        // Muting ends the audio stream, so there is no subsequent silence for
        // VAD to finish this typed turn. Trigger generation from the accumulated
        // prompt with an empty client-content boundary; do not duplicate the text.
        if (r.muted) r.socket.sendClientContent({ turnComplete: true });
        if (hasUrgentRedFlag(attempt.message)) emergency();
        transition("user");
        void persist();
        if (r.timer) clearTimeout(r.timer);
        r.timer = setTimeout(() => fail("LIVE_TIMEOUT"), 30000);
        return;
      }
      textLock.current = true;
      setTextBusy(true);
      setError("");
      setPendingText(attempt);
      if (!retry)
        showMessages([
          ...r.messages,
          {
            id: attempt.id,
            request_id: attempt.id,
            role: "user",
            content: attempt.message,
            structured_data: null,
            created_at: new Date().toISOString(),
          },
        ]);
      if (hasUrgentRedFlag(attempt.message)) emergency(false);
      try {
        if (r.unsaved.length) {
          await persist();
          if (r.unsaved.length) throw new Error("CONVERSATION_UNAVAILABLE");
        }
        const data = await requestJson<{ sessionId: string; message: Message }>(
          "/api/sal/message",
          {
            sessionId: r.sessionId,
            message: attempt.message,
            requestId: attempt.id,
            locale,
          },
          "POST",
          parseSalReply,
        );
        r.sessionId = data.sessionId;
        updateUrl(data.sessionId);
        showMessages([...r.messages, data.message]);
        setPendingText(null);
        setCaption({ user: attempt.message, sal: data.message.content });
        if (data.message.structured_data?.safety.urgent) emergency(false);
        if (!r.urgent) {
          r.doctors = data.message.structured_data?.doctors || [];
          setDoctors(r.doctors);
        }
        r.state = r.doctors.length ? "recommendation" : "idle";
        if (r.mounted) setState(r.state);
      } catch (e) {
        if (r.mounted)
          setError(errorText(e instanceof Error ? e.message : "", locale));
      } finally {
        textLock.current = false;
        if (r.mounted) setTextBusy(false);
      }
    },
    [
      emergency,
      fail,
      finalize,
      locale,
      pendingText,
      persist,
      showMessages,
      transition,
      updateUrl,
    ],
  );

  useEffect(() => {
    const r = rt.current;
    r.mounted = true;
    const leave = () => {
      finalize("user");
      finalize("assistant", true);
      cleanup();
      if (r.sessionId && r.unsaved.length)
        void fetch("/api/sal/live-turns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            sessionId: r.sessionId,
            locale,
            turns: r.unsaved
              .slice(0, 4)
              .map((t) => ({ ...t, content: t.content.slice(0, 2000) })),
          }),
        }).catch(() => {});
    };
    window.addEventListener("pagehide", leave);
    return () => {
      r.mounted = false;
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [cleanup, finalize, locale]);

  return {
    state,
    connected,
    muted,
    urgent,
    messages,
    caption,
    doctors,
    availability,
    error,
    saveError,
    textBusy,
    textOpen,
    setTextOpen,
    pendingText,
    start,
    end,
    reset,
    toggleMute,
    sendText,
    persist,
    audioLevels: () => rt.current.audio?.levels() || { user: 0, sal: 0 },
  };
}
