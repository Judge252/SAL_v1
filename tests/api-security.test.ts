import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { randomBytes, createHash } from "node:crypto";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { NextResponse } from "next/server";
import { z } from "zod";
import * as requestOrigin from "../lib/request-origin";

// Exercise the server modules with isolated framework boundaries and environment.
function loadServerModule<T>(
  path: string,
  dependencies: Record<string, unknown>,
  env: Record<string, string | undefined> = {},
): T {
  const loaded = { exports: {} };
  const { outputText } = transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ModuleKind.CommonJS,
      target: ScriptTarget.ES2022,
    },
  });
  runInNewContext(outputText, {
    module: loaded,
    exports: loaded.exports,
    require(name: string) {
      if (name === "server-only") return {};
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
    process: { env },
    TextDecoder,
    Error,
    console,
  });
  return loaded.exports as T;
}

const { parseBody, ApiError } = loadServerModule<typeof import("../lib/api")>(
  "lib/api.ts",
  {
    "next/server": { NextResponse },
    zod: { z },
    "@/lib/request-origin": requestOrigin,
  },
);
const input = z.object({ message: z.string() });
function streamedRequest(stream: ReadableStream<Uint8Array>, length?: string) {
  return new Request("http://127.0.0.1:3000/api/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(length ? { "Content-Length": length } : {}),
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
}
function oversized(error: unknown) {
  return error instanceof ApiError && error.status === 413;
}

test("oversized declared bodies are rejected without reading the stream", async () => {
  let reads = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        reads++;
      },
    },
    { highWaterMark: 0 },
  );
  await assert.rejects(
    () => parseBody(streamedRequest(stream, "48001"), input),
    oversized,
  );
  assert.equal(reads, 0);
  await stream.cancel();
});

test("undeclared and misleading lengths cannot bypass the streamed byte limit", async () => {
  for (const length of [undefined, "1"]) {
    let reads = 0;
    let canceled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(24001));
        },
        cancel() {
          canceled = true;
        },
      },
      { highWaterMark: 0 },
    );
    await assert.rejects(
      () => parseBody(streamedRequest(stream, length), input),
      oversized,
    );
    assert.equal(reads, 2);
    assert.equal(canceled, true);
    assert.equal(stream.locked, false);
  }
});

test("normal and split Arabic UTF-8 JSON are decoded without corruption", async () => {
  const message = "مرحبا، أريد التحدث مع SAL";
  const bytes = new TextEncoder().encode(JSON.stringify({ message }));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  assert.equal(
    (await parseBody(streamedRequest(stream), input)).message,
    message,
  );
  const request = new Request("http://127.0.0.1:3000/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "normal" }),
  });
  assert.equal((await parseBody(request, input)).message, "normal");
});

test("the body limit counts UTF-8 bytes and permits exactly 48000 bytes", async () => {
  for (const [message, succeeds] of [
    ["x".repeat(47986), true],
    ["أ".repeat(24000), false],
  ] as const) {
    const request = new Request("http://127.0.0.1:3000/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (succeeds)
      assert.equal((await parseBody(request, input)).message, message);
    else await assert.rejects(() => parseBody(request, input), oversized);
  }
});

test("invalid JSON, schemas and content types keep their existing error responses", async () => {
  for (const [body, contentType, status] of [
    ["{", "application/json", 400],
    ['{"message":42}', "application/json", 400],
    ['{"message":"ok"}', "text/plain", 415],
  ] as const) {
    const request = new Request("http://127.0.0.1:3000/api/auth", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    });
    await assert.rejects(
      () => parseBody(request, input),
      (error: unknown) => error instanceof ApiError && error.status === status,
    );
  }
});

test("auth, guest and proxy cookies honor the HTTPS origin fallback and local HTTP", async () => {
  for (const origin of ["https://clinic.example", "http://127.0.0.1:3000"]) {
    for (const originVariable of ["APP_URL", "NEXT_PUBLIC_APP_URL"]) {
      const env = {
        NODE_ENV: "production",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "fixture",
        [originVariable]: origin,
      };
      const written: { secure?: boolean }[] = [];
      const jar = {
        getAll: () => [],
        get: () => undefined,
        set: (_name: string, _value: string, options: { secure?: boolean }) =>
          written.push(options),
      };
      type CookieOptions = {
        setAll: (
          cookies: { name: string; value: string; options: object }[],
        ) => void;
      };
      const sdk = {
        createServerClient(
          _url: string,
          _key: string,
          { cookies }: { cookies: CookieOptions },
        ) {
          cookies.setAll([
            { name: "auth-test", value: "fixture", options: {} },
          ]);
          return { auth: { getClaims: async () => ({ data: null }) } };
        },
      };
      const { userDb } = loadServerModule<
        typeof import("../lib/supabase/server")
      >(
        "lib/supabase/server.ts",
        { "@supabase/ssr": sdk, "next/headers": { cookies: async () => jar } },
        env,
      );
      await userDb();
      const { salOwner } = loadServerModule<
        typeof import("../lib/sal/session")
      >(
        "lib/sal/session.ts",
        {
          "next/headers": { cookies: async () => jar },
          "node:crypto": { randomBytes, createHash },
          "@/lib/supabase/admin": {},
          "@/lib/auth": { getIdentity: async () => null },
          "@/lib/api": { ApiError },
        },
        env,
      );
      await salOwner();
      const { proxy } = loadServerModule<typeof import("../proxy")>(
        "proxy.ts",
        {
          "@supabase/ssr": sdk,
          "next/server": { NextResponse },
        },
        env,
      );
      const { NextRequest } = await import("next/server");
      const response = await proxy(new NextRequest("http://127.0.0.1:3000/"));
      written.push(response.cookies.get("auth-test")!);
      assert.equal(written.length, 3);
      assert.ok(
        written.every(
          (cookie) => Boolean(cookie.secure) === origin.startsWith("https:"),
        ),
      );
    }
  }
});
