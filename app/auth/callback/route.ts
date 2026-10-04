import { NextResponse } from "next/server";
import { userDb } from "@/lib/supabase/server";
import { claimGuestSessions } from "@/lib/sal/session";
import { safeNext, rolePath } from "@/lib/utils";
import { appOrigin } from "@/lib/api";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  const code = url.searchParams.get("code");
  const db = await userDb();
  if (code) {
    const { data, error } = await db.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      await claimGuestSessions(data.user.id);
      const { data: profile } = await db
        .from("clinic_profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      const target = url.searchParams.get("next");
      const next =
        target === "/auth/reset"
          ? target
          : target
            ? safeNext(target)
            : rolePath(profile?.role || "patient");
      return NextResponse.redirect(new URL(next, origin), {
        headers: { "Cache-Control": "no-store" },
      });
    }
  }
  return NextResponse.redirect(new URL("/auth?error=confirmation", origin));
}
