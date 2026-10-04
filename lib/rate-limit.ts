import "server-only";
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api";
export function networkHash(request: Request) {
  const ip =
    process.env.VERCEL || process.env.TRUST_PROXY === "true"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
      : "shared-unverified-network";
  return createHash("sha256").update(ip).digest("hex");
}
export async function consumeLimit(scope: string, limit: number) {
  const { data, error } = await adminDb().rpc("clinic_consume_limit", {
    p_scope: scope,
    p_limit: limit,
  });
  if (error) throw new ApiError("SERVICE_UNAVAILABLE", 503);
  if (!data) throw new ApiError("RATE_LIMITED", 429);
}
export function configuredLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 && value <= 10000
    ? value
    : fallback;
}
