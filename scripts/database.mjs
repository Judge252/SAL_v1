import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ref = new URL(process.env.SUPABASE_URL).hostname.split(".")[0];
const seed = process.argv.includes("--seed");
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "SUPABASE_ACCESS_TOKEN is required to deploy SQL. Alternatively apply supabase/migrations and seed.sql in the Supabase SQL editor.",
  );
  process.exit(1);
}
const files = seed
  ? ["supabase/seed.sql"]
  : (await readdir(path.join(root, "supabase/migrations")))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `supabase/migrations/${f}`);
// These legacy migrations have explicit probes; new migrations must use tracked
// Supabase migration tooling or have their own reviewed installation check.
const installationChecks = {
  "20261004034459_initial_clinic.sql":
    "select to_regclass('public.clinic_profiles') is not null as installed",
  "20261004103825_management_functions.sql":
    "select to_regprocedure('public.salapp_save_doctor(jsonb,uuid)') is not null and to_regprocedure('public.salapp_save_knowledge(jsonb,jsonb)') is not null as installed",
  "20261004234610_restrict_doctor_account_links.sql":
    "select to_regprocedure('clinic_private.owns_doctor(uuid)') is not null and not has_column_privilege('anon','public.clinic_doctors','profile_id','SELECT') and not has_column_privilege('authenticated','public.clinic_doctors','profile_id','SELECT') and has_column_privilege('anon','public.clinic_doctors','name','SELECT') and has_column_privilege('authenticated','public.clinic_doctors','name','SELECT') as installed",
};
if (!seed)
  for (const file of files)
    if (!Object.hasOwn(installationChecks, path.basename(file)))
      throw new Error(
        `Unrecognized migration: ${file}. No SQL was applied. Use Supabase migration tooling or add a reviewed installation check.`,
      );
for (const file of files) {
  if (!seed) {
    const check = installationChecks[path.basename(file)];
    const existing = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: check }),
        signal: AbortSignal.timeout(60000),
      },
    );
    if (!existing.ok)
      throw new Error(
        `Could not inspect ${file} (HTTP ${existing.status}). Its SQL was not applied.`,
      );
    const result = await existing.json();
    if (typeof result[0]?.installed !== "boolean")
      throw new Error(
        `Invalid installation check for ${file}. Its SQL was not applied.`,
      );
    if (result[0]?.installed) {
      console.log(`Already installed: ${file}`);
      continue;
    }
  }
  const query = await readFile(path.join(root, file), "utf8");
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(60000),
    },
  );
  if (!response.ok) {
    const diagnostic = await response.json().catch(() => ({}));
    console.error(
      `Database setup failed (HTTP ${response.status}): ${String(diagnostic.message || diagnostic.error || "Check database permissions").slice(0, 1200)}`,
    );
    process.exit(1);
  }
  console.log(`Applied ${file}`);
}
