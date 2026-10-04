import { apiError, ApiError, assertOrigin, json, parseBody } from "@/lib/api";
import { getIdentity } from "@/lib/auth";
import { adminDb } from "@/lib/supabase/admin";
import { doctorAction } from "@/lib/validation/management";
export async function POST(request: Request) {
  try {
    assertOrigin(request);
    const input = await parseBody(request, doctorAction),
      identity = await getIdentity();
    if (!identity) throw new ApiError("AUTH_REQUIRED", 401);
    if (identity.profile.role !== "doctor")
      throw new ApiError("FORBIDDEN", 403);
    const db = adminDb(),
      { data: doctor } = await db
        .from("clinic_doctors")
        .select("id")
        .eq("profile_id", identity.user.id)
        .maybeSingle();
    if (!doctor) throw new ApiError("FORBIDDEN", 403);
    if (input.action === "availability.add") {
      const { error } = await identity.db
        .from("clinic_doctor_availability")
        .insert({ ...input.data, doctor_id: doctor.id });
      if (error)
        throw new ApiError(
          error.code === "23P01" ? "SLOT_UNAVAILABLE" : "INVALID_INPUT",
          400,
        );
    }
    if (input.action === "availability.remove") {
      const { data, error } = await identity.db
        .from("clinic_doctor_availability")
        .update({ is_active: false })
        .eq("doctor_id", doctor.id)
        .eq("id", input.id)
        .select("id")
        .maybeSingle();
      if (error || !data) throw new ApiError("INVALID_INPUT");
    }
    if (input.action === "profile.update") {
      const { error } = await identity.db
        .from("clinic_doctors")
        .update(input.data)
        .eq("id", doctor.id)
        .eq("profile_id", identity.user.id);
      if (error) throw new ApiError("PROFILE_UNAVAILABLE", 503);
    }
    if (input.action === "appointment.status") {
      const query = db
        .from("clinic_appointments")
        .update({ status: input.status })
        .eq("id", input.id)
        .eq("doctor_id", doctor.id)
        .in(
          "status",
          input.status === "completed" ? ["confirmed"] : ["pending"],
        );
      if (input.status === "completed")
        query.lte("end_at", new Date().toISOString());
      const { data, error } = await query.select("id").maybeSingle();
      if (error || !data) throw new ApiError("INVALID_INPUT");
    }
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
