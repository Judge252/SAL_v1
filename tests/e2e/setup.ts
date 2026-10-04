import { createClient } from "@supabase/supabase-js";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
export default async function setup() {
  const env = (await readFile(".env", "utf8")).split(/\r?\n/);
  for (const row of env) {
    const match = row.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]])
      process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  const url = process.env.SUPABASE_URL!,
    key =
      process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    run = randomUUID().slice(0, 8);
  const fixtures: {
    run: string;
    users: Record<
      string,
      { id: string; email: string; password: string; name: string }
    >;
    doctorId?: string;
    guestSessionIds: string[];
  } = { run, users: {}, guestSessionIds: [] };
  await mkdir("work", { recursive: true });
  try {
    for (const role of ["patient", "other", "admin", "doctor"]) {
      const email = `sal-verify-${run}-${role}@example.com`,
        password = randomBytes(24).toString("base64url"),
        name = `SAL Verification ${role} ${run}`;
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error || !data.user)
        throw new Error(
          `Verification account creation failed: ${error?.code || "unknown"}`,
        );
      fixtures.users[role] = { id: data.user.id, email, password, name };
      if (role === "admin" || role === "doctor") {
        const { error: roleError } = await admin
          .from("clinic_profiles")
          .update({ role })
          .eq("id", data.user.id);
        if (roleError) throw new Error("Verification role assignment failed");
      }
    }
    const { data: specialty } = await admin
      .from("clinic_specialties")
      .select("id")
      .eq("slug", "general-practice")
      .single();
    const { data: doctor, error } = await admin
      .from("clinic_doctors")
      .insert({
        profile_id: fixtures.users.doctor.id,
        slug: `sal-verification-${run}`,
        name: `SAL Verification Doctor ${run}`,
        name_ar: "طبيب للتحقق من التطبيق",
        bio: "Fictional test record, automatically cleaned after verification.",
        city: "Cairo",
        languages: ["English", "Arabic"],
        is_demo: true,
        consultation_types: ["in_person"],
      })
      .select("id")
      .single();
    if (error || !doctor)
      throw new Error("Verification doctor creation failed");
    fixtures.doctorId = doctor.id;
    await admin.from("clinic_doctor_specialties").insert({
      doctor_id: doctor.id,
      specialty_id: specialty!.id,
      is_primary: true,
    });
    await writeFile("work/e2e-fixtures.json", JSON.stringify(fixtures));
  } catch (error) {
    await writeFile("work/e2e-fixtures.json", JSON.stringify(fixtures));
    throw error;
  }
}
