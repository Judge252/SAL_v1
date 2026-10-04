import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { bookingInput } from "@/lib/validation";
import { getIdentity } from "@/lib/auth";
import { consumeLimit } from "@/lib/rate-limit";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, bookingInput);
    const identity = await getIdentity();
    if (!identity) throw new ApiError("AUTH_REQUIRED", 401);
    await consumeLimit(`booking:${identity.user.id}`, 30);
    const { data, error } = await identity.db.rpc("clinic_book_appointment", {
      p_slot: input.slotId,
      p_reason: input.reason,
    });
    if (error) {
      if (/SLOT_UNAVAILABLE|exclusion/i.test(error.message))
        throw new ApiError("SLOT_UNAVAILABLE", 409);
      if (/INVALID_SLOT/.test(error.message))
        throw new ApiError("INVALID_SLOT", 400);
      throw new ApiError("BOOKING_UNAVAILABLE", 503);
    }
    return json({ appointment: data }, 201);
  } catch (error) {
    return apiError(error);
  }
}
