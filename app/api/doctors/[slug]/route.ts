import { apiError, ApiError, json } from "@/lib/api";
import { getDoctorBySlug } from "@/lib/data/doctors";
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await context.params;
    if (!/^[a-z0-9-]{1,100}$/.test(slug)) throw new ApiError("INVALID_INPUT");
    const doctor = await getDoctorBySlug(slug);
    if (!doctor) throw new ApiError("DOCTOR_NOT_FOUND", 404);
    return json({ doctor });
  } catch (error) {
    return apiError(error);
  }
}
