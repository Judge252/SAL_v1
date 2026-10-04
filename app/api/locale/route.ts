import { cookies } from "next/headers";
import { z } from "zod";
import { apiError, assertOrigin, json, parseBody } from "@/lib/api";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const { locale } = await parseBody(
      request,
      z.object({ locale: z.enum(["en", "ar"]) }),
    );
    (await cookies()).set("clinic-locale", locale, {
      path: "/",
      sameSite: "lax",
      maxAge: 31536000,
    });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
