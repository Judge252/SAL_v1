import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("PostgreSQL migrations enforce ownership, role protection and booking constraints", async (t) => {
  const db = new PGlite({ extensions: { vector, btree_gist } });
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage; grant usage on schema auth to anon,authenticated,service_role; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key,bucket_id text); alter table storage.objects enable row level security;`,
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261004034459_initial_clinic.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261004103825_management_functions.sql",
        "utf8",
      ),
    );
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    const one = "10000000-0000-4000-8000-000000000001",
      two = "10000000-0000-4000-8000-000000000002";
    await db.query(
      `insert into auth.users(id,raw_user_meta_data) values($1,'{"name":"Patient One","role":"admin"}'),($2,'{"name":"Patient Two"}')`,
      [one, two],
    );
    await t.test("signup metadata cannot grant an admin role", async () => {
      const row = await db.query<{ role: string }>(
        "select role from clinic_profiles where id=$1",
        [one],
      );
      assert.equal(row.rows[0].role, "patient");
    });
    await t.test("all application tables enable RLS", async () => {
      const rows = await db.query<{ relrowsecurity: boolean }>(
        "select relrowsecurity from pg_class where relname like 'clinic_%' and relkind='r'",
      );
      assert.equal(rows.rows.length, 12);
      assert.ok(rows.rows.every((r) => r.relrowsecurity));
    });
    await t.test(
      "patients cannot read another profile or promote themselves",
      async () => {
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false);`,
        );
        const profiles = await db.query<{ id: string }>(
          "select id from clinic_profiles",
        );
        assert.deepEqual(
          profiles.rows.map((p) => p.id),
          [one],
        );
        await assert.rejects(
          () =>
            db.query("update clinic_profiles set role='admin' where id=$1", [
              one,
            ]),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    const slots = await db.query<{ id: string; doctor_id: string }>(
      "select id,doctor_id from clinic_doctor_availability order by start_at limit 2",
    );
    let booked = "";
    await t.test(
      "one atomic booking succeeds and a second conflicts",
      async () => {
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false);`,
        );
        const result = await db.query<{ id: string }>(
          "select (clinic_book_appointment($1,$2)).id",
          [slots.rows[0].id, "Development appointment"],
        );
        booked = result.rows[0].id;
        await assert.rejects(
          () =>
            db.query("select clinic_book_appointment($1,$2)", [
              slots.rows[0].id,
              "Duplicate appointment",
            ]),
          /SLOT_UNAVAILABLE/,
        );
        await assert.rejects(
          () =>
            db.query("select clinic_book_appointment($1,$2)", [
              "ffffffff-ffff-4fff-8fff-ffffffffffff",
              "Invalid appointment",
            ]),
          /INVALID_SLOT/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "a patient cannot create appointments directly or cancel another patient’s",
      async () => {
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${two}',false);`,
        );
        const rows = await db.query("select id from clinic_appointments");
        assert.equal(rows.rows.length, 0);
        await assert.rejects(
          () => db.query("select clinic_cancel_appointment($1)", [booked]),
          /CANNOT_CANCEL/,
        );
        await assert.rejects(
          () =>
            db.query("insert into clinic_appointments(patient_id) values($1)", [
              two,
            ]),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "cancellation releases the slot for another patient",
      async () => {
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false);`,
        );
        await db.query("select clinic_cancel_appointment($1)", [booked]);
        await db.exec(
          `select set_config('request.jwt.claim.sub','${two}',false);`,
        );
        const result = await db.query<{ id: string }>(
          "select (clinic_book_appointment($1,$2)).id",
          [slots.rows[0].id, "New development appointment"],
        );
        assert.ok(result.rows[0].id);
        await db.exec("reset role");
      },
    );
    await t.test(
      "a booked slot disappears from public availability",
      async () => {
        await db.exec("set role anon");
        const rows = await db.query<{ id: string }>(
          "select id from clinic_available_slots($1)",
          [slots.rows[0].doctor_id],
        );
        assert.ok(!rows.rows.some((s) => s.id === slots.rows[0].id));
        await assert.rejects(
          () => db.query("select * from clinic_knowledge_documents"),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "patients save doctors idempotently without update privileges or access to another patient's favorites",
      async () => {
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false);`,
        );
        for (let i = 0; i < 2; i++)
          await db.query(
            "insert into clinic_favorites(user_id,doctor_id) values($1,$2) on conflict(user_id,doctor_id) do nothing",
            [one, slots.rows[0].doctor_id],
          );
        const own = await db.query<{ count: number }>(
          "select count(*)::integer as count from clinic_favorites",
        );
        assert.equal(own.rows[0].count, 1);
        await db.exec(
          `select set_config('request.jwt.claim.sub','${two}',false);`,
        );
        const other = await db.query<{ count: number }>(
          "select count(*)::integer as count from clinic_favorites",
        );
        assert.equal(other.rows[0].count, 0);
        await assert.rejects(
          () =>
            db.query(
              "insert into clinic_favorites(user_id,doctor_id) values($1,$2)",
              [one, slots.rows[0].doctor_id],
            ),
          /row-level security/,
        );
        await db.exec("reset role");
      },
    );
    await t.test("daily cost limits are enforced atomically", async () => {
      await db.exec("set role service_role");
      const first = await db.query<{ allowed: boolean }>(
          "select clinic_consume_limit('test-scope',1) as allowed",
        ),
        second = await db.query<{ allowed: boolean }>(
          "select clinic_consume_limit('test-scope',1) as allowed",
        );
      assert.equal(first.rows[0].allowed, true);
      assert.equal(second.rows[0].allowed, false);
      await db.exec("reset role");
    });
  } finally {
    await db.close();
  }
});
