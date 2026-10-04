import { NextResponse } from "next/server";
import { z } from "zod";
import { userDb } from "@/lib/supabase/server";
import { claimGuestSessions } from "@/lib/sal/session";
import { safeNext } from "@/lib/utils";
import { appOrigin } from "@/lib/api";
export async function GET(request: Request) {
  const url = new URL(request.url),
    origin = appOrigin(request);
  const type = z
    .enum(["email", "signup", "recovery"])
    .safeParse(url.searchParams.get("type"));
  const hash = url.searchParams.get("token_hash");
  if (type.success && hash && hash.length < 200) {
    const db = await userDb();
    const { data, error } = await db.auth.verifyOtp({
      type: type.data,
      token_hash: hash,
    });
    if (!error && data.user) {
      await claimGuestSessions(data.user.id);
      return NextResponse.redirect(
        new URL(
          type.data === "recovery"
            ? "/auth/reset"
            : safeNext(url.searchParams.get("next")),
          origin,
        ),
      );
    }
  }
  return NextResponse.redirect(new URL("/auth?error=confirmation", origin));
}
