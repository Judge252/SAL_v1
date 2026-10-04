import { z } from "zod";
import { apiError, ApiError, json } from "@/lib/api";
import { getDoctors } from "@/lib/data/doctors";
export async function GET(request: Request) {
  try {
    const parsed = z
      .object({
        q: z.string().max(100).optional(),
        specialty: z.string().max(80).optional(),
        city: z.string().max(100).optional(),
        language: z.string().max(30).optional(),
        type: z.enum(["in_person", "video"]).optional(),
      })
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiError("INVALID_INPUT");
    return json({ doctors: await getDoctors(parsed.data) });
  } catch (error) {
    return apiError(error);
  }
}
