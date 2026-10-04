import { createHash } from "node:crypto";
import {
  apiError,
  ApiError,
  appOrigin,
  assertOrigin,
  json,
  parseBody,
} from "@/lib/api";
import { authInput } from "@/lib/validation";
import { userDb } from "@/lib/supabase/server";
import { claimGuestSessions } from "@/lib/sal/session";
import { consumeLimit, networkHash } from "@/lib/rate-limit";
import { safeNext, rolePath } from "@/lib/utils";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, authInput);
    const db = await userDb();
    const origin = appOrigin(request);
    if (input.mode === "logout") {
      await db.auth.signOut();
      return json({ next: "/" });
    }
    await consumeLimit(`auth-network:${networkHash(request)}`, 200);
    if (input.email)
      await consumeLimit(
        `auth-email:${createHash("sha256").update(input.email.toLowerCase()).digest("hex")}`,
        30,
      );
    const next = safeNext(input.next);
    if (input.mode === "google") {
      const { data, error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
          skipBrowserRedirect: true,
        },
      });
      if (error || !data.url) throw new ApiError("OAUTH_UNAVAILABLE", 503);
      return json({ next: data.url });
    }
    if (input.mode === "forgot") {
      if (!input.email) throw new ApiError("INVALID_INPUT");
      const { error } = await db.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${origin}/auth/callback?next=%2Fauth%2Freset`,
      });
      if (error) throw new ApiError("RECOVERY_UNAVAILABLE", 503);
      return json({ message: "RESET_EMAIL_SENT" });
    }
    if (input.mode === "reset") {
      const {
        data: { user },
      } = await db.auth.getUser();
      if (!user || !input.password) throw new ApiError("AUTH_REQUIRED", 401);
      const { error } = await db.auth.updateUser({ password: input.password });
      if (error) throw new ApiError("AUTH_FAILED");
      return json({ next: "/patient" });
    }
    if (
      !input.email ||
      !input.password ||
      (input.mode === "signup" && !input.name)
    )
      throw new ApiError("INVALID_INPUT");
    const { data, error } =
      input.mode === "signup"
        ? await db.auth.signUp({
            email: input.email,
            password: input.password,
            options: {
              data: { name: input.name },
              emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
            },
          })
        : await db.auth.signInWithPassword({
            email: input.email,
            password: input.password,
          });
    if (error)
      throw new ApiError(
        input.mode === "signup" ? "SIGNUP_FAILED" : "AUTH_FAILED",
        400,
      );
    if (!data.session) return json({ message: "CONFIRM_EMAIL" });
    await claimGuestSessions(data.user!.id);
    const { data: profile } = await db
      .from("clinic_profiles")
      .select("role")
      .eq("id", data.user!.id)
      .single();
    return json({
      next: input.next ? next : rolePath(profile?.role || "patient"),
    });
  } catch (error) {
    return apiError(error);
  }
}
