import { randomUUID } from "node:crypto";
import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { salInput } from "@/lib/validation";
import { adminDb } from "@/lib/supabase/admin";
import { salOwner, ownedSession } from "@/lib/sal/session";
import { getDoctors, getSpecialties } from "@/lib/data/doctors";
import { consumeLimit, configuredLimit, networkHash } from "@/lib/rate-limit";
import { hasUrgentRedFlag, emergencyResponse } from "@/lib/ai/safety";
import { GeminiProvider } from "@/lib/ai/gemini";
import { retrieveKnowledge } from "@/lib/rag";
import { matchDoctors } from "@/lib/matching";
import type { Message, SalResponse } from "@/types";
export const maxDuration = 90;
export async function POST(request: Request) {
  let locked: string | null = null;
  let leaseUntil: string | null = null;
  try {
    assertOrigin(request);
    const input = await parseBody(request, salInput),
      owner = await salOwner(),
      db = adminDb();
    let sessionId = input.sessionId;
    if (!sessionId) {
      const { data: existing } = await db
        .from("clinic_sal_sessions")
        .select("id")
        .eq("initial_request_id", input.requestId)
        .maybeSingle();
      if (existing) sessionId = existing.id;
      else {
        sessionId = randomUUID();
        const { error } = await db.from("clinic_sal_sessions").insert({
          id: sessionId,
          initial_request_id: input.requestId,
          user_id: owner.userId,
          guest_token_hash: owner.userId ? null : owner.guestHash,
          title: input.message.slice(0, 80),
          locale: input.locale,
        });
        if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
      }
    }
    await ownedSession(sessionId!, owner);
    const { data: previous } = await db
      .from("clinic_sal_messages")
      .select("*")
      .eq("session_id", sessionId)
      .eq("request_id", input.requestId)
      .eq("role", "assistant")
      .maybeSingle();
    if (previous) return json({ sessionId, message: previous });
    leaseUntil = new Date(Date.now() + 120000).toISOString();
    const { data: lease } = await db
      .from("clinic_sal_sessions")
      .update({ processing_until: leaseUntil })
      .eq("id", sessionId)
      .lt("processing_until", new Date().toISOString())
      .select("id")
      .maybeSingle();
    if (!lease) throw new ApiError("CONVERSATION_BUSY", 409);
    locked = sessionId!;
    await consumeLimit(
      `sal:${owner.userId || owner.guestHash}`,
      configuredLimit(
        owner.userId ? "SAL_USER_DAILY_LIMIT" : "SAL_GUEST_DAILY_LIMIT",
        owner.userId ? 50 : 15,
      ),
    );
    await consumeLimit(
      `sal-network:${networkHash(request)}`,
      configuredLimit("SAL_IP_DAILY_LIMIT", 100),
    );
    const { error: saveError } = await db.from("clinic_sal_messages").upsert(
      {
        session_id: sessionId,
        request_id: input.requestId,
        role: "user",
        content: input.message,
      },
      { onConflict: "session_id,request_id,role", ignoreDuplicates: true },
    );
    if (saveError) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
    const { data: rows, error: historyError } = await db
      .from("clinic_sal_messages")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (historyError) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
    const history = ((rows || []) as Message[]).reverse();
    if (history.some((m) => m.structured_data?.safety.urgent))
      throw new ApiError("URGENT_SESSION", 409);
    let answer: SalResponse;
    if (hasUrgentRedFlag(input.message))
      answer = emergencyResponse(input.locale);
    else {
      const [specialties, doctors, knowledge] = await Promise.all([
        getSpecialties(),
        getDoctors(),
        retrieveKnowledge(input.message),
      ]);
      const result = await new GeminiProvider().respond({
        locale: input.locale,
        history,
        specialties,
        knowledge,
      });
      if (result.safety.urgent || result.stage === "urgent")
        answer = emergencyResponse(input.locale);
      else {
        const slugs = result.suggestedSpecialties.filter((s) =>
          specialties.some((x) => x.slug === s),
        );
        const matches =
          result.stage === "recommendation"
            ? matchDoctors(doctors, slugs, input.locale)
            : [];
        answer = {
          ...result,
          suggestedSpecialties: slugs,
          recommendedDoctorIds: matches.map((d) => d.id),
          doctors: matches,
          sources: knowledge.map(({ id, title, source }) => ({
            id,
            title,
            source,
          })),
          safety: { urgent: false, message: result.safety.message },
        };
      }
    }
    const { data: message, error } = await db
      .from("clinic_sal_messages")
      .insert({
        session_id: sessionId,
        request_id: input.requestId,
        role: "assistant",
        content: answer.message,
        structured_data: answer,
      })
      .select("*")
      .single();
    if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
    return json({ sessionId, message });
  } catch (error) {
    return apiError(error);
  } finally {
    if (locked)
      await adminDb()
        .from("clinic_sal_sessions")
        .update({ processing_until: "-infinity" })
        .eq("id", locked)
        .eq("processing_until", leaseUntil!);
  }
}
