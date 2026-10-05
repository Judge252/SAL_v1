import { directoryFilters } from "@/lib/validation";
import { apiError, ApiError, json } from "@/lib/api";
import { getDoctors } from "@/lib/data/doctors";
export async function GET(request: Request) {
  try {
    const parsed = directoryFilters.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) throw new ApiError("INVALID_INPUT");
    return json({ doctors: await getDoctors(parsed.data) });
  } catch (error) {
    return apiError(error);
  }
}
