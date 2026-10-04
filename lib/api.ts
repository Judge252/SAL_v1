import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSameOrigin, requestOrigin } from "@/lib/request-origin";
export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError("INVALID_INPUT", 415);
  const raw = await request.text();
  if (raw.length > 48000) throw new ApiError("INPUT_TOO_LARGE", 413);
  try {
    return schema.parse(JSON.parse(raw));
  } catch {
    throw new ApiError("INVALID_INPUT", 400);
  }
}
export function assertOrigin(request: Request) {
  if (
    !isSameOrigin(
      request,
      process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
    )
  )
    throw new ApiError("INVALID_ORIGIN", 403);
}
export function appOrigin(request: Request) {
  return requestOrigin(
    request,
    process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL,
  );
}
export function apiError(error: unknown) {
  const known = error instanceof ApiError;
  if (!known)
    console.error("clinic_request_failed", {
      type: error instanceof Error ? error.name : "unknown",
    });
  return NextResponse.json(
    { error: known ? error.code : "SERVICE_UNAVAILABLE" },
    {
      status: known ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
