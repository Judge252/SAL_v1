import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const known = readdirSync("supabase/migrations")
  .filter((file) => file.endsWith(".sql"))
  .sort();
const source = readFileSync("scripts/database.mjs", "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace(
    "import.meta.url",
    JSON.stringify(new URL("../scripts/database.mjs", import.meta.url).href),
  );

async function runInstaller(
  files: string[],
  inspect: (index: number) => { installed?: unknown; status?: number },
) {
  const queries: string[] = [];
  const applied: string[] = [];
  let probe = 0;
  const run = runInNewContext(`(async () => { ${source} })()`, {
    path,
    fileURLToPath,
    URL,
    AbortSignal,
    Error,
    process: {
      env: {
        SUPABASE_URL: "https://fixture.supabase.co",
        SUPABASE_ACCESS_TOKEN: "fixture-only",
      },
      argv: ["node", "database.mjs"],
      exit: (code: number) => {
        throw new Error(`Exit ${code}`);
      },
    },
    console: { log() {}, error() {} },
    readdir: async () => files,
    readFile: async (file: string) => {
      applied.push(path.basename(file));
      return `-- fixture migration ${path.basename(file)}`;
    },
    fetch: async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body) as { query: string };
      queries.push(query);
      if (query.startsWith("-- fixture migration")) return new Response("[]");
      const result = inspect(probe++);
      return new Response(JSON.stringify([{ installed: result.installed }]), {
        status: result.status || 200,
      });
    },
  }) as Promise<void>;
  return { run, queries, applied };
}

test("unrecognized migrations stop before any SQL is sent", async () => {
  const result = await runInstaller(
    [...known, "future_security_change.sql"],
    () => ({ installed: true }),
  );
  await assert.rejects(result.run, /Unrecognized migration/);
  assert.equal(result.queries.length, 0);
  assert.equal(result.applied.length, 0);
});

test("each known migration has its own installation check and installed SQL is skipped", async () => {
  const result = await runInstaller(known, () => ({ installed: true }));
  await result.run;
  assert.equal(result.queries.length, known.length);
  assert.equal(new Set(result.queries).size, known.length);
  assert.equal(result.applied.length, 0);
});

test("a pending known migration is applied even when earlier migrations are installed", async () => {
  const result = await runInstaller(known, (index) => ({
    installed: index !== known.length - 1,
  }));
  await result.run;
  assert.deepEqual(result.applied, [known.at(-1)]);
  assert.equal(result.queries.length, known.length + 1);
});

test("failed and malformed installation checks stop without applying SQL", async () => {
  for (const inspection of [{ status: 503 }, { installed: "false" }, {}]) {
    const result = await runInstaller(known, () => inspection);
    await assert.rejects(
      result.run,
      /Could not inspect|Invalid installation check/,
    );
    assert.equal(result.applied.length, 0);
  }
});
