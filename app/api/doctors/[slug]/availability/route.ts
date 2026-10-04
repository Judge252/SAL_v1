import { apiError, ApiError, json } from "@/lib/api";
import { getAvailableSlots } from "@/lib/data/doctors";
import { uuid } from "@/lib/validation";
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    if (!uuid.safeParse(slug).success) throw new ApiError("INVALID_INPUT");
    return json({ slots: await getAvailableSlots(slug) });
  } catch (error) {
    return apiError(error);
  }
}
