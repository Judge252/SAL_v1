import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { profileInput } from "@/lib/validation";
import { getIdentity } from "@/lib/auth";
import { cookies } from "next/headers";
export async function PATCH(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, profileInput);
    const identity = await getIdentity();
    if (!identity) throw new ApiError("AUTH_REQUIRED", 401);
    const { error } = await identity.db
      .from("clinic_profiles")
      .update(input)
      .eq("id", identity.user.id);
    if (error) throw new ApiError("PROFILE_UNAVAILABLE", 503);
    (await cookies()).set("clinic-locale", input.locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 31536000,
    });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
