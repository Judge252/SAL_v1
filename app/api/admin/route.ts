import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { getIdentity } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { adminAction } from "@/lib/validation/management";
import { GeminiProvider } from "@/lib/ai/gemini";
import { chunkDocument } from "@/lib/rag";
import { consumeLimit } from "@/lib/rate-limit";
export const maxDuration = 90;
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, adminAction),
      identity = await getIdentity();
    if (!identity) throw new ApiError("AUTH_REQUIRED", 401);
    if (identity.profile.role !== "admin") throw new ApiError("FORBIDDEN", 403);
    const db = adminDb();
    if (input.action === "doctor.save") {
      if (
        input.data.photo_url &&
        !input.data.photo_url.startsWith(
          `${process.env.SUPABASE_URL}/storage/v1/object/public/clinic-doctor-photos/`,
        )
      )
        throw new ApiError("INVALID_INPUT");
      const { data, error } = await db.rpc("salapp_save_doctor", {
        p_data: {
          ...input.data,
          is_verified: input.data.is_demo ? false : input.data.is_verified,
        },
        p_specialty: input.data.specialty_id,
      });
      if (error)
        throw new ApiError(
          error.code === "23505" ? "CONFLICT" : "INVALID_INPUT",
          400,
        );
      return json({ id: data });
    }
    if (input.action === "specialty.save") {
      const { id, ...values } = input.data;
      const { error } = id
        ? await db.from("clinic_specialties").update(values).eq("id", id)
        : await db.from("clinic_specialties").insert(values);
      if (error) throw new ApiError("CONFLICT", 409);
    }
    if (input.action === "specialty.delete") {
      const { error } = await db
        .from("clinic_specialties")
        .delete()
        .eq("id", input.id);
      if (error) throw new ApiError("CONFLICT", 409);
    }
    if (input.action === "knowledge.delete") {
      const { error } = await db
        .from("clinic_knowledge_documents")
        .delete()
        .eq("id", input.id);
      if (error) throw new ApiError("SERVICE_UNAVAILABLE", 503);
    }
    if (input.action === "knowledge.save") {
      await consumeLimit(`kb:${identity.user.id}`, 30);
      const provider = new GeminiProvider(),
        parts = chunkDocument(input.data.content),
        chunks: { content: string; embedding: number[] }[] = [];
      for (let offset = 0; offset < parts.length; offset += 4) {
        const batch = await Promise.all(
          parts.slice(offset, offset + 4).map(async (content) => ({
            content,
            embedding: await provider.embed(content, "RETRIEVAL_DOCUMENT"),
          })),
        );
        chunks.push(...batch);
      }
      const { data, error } = await db.rpc("salapp_save_knowledge", {
        p_document: input.data,
        p_chunks: chunks,
      });
      if (error) throw new ApiError("KNOWLEDGE_UNAVAILABLE", 503);
      return json({ id: data });
    }
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
