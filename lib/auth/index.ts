import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { userDb } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types";
export const getIdentity = cache(async () => {
  try {
    const db = await userDb();
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user) return null;
    const { data: profile } = await db
      .from("clinic_profiles")
      .select("id,name,role,phone,locale,avatar_url")
      .eq("id", user.id)
      .single();
    return profile ? { user, profile: profile as Profile, db } : null;
  } catch {
    return null;
  }
});
export async function requireIdentity(path: string, roles?: Role[]) {
  const identity = await getIdentity();
  if (!identity) redirect(`/auth?next=${encodeURIComponent(path)}`);
  if (roles && !roles.includes(identity.profile.role)) redirect("/forbidden");
  return identity;
}
