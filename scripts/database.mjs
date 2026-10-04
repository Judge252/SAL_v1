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
for (const file of files) {
  if (!seed) {
    const check = file.includes("initial_clinic")
      ? "select to_regclass('public.clinic_profiles') is not null as installed"
      : "select exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='salapp_save_doctor') as installed";
    const existing = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: check }),
      },
    );
    const result = existing.ok ? await existing.json() : [];
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
