import { createClient } from "@supabase/supabase-js";
import { readFile, unlink } from "node:fs/promises";
export default async function teardown() {
  let fixture;
  try {
    fixture = JSON.parse(await readFile("work/e2e-fixtures.json", "utf8"));
  } catch {
    return;
  }
  const rows = (await readFile(".env", "utf8")).split(/\r?\n/);
  for (const row of rows) {
    const match = row.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const ids = Object.values(
    fixture.users as Record<string, { id: string }>,
  ).map((u) => u.id);
  if (fixture.guestSessionIds?.length)
    await admin
      .from("clinic_sal_sessions")
      .delete()
      .in("id", fixture.guestSessionIds);
  if (fixture.initialRequestIds?.length)
    await admin
      .from("clinic_sal_sessions")
      .delete()
      .in("initial_request_id", fixture.initialRequestIds);
  if (fixture.doctorId) {
    await admin
      .from("clinic_appointments")
      .delete()
      .eq("doctor_id", fixture.doctorId);
    await admin.from("clinic_doctors").delete().eq("id", fixture.doctorId);
  }
  if (fixture.extraDoctorIds?.length)
    await admin
      .from("clinic_doctors")
      .delete()
      .in("id", fixture.extraDoctorIds);
  if (fixture.extraSpecialtySlugs?.length)
    await admin
      .from("clinic_specialties")
      .delete()
      .in("slug", fixture.extraSpecialtySlugs);
  if (fixture.extraDocumentIds?.length)
    await admin
      .from("clinic_knowledge_documents")
      .delete()
      .in("id", fixture.extraDocumentIds);
  await admin.from("clinic_appointments").delete().in("patient_id", ids);
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error("Verification account cleanup failed");
  }
  await unlink("work/e2e-fixtures.json");
}
