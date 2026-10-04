import { z } from "zod";
import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { uuid } from "@/lib/validation";
import { getIdentity } from "@/lib/auth";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { doctorId, save } = await parseBody(
      request,
      z.object({ doctorId: uuid, save: z.boolean() }),
    );
    const identity = await getIdentity();
    if (!identity) throw new ApiError("AUTH_REQUIRED", 401);
    const result = save
      ? await identity.db
          .from("clinic_favorites")
          .upsert(
            { user_id: identity.user.id, doctor_id: doctorId },
            { onConflict: "user_id,doctor_id", ignoreDuplicates: true },
          )
      : await identity.db
          .from("clinic_favorites")
          .delete()
          .eq("user_id", identity.user.id)
          .eq("doctor_id", doctorId);
    if (result.error) throw new ApiError("FAVORITE_UNAVAILABLE", 503);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
