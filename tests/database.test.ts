import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
test("PostgreSQL migrations enforce ownership, role protection and booking constraints", async (t) => {
  const db = new PGlite({ extensions: { vector, btree_gist } });
  try {
    await db.exec(
      `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema storage; grant usage on schema auth to anon,authenticated,service_role; create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key,bucket_id text); alter table storage.objects enable row level security;`,
    );
    const publicationMigration =
      "20261005041330_prepare_admin_doctor_publication.sql";
    for (const file of (await readdir("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort())
      if (file !== publicationMigration)
        await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    // A rerun must also repair grant drift without failing on the existing helper.
    await db.exec("grant select(profile_id) on public.clinic_doctors to anon");
    await db.exec(
      await readFile(
        "supabase/migrations/20261004234610_restrict_doctor_account_links.sql",
        "utf8",
      ),
    );
    await db.exec(await readFile("supabase/seed.sql", "utf8"));
    await t.test(
      "publication migration preserves existing rows and can be applied again",
      async () => {
        const snapshot = async () =>
          (
            await db.query(
              "select (select jsonb_agg(d order by id) from clinic_doctors d) as doctors,(select jsonb_agg(s order by id) from clinic_doctor_availability s) as slots",
            )
          ).rows;
        const before = await snapshot();
        const sql = await readFile(
          `supabase/migrations/${publicationMigration}`,
          "utf8",
        );
        await db.exec(sql);
        await db.exec(sql);
        assert.deepEqual(await snapshot(), before);
      },
    );
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
      "new doctors stay private until all publication requirements are met",
      async () => {
        const {
          rows: [draft],
        } = await db.query<{ id: string; is_active: boolean }>(
          "insert into clinic_doctors(slug,name,is_demo) values('integration-lifecycle-demo','Integration lifecycle doctor (Demo)',true) returning id,is_active",
        );
        assert.equal(draft.is_active, false);
        await db.exec(
          "set role anon; select set_config('request.jwt.claim.sub','',false)",
        );
        assert.equal(
          (
            await db.query("select id from clinic_doctors where id=$1", [
              draft.id,
            ])
          ).rows.length,
          0,
        );
        for (const sql of [
          "insert into clinic_doctors(slug,name) values('unauthorized','Unauthorized')",
          "update clinic_doctors set is_active=true",
          "delete from clinic_doctors",
          "select salapp_save_doctor('{}'::jsonb,null)",
        ])
          await assert.rejects(() => db.query(sql), /permission denied/);
        await db.exec("reset role");
        await assert.rejects(
          () =>
            db.query("update clinic_doctors set is_active=true where id=$1", [
              draft.id,
            ]),
          /clinic_doctor_publish_fields/,
        );
        await db.query(
          "update clinic_doctors set languages=array['English'] where id=$1",
          [draft.id],
        );
        await assert.rejects(
          () =>
            db.query("update clinic_doctors set is_active=true where id=$1", [
              draft.id,
            ]),
          /must have a specialty/,
        );
        assert.equal(
          (
            await db.query<{ is_active: boolean }>(
              "select is_active from clinic_doctors where id=$1",
              [draft.id],
            )
          ).rows[0].is_active,
          false,
        );
        await db.query(
          "insert into clinic_doctor_specialties(doctor_id,specialty_id,is_primary) select $1,id,true from clinic_specialties where slug='general-practice'",
          [draft.id],
        );
        await db.query("update clinic_doctors set is_active=true where id=$1", [
          draft.id,
        ]);
        await db.exec("set role anon");
        assert.equal(
          (
            await db.query("select id from clinic_doctors where id=$1", [
              draft.id,
            ])
          ).rows.length,
          1,
        );
        await db.exec("reset role");
        await assert.rejects(
          () =>
            db.query("update clinic_doctors set languages='{}' where id=$1", [
              draft.id,
            ]),
          /clinic_doctor_publish_fields/,
        );
      },
    );
    await t.test(
      "the existing save RPC remains atomic and cannot remove a published doctor's final specialty",
      async () => {
        await db.exec("set role service_role");
        const saved = await db.query<{ id: string }>(
          "select salapp_save_doctor(to_jsonb(d),s.specialty_id) as id from clinic_doctors d join clinic_doctor_specialties s on s.doctor_id=d.id where d.slug='integration-lifecycle-demo'",
        );
        assert.ok(saved.rows[0].id);
        await db.exec("reset role");
        await assert.rejects(
          () =>
            db.query(
              "delete from clinic_doctor_specialties where doctor_id=$1",
              [saved.rows[0].id],
            ),
          /must have a specialty/,
        );
        assert.equal(
          (
            await db.query(
              "select doctor_id from clinic_doctor_specialties where doctor_id=$1",
              [saved.rows[0].id],
            )
          ).rows.length,
          1,
        );
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false)`,
        );
        await assert.rejects(
          () => db.query("update clinic_doctors set is_active=true"),
          /permission denied/,
        );
        await assert.rejects(
          () => db.query("select salapp_save_doctor('{}'::jsonb,null)"),
          /permission denied/,
        );
        await db.exec("reset role");
      },
    );
    await t.test(
      "archiving preserves only the owning patient's history and blocks new discovery and booking",
      async () => {
        const {
          rows: [doctor],
        } = await db.query<{ id: string }>(
          "select id from clinic_doctors where slug='integration-lifecycle-demo'",
        );
        const { rows: slots } = await db.query<{ id: string }>(
          "insert into clinic_doctor_availability(doctor_id,start_at,end_at,consultation_type) select $1,now()+interval '200 days'+n*interval '30 minutes',now()+interval '200 days'+(n+1)*interval '30 minutes','in_person' from generate_series(0,1) n returning id",
          [doctor.id],
        );
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false)`,
        );
        const {
          rows: [appointment],
        } = await db.query<{ id: string }>(
          "select (clinic_book_appointment($1,'Fictional integration verification')).id",
          [slots[0].id],
        );
        await db.exec("reset role");
        await db.query(
          "update clinic_doctors set is_active=false where id=$1",
          [doctor.id],
        );
        for (const [role, user] of [
          ["anon", ""],
          ["authenticated", two],
        ]) {
          await db.exec(
            `set role ${role}; select set_config('request.jwt.claim.sub','${user}',false)`,
          );
          assert.equal(
            (
              await db.query("select id from clinic_doctors where id=$1", [
                doctor.id,
              ])
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.query(
                "select doctor_id from clinic_doctor_specialties where doctor_id=$1",
                [doctor.id],
              )
            ).rows.length,
            0,
          );
          assert.equal(
            (
              await db.query("select id from clinic_available_slots($1)", [
                doctor.id,
              ])
            ).rows.length,
            0,
          );
          await db.exec("reset role");
        }
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${one}',false)`,
        );
        const history = await db.query<{ name: string }>(
          "select d.name from clinic_appointments a join clinic_doctors d on d.id=a.doctor_id where a.id=$1",
          [appointment.id],
        );
        assert.equal(
          history.rows[0].name,
          "Integration lifecycle doctor (Demo)",
        );
        assert.equal(
          (
            await db.query(
              "select id from clinic_doctors where id=$1 and is_active",
              [doctor.id],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query(
              "select clinic_book_appointment($1,'New booking with archived doctor')",
              [slots[1].id],
            ),
          /INVALID_SLOT/,
        );
        await db.exec("reset role");
        assert.equal(
          (
            await db.query("select id from clinic_appointments where id=$1", [
              appointment.id,
            ])
          ).rows.length,
          1,
        );
        await db.query("delete from clinic_appointments where id=$1", [
          appointment.id,
        ]);
        await db.query("delete from clinic_doctors where id=$1", [doctor.id]);
      },
    );
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
    await t.test(
      "public doctor columns cannot expose linked account IDs",
      async () => {
        for (const role of ["anon", "authenticated"]) {
          await db.exec(
            `set role ${role}; select set_config('request.jwt.claim.sub','${role === "authenticated" ? one : ""}',false);`,
          );
          const doctors = await db.query(
            "select id,name,name_ar,city from clinic_doctors",
          );
          assert.ok(doctors.rows.length > 0);
          await assert.rejects(
            () => db.query("select profile_id from clinic_doctors"),
            /permission denied/,
          );
          await assert.rejects(
            () => db.query("select * from clinic_doctors"),
            /permission denied/,
          );
          const availability = await db.query(
            "select id from clinic_doctor_availability",
          );
          assert.ok(availability.rows.length > 0);
          await db.exec("reset role");
        }
      },
    );
    await t.test(
      "restricted columns preserve doctor ownership reads and updates",
      async () => {
        const doctorAccount = "10000000-0000-4000-8000-000000000003";
        await db.query("insert into auth.users(id) values($1)", [
          doctorAccount,
        ]);
        await db.query("update clinic_profiles set role='doctor' where id=$1", [
          doctorAccount,
        ]);
        const {
          rows: [own],
        } = await db.query<{ id: string }>(
          "update clinic_doctors set profile_id=$1,is_active=false where slug='demo-adam-youssef' returning id",
          [doctorAccount],
        );
        assert.ok(own, "The seeded doctor exists");
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${doctorAccount}',false);`,
        );
        const ownRows = await db.query(
          "select id,name from clinic_doctors where id=$1",
          [own.id],
        );
        assert.equal(ownRows.rows.length, 1);
        const updated = await db.query(
          "update clinic_doctors set bio='Updated fixture biography' where id=$1 returning id",
          [own.id],
        );
        assert.equal(updated.rows.length, 1);
        const newSlot = await db.query<{ id: string }>(
          "insert into clinic_doctor_availability(doctor_id,start_at,end_at,consultation_type) values($1,now()+interval '120 days',now()+interval '120 days 30 minutes','in_person') returning id",
          [own.id],
        );
        assert.equal(newSlot.rows.length, 1);
        const removed = await db.query(
          "update clinic_doctor_availability set is_active=false where id=$1 returning id",
          [newSlot.rows[0].id],
        );
        assert.equal(removed.rows.length, 1);
        const inactiveOwn = await db.query(
          "select id from clinic_doctor_availability where id=$1",
          [newSlot.rows[0].id],
        );
        assert.equal(inactiveOwn.rows.length, 1);
        await db.exec(
          `select set_config('request.jwt.claim.sub','${one}',false);`,
        );
        assert.equal(
          (
            await db.query("select id from clinic_doctors where id=$1", [
              own.id,
            ])
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "select id from clinic_doctor_availability where id=$1",
              [newSlot.rows[0].id],
            )
          ).rows.length,
          0,
        );
        assert.equal(
          (
            await db.query(
              "update clinic_doctors set bio='Unauthorized' where id=$1 returning id",
              [own.id],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () =>
            db.query(
              "insert into clinic_doctor_availability(doctor_id,start_at,end_at,consultation_type) values($1,now()+interval '121 days',now()+interval '121 days 30 minutes','in_person')",
              [own.id],
            ),
          /row-level security/,
        );
        await db.exec("reset role");
        await db.query("update clinic_doctors set is_active=true where id=$1", [
          own.id,
        ]);
        const appointment = await db.query<{ id: string }>(
          "insert into clinic_appointments(patient_id,doctor_id,availability_id,start_at,end_at,reason,consultation_type,status) select $1,doctor_id,id,start_at,end_at,'Ownership test','in_person','cancelled' from clinic_doctor_availability where id=$2 returning id",
          [one, newSlot.rows[0].id],
        );
        await db.exec(
          `set role authenticated; select set_config('request.jwt.claim.sub','${doctorAccount}',false);`,
        );
        assert.equal(
          (
            await db.query("select id from clinic_appointments where id=$1", [
              appointment.rows[0].id,
            ])
          ).rows.length,
          1,
        );
        await db.exec(
          `select set_config('request.jwt.claim.sub','${two}',false);`,
        );
        assert.equal(
          (
            await db.query("select id from clinic_appointments where id=$1", [
              appointment.rows[0].id,
            ])
          ).rows.length,
          0,
        );
        await db.exec(
          `select set_config('request.jwt.claim.sub','${one}',false);`,
        );
        assert.equal(
          (
            await db.query(
              "select a.id,d.name from clinic_appointments a join clinic_doctors d on d.id=a.doctor_id where a.id=$1",
              [appointment.rows[0].id],
            )
          ).rows.length,
          1,
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
