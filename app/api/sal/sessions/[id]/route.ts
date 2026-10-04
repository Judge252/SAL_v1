import { apiError, ApiError, json } from "@/lib/api";
import { uuid } from "@/lib/validation";
import { ownedSession, salOwner } from "@/lib/sal/session";
import { adminDb } from "@/lib/supabase/admin";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    if (!uuid.safeParse(id).success) throw new ApiError("INVALID_INPUT");
    const session = await ownedSession(id, await salOwner(false));
    const { data, error } = await adminDb()
      .from("clinic_sal_messages")
      .select("*")
      .eq("session_id", id)
      .order("created_at");
    if (error) throw new ApiError("CONVERSATION_UNAVAILABLE", 503);
    return json({
      session: { id: session.id, title: session.title, locale: session.locale },
      messages: data,
    });
  } catch (error) {
    return apiError(error);
  }
}
