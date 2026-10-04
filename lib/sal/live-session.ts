import "server-only";
import { randomUUID } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api";
import { ownedSession, salOwner } from "./session";
import { emergencyResponse, hasUrgentRedFlag } from "@/lib/ai/safety";
import { getDoctors } from "@/lib/data/doctors";
import type { Locale, Message, SalResponse } from "@/types";
import type { LiveTurn } from "./live-validation";

export async function prepareLiveSession(input: {
  sessionId?: string | null;
  requestId: string;
  locale: Locale;
}) {
  const owner = await salOwner();
  const db = adminDb();
  let id = input.sessionId;
  if (!id) {
    const { data, error } = await db
      .from("clinic_sal_sessions")
      .upsert(
        {
          id: randomUUID(),
          initial_request_id: input.requestId,
          user_id: owner.userId,
          guest_token_hash: owner.userId ? null : owner.guestHash,
          title:
            input.locale === "ar"
              ? "محادثة صوتية مع سال"
              : "Voice conversation with SAL",
          locale: input.locale,
        },
        { onConflict: "initial_request_id", ignoreDuplicates: true },
      );
    void data;
    if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
    const { data: existing, error: lookupError } = await db
      .from("clinic_sal_sessions")
      .select("id")
      .eq("initial_request_id", input.requestId)
      .single();
    if (lookupError || !existing)
      throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
    id = existing.id;
  }
  await ownedSession(id!, owner);
  return id!;
}

export async function liveHistory(sessionId: string): Promise<Message[]> {
  const { data, error } = await adminDb()
    .from("clinic_sal_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
  return ((data || []) as Message[]).reverse();
}

export function isUrgentHistory(history: Message[], context = "") {
  return (
    hasUrgentRedFlag(context) ||
    history.some(
      (m) =>
        m.structured_data?.safety.urgent ||
        (m.role === "user" && hasUrgentRedFlag(m.content)),
    )
  );
}

export async function saveLiveTurns(
  sessionId: string,
  locale: Locale,
  turns: LiveTurn[],
  forceUrgent = false,
) {
  const history = await liveHistory(sessionId);
  const urgent =
    forceUrgent ||
    isUrgentHistory(
      history,
      turns
        .filter((t) => t.role === "user")
        .map((t) => t.content)
        .join("\n"),
    );
  const ids = new Set(turns.flatMap((t) => t.doctorIds));
  const doctors =
    !urgent && ids.size
      ? (await getDoctors()).filter((d) => ids.has(d.id))
      : [];
  const db = adminDb();
  for (const turn of turns) {
    const actual = doctors.filter((d) => turn.doctorIds.includes(d.id));
    const structured: SalResponse | null =
      turn.role === "user"
        ? null
        : urgent
          ? emergencyResponse(locale)
          : {
              message: turn.content,
              stage: actual.length ? "recommendation" : "question",
              followUpQuestions: [],
              symptomSummary: null,
              suggestedSpecialties: [
                ...new Set(
                  actual.flatMap((d) => d.specialties.map((s) => s.slug)),
                ),
              ],
              recommendedDoctorIds: actual.map((d) => d.id),
              doctors: actual,
              safety: { urgent: false, message: null },
              sources: [],
            };
    const { error } = await db.from("clinic_sal_messages").upsert(
      {
        session_id: sessionId,
        request_id: turn.requestId,
        role: turn.role,
        content: structured?.message || turn.content,
        structured_data: structured,
      },
      { onConflict: "session_id,request_id,role", ignoreDuplicates: true },
    );
    if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
  }
  const first = turns.find((t) => t.role === "user");
  const { error } = await db
    .from("clinic_sal_sessions")
    .update({
      updated_at: new Date().toISOString(),
      locale,
      ...(first && !history.some((m) => m.role === "user")
        ? { title: first.content.slice(0, 80) }
        : {}),
    })
    .eq("id", sessionId);
  if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
  return { saved: true, urgent };
}
