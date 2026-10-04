import { apiError, json } from "@/lib/api";
import { getSpecialties } from "@/lib/data/doctors";
export async function GET() {
  try {
    return json({ specialties: await getSpecialties() });
  } catch (error) {
    return apiError(error);
  }
}
