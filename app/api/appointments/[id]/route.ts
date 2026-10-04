import { z } from "zod";
import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { uuid } from "@/lib/validation";
import { getIdentity } from "@/lib/auth";
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertOrigin(request);
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new ApiError("INVALID_INPUT");
    await parseBody(request, z.object({ action: z.literal("cancel") }));
    const identity = await getIdentity();
    if (!identity) throw new ApiError("AUTH_REQUIRED", 401);
    const { error } = await identity.db.rpc("clinic_cancel_appointment", {
      p_id: id,
    });
    if (error) throw new ApiError("CANNOT_CANCEL", 409);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
