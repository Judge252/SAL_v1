import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { getIdentity } from "@/lib/auth";
import { ApiError } from "@/lib/api";
export async function salOwner(create = true) {
  const identity = await getIdentity();
  const jar = await cookies();
  let token = jar.get("clinic-guest")?.value;
  if ((!token || !/^[a-f0-9]{64}$/.test(token)) && create) {
    token = randomBytes(32).toString("hex");
    jar.set("clinic-guest", token, {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production" &&
        (
          process.env.APP_URL ||
          process.env.NEXT_PUBLIC_APP_URL ||
          ""
        ).startsWith("https:"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  const guestHash = token
    ? createHash("sha256").update(token).digest("hex")
    : null;
  return {
    userId: identity?.user.id || null,
    guestHash,
    role: identity?.profile.role,
  };
}
export async function ownedSession(
  sessionId: string,
  owner: Awaited<ReturnType<typeof salOwner>>,
) {
  const { data, error } = await adminDb()
    .from("clinic_sal_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
  if (
    !data ||
    !(
      (owner.userId && data.user_id === owner.userId) ||
      (!data.user_id &&
        owner.guestHash &&
        data.guest_token_hash === owner.guestHash)
    )
  )
    throw new ApiError("SESSION_NOT_FOUND", 404);
  return data;
}
export async function claimGuestSessions(userId: string) {
  const owner = await salOwner(false);
  if (!owner.guestHash) return;
  await adminDb()
    .from("clinic_sal_sessions")
    .update({ user_id: userId, guest_token_hash: null })
    .eq("guest_token_hash", owner.guestHash)
    .is("user_id", null);
}
