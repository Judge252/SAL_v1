export type SalVoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "recommendation"
  | "muted"
  | "error"
  | "ended";
export type VoiceEvent =
  | "connect"
  | "connected"
  | "listen"
  | "user"
  | "audio"
  | "complete"
  | "recommend"
  | "mute"
  | "unmute"
  | "interrupt"
  | "fail"
  | "end";
export function voiceTransition(
  state: SalVoiceState,
  event: VoiceEvent,
  muted = false,
  recommendations = false,
): SalVoiceState {
  if (event === "connect") return "connecting";
  if (event === "fail") return "error";
  if (event === "end") return "ended";
  if (event === "audio") return "speaking";
  if (event === "mute") return "muted";
  if (event === "listen") return muted ? "muted" : "listening";
  if (event === "user") return "thinking";
  if (
    ["connected", "complete", "unmute", "interrupt", "recommend"].includes(
      event,
    )
  )
    return muted ? "muted" : recommendations ? "recommendation" : "listening";
  return state;
}

// Gemini transcription events are deltas. Ignore exact duplicates; also accept
// cumulative hypotheses without repeating already displayed words.
export function mergeTranscript(current: string, fragment: string) {
  if (
    !fragment ||
    current === fragment ||
    (current && current.endsWith(fragment))
  )
    return current;
  if (fragment.startsWith(current) && current) return fragment;
  return (current + fragment).slice(0, 6000);
}
