# The Clinic Admin integration contract

This repository remains the existing patient-facing Next.js application. The future **The Clinic Admin** application belongs in a separate repository/deployment and connects to the **same existing Supabase project**, `vlqbaqfvtwndtdfeksis`. Provision its environment securely; this document contains no credentials. No admin screens, navigation, or new public API contracts were added here.

## Current sources of truth

| Purpose               | Existing source                       | Contract                                                                 |
| --------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Doctor                | `public.clinic_doctors`               | Stable UUID `id`, unique `slug`; `is_active` controls publication.       |
| Specialties           | `public.clinic_specialties`           | UUID, unique slug, `name_en`, `name_ar`, bilingual descriptions.         |
| Doctor specialties    | `public.clinic_doctor_specialties`    | Composite key `(doctor_id,specialty_id)`; at most one `is_primary=true`. |
| Actual bookable times | `public.clinic_doctor_availability`   | Dated `start_at`/`end_at` timestamps, consultation type and `is_active`. |
| Appointment history   | `public.clinic_appointments`          | References doctor and availability UUIDs; archive rather than delete.    |
| Accounts/roles        | Auth + `public.clinic_profiles`       | Existing `patient`, `doctor`, `admin` roles.                             |
| Public doctor photos  | Storage bucket `clinic-doctor-photos` | Public downloads, 5 MiB limit, JPEG/PNG/WebP.                            |

Use **`clinic_*` tables**, not similarly named legacy tables in this Supabase project. Do not rerun seeds or the initial schema against production. Doctor cards, profiles, homepage previews, directory/search, booking and SAL already use these tables. No doctor records are bundled in frontend constants; `supabase/seed.sql` contains explicitly fictional development fixtures only.

## Public fields and publication

The current doctor fields are `id`, `slug`, `name` (English/fallback), `name_ar`, `bio` (English/fallback), `bio_ar`, `photo_url`, `city`, `address`, `languages`, `years_experience`, `price`, `currency`, `is_verified`, `is_active`, `is_demo`, `consultation_types`, `created_at`, and `updated_at`. There is no need to add duplicate `name_en`/`bio_en` columns or a locations table for the current single-location UI. Keep all specialty links; the public normalizer sorts the primary specialty first.

`profile_id` is a **private account association**, excluded from public database projections and public SELECT grants. For compatibility the public `Doctor` object still has `profile_id: null`; SAL never receives an account ID. Internal contracts, commissions, documents, contact information and admin notes do not belong in public projections. Store future internal fields separately where practical, with admin-only access; never change public queries to `select('*')`.

Reuse the existing flag:

| Workflow label       | Value             | Result                                                                                                                  |
| -------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Draft                | `is_active=false` | Hidden from public discovery, profiles, booking and new SAL recommendations. This is the database default for new rows. |
| Published            | `is_active=true`  | Public immediately on the next fresh request.                                                                           |
| Archived/unpublished | `is_active=false` | Hidden from new discovery; existing doctor and appointment records remain.                                              |

There is no separate persistent draft/archive label or archive timestamp. The initial MVP uses one flag; add workflow audit metadata later only if needed. An admin may deliberately set `true` when publishing; omission now creates a private row. Existing published doctors were not changed by the migration.

The current `/admin` doctor table supports confirmed removal through the admin-only `doctor.delete` action. An unbooked doctor can be deleted together with its specialty links and unbooked availability; its Auth account is retained. Appointment foreign keys prevent deletion of a doctor with any appointment history, including cancelled/completed appointments. The form explains that such a doctor should be deactivated instead, preserving the existing appointments. No appointment cascade is introduced.

Minimum publish requirements enforced by the database: trimmed `name` length 2–100, slug length 3–80 with the existing lowercase alphanumeric/hyphen rule, at least one language, at least one supported consultation type, and at least one existing specialty link. The database checks specialties at transaction commit, including removal/reassignment of links. The current atomic doctor-save RPC remains compatible.

Use the existing `lib/validation/management.ts` limits for complete forms: languages `English`/`Arabic`, consultation types `in_person`/`video`, nullable nonnegative price up to 100000, currency `EGP`/`USD`/`EUR`/`GBP`, and nullable experience 0–80. Validate on the admin server as well as in the browser. Bio, translation, photo, price and location are optional in the present schema/UI; review them before publishing, but missing optional data does not introduce new UI requirements. No available slots is a supported empty state. Never mark fictional `is_demo=true` records verified.

## How the future The Clinic Admin app should create/update/publish doctors

1. Authenticate the admin on the **admin app's own domain** using the existing Supabase Auth project. Use separate accounts for each administrator.
2. On **every admin server mutation**, verify the user with Supabase Auth and read their `clinic_profiles.role` from the database. Require `admin` **before** using a privileged client. Do not trust editable user metadata, a role supplied by the browser, or an unsigned session value. Protect cookie-authenticated mutations with same-origin/CSRF checks.
3. Keep `SUPABASE_SECRET_KEY`/legacy service-role key on the admin server only. A browser may use the publishable key for Auth; it must never receive a privileged key. Sign-up creates `patient` accounts. Provision admin roles through a trusted operator; profile edits cannot change roles. The public site's `/api/admin` retains its existing same-origin checks; the new app should implement its own server routes, not broaden CORS or call that route across domains.
4. Create a draft with a unique slug/name and **explicit `is_active:false`**. The minimum direct insert can omit other fields until editing. Add a specialty before publishing. Never fabricate a clinician or mark an unreviewed record verified.
5. After a specialty is chosen, use the **existing** server-only RPC `salapp_save_doctor(p_data jsonb, p_specialty uuid)` for a complete save. It writes doctor fields and replaces the primary specialty in one transaction; `p_data.id=null` creates a UUID, an existing ID updates it. It currently manages **one** specialty per save, so do not use it to save a doctor with multiple links unless that replacement is intended. For multiple specialties use one trusted server-side database transaction that preserves them.
6. Supply all fields below for the RPC: it is a full save, **not a partial patch**. For edits load the current row and preserve unedited values. Keep the same UUID and normally the same slug so appointment references and URLs remain stable.

```ts
// Run only inside a server handler after checking the authenticated admin role.
const { data: id, error } = await privileged.rpc("salapp_save_doctor", {
  p_specialty: selectedExistingSpecialtyId,
  p_data: {
    id: existingId ?? null,
    profile_id: linkedDoctorAccountId ?? null,
    slug,
    name,
    name_ar,
    bio,
    bio_ar,
    city,
    address,
    languages,
    consultation_types,
    price,
    currency,
    years_experience,
    photo_url,
    is_active: false,
    is_verified: false,
    is_demo: false,
  },
});
if (error) throw error; // Map constraint/conflict errors to actionable form errors.
```

7. `profile_id` is optional. If supplied it must reference an existing patient/doctor account; the existing RPC promotes a linked patient to `doctor`, never to `admin`. Do not link an admin account as a doctor.
8. Add photo/location/dated availability and review. **Publish** by saving with `is_active:true`, or update that flag after all required fields/links have committed. A rejected publish leaves the row private; do not suppress a database error and report success.
9. Update biography, prices, languages, location or photo with the same doctor ID. **Archive** with `is_active:false`. Do not delete doctors, appointments or referenced availability slots. Old appointments keep their doctor identity; RLS permits the appointment owner to read the archived doctor's public details, and the assigned doctor retains existing ownership access. This does not re-enable public discovery or new booking.

## Structured availability and booking

The existing system stores **actual dated intervals**, not recurring weekday text:

```ts
{
  doctor_id: doctorId,
  start_at: '2026-11-01T15:00:00Z', // timestamptz / ISO 8601 with an offset
  end_at:   '2026-11-01T15:30:00Z',
  consultation_type: 'in_person', // or 'video'
  is_active: true,
}
```

Convert local working hours using `Africa/Cairo` with timezone/DST support; do not use a fixed UTC offset. If the admin app offers weekly hours, materialize dated intervals into the existing table for a bounded future horizon. No recurring-schedule schema was added here. Current server validation and SQL require a positive interval no longer than four hours. Active doctor slots cannot overlap. Offer consultation types supported by the doctor's profile.

`clinic_available_slots(p_doctor uuid)` is the common profile, booking and SAL source. It returns future active slots for active doctors, excludes overlapping confirmed/pending appointments, and returns up to 160 ordered intervals. `/api/doctors/<doctor UUID>/availability` uses that RPC; despite the route parameter name `slug`, this endpoint expects a UUID. Booking uses the existing atomic `clinic_book_appointment` RPC, which checks publication/availability again and reserves under a lock.

For day-off/closure changes deactivate unbooked intervals. Preserve booked intervals and appointments; existing appointments need an explicit cancellation/rescheduling workflow, not silent deletion or time edits. Archive does not cancel existing bookings automatically.

## Storage upload, replacement and cleanup

- Reuse `clinic-doctor-photos`; do not create a second photo bucket. Public download does **not** permit uploads. Existing Storage RLS has public SELECT only; this integration adds no public/authenticated writes.
- The authorized admin server uploads JPEG/PNG/WebP at most 5 MiB, checks actual format/size, and creates its own path such as `<doctor UUID>/<random UUID>.webp`. Never accept arbitrary bucket names or removal paths from a browser.
- Upload a **new versioned path** with `upsert:false`, get the public URL, then save `photo_url`. The public site already permits this exact bucket in Next Image configuration. A new URL avoids stale Storage/CDN/Next optimized-image cache when replacing a photo.
- Save only this project's HTTPS public bucket URLs. The existing admin API rejects other photo origins. Do not store signed URLs that expire, local filesystem paths, or private verification documents in `photo_url`.
- If saving the doctor fails, remove only the new unused upload. After a successful replacement, remove the prior image only if it belongs to the managed bucket/path and no doctor references it; retain it if history/audit needs it. Never perform broad bucket cleanup or delete a photo merely because a doctor was archived.
- Photos in this **public bucket** are accessible to anyone who knows their URL, including draft photos. Upload only images intended for public display. Verification documents/internal records belong in private storage with separately reviewed access controls.

## Public queries, SAL and freshness

`lib/data/doctors.ts` remains the shared query module: `getDoctors(filters)`, `getDoctorBySlug`, `getSpecialties`, `getAvailableSlots`. It explicitly projects public columns and applies `is_active=true` in the database query. Public RLS also enforces publication, with narrow exceptions for doctor ownership and a patient's own appointment history. Ordinary patients/anonymous users cannot create, edit, publish or delete doctors/schedules. Existing doctor accounts can edit their own allowed profile fields and availability; they cannot publish or self-verify.

Both `app/api/sal/message/route.ts` and `lib/sal/tools.ts` read this same catalog. Live tools include `find_doctors({specialty,city?,language?,consultationType?})`, `get_doctor_details({doctorId})`, and `get_doctor_availability({doctorId})`. The specialty is an existing slug, doctor IDs are existing UUIDs, search returns at most three doctors, and availability is read at tool execution. Invalid/archived IDs are rejected. Do not embed records in prompts, retrain the model, create another doctor store, or send private account IDs to Gemini.

The root layout already uses `dynamic='force-dynamic'`, doctor/profile pages are request-rendered, API JSON responses use `Cache-Control:no-store`, and privileged Supabase fetches now explicitly use `cache:'no-store'`. No revalidation secret, webhook or new endpoint is needed. Changes appear on the **next refresh/fresh request**; already-open pages/conversations are not pushed live. Versioned image URLs handle photo caching separately.

Existing MVP limits remain: catalog reads take the first 200 active doctors, SAL presents up to three matches, and the availability RPC returns up to 160 slots. Before growing beyond 200 doctors, add reviewed database-side filtering/pagination; this task does not rewrite that working flow. Historical SAL transcripts may retain earlier recommendations; new tools/matching and booking always check current publication.

Shared-project Supabase advisors also report legacy `public.user_role` search-path configuration, legacy `user_role`/`handle_new_user` function execution grants, and disabled leaked-password protection. Those existing auth/legacy-schema settings are outside this integration and need a separate review; they were not changed. The new helpers live in `clinic_private`, fix their search path, and restrict execution. The intentional extra doctor-history SELECT policy can produce a performance advisory about multiple permissive policies; it does not grant public writes or disable RLS. Existing unrelated index/performance advisories were left alone.

## Migration, rollout and rollback

- Integration branch: `admin-data-integration`. Baseline commit: **`97e2c3a`**, also available as **`clinic-baseline-before-admin`**. It includes the previously verified UI/fonts/logos.
- New migration: `supabase/migrations/20261005041330_prepare_admin_doctor_publication.sql`, generated with the Supabase CLI. It changes the new-row publication default, adds a scalar publish constraint/two deferred specialty guards, and adds one history-read helper/policy. It makes no row updates or deletes, leaves existing policies/column grants intact, and uses lock/statement timeouts. A preflight rejects incomplete existing published doctors instead of silently changing them.
- This project historically uses `scripts/database.mjs` with individual installation probes rather than Supabase migration-history tracking. `npm run db:setup` applies only recognized missing migrations and never seeds unless explicitly requested. The live rollout skipped all three existing migrations and applied only this new file. Do not run an unreviewed `db push`, reset, seed, or another app's migrations against this shared project.
- UI/app rollback: switch to `clinic-baseline-before-admin` in a clean checkout or revert only integration commits and build/deploy that version. The additive database changes remain compatible with the baseline's published catalog and existing save RPC. **Prefer retaining the safer defaults/history policy** when rolling back app code.
- If database rollback is required, have a trusted operator run the targeted SQL below. It removes only objects introduced here, restores the old default, and does not change records. It intentionally restores the previous weaker publication rules and previous archive-history behavior. Stop the future admin mutations while doing this. The installation probe will see it as absent, so a later `db:setup` reapplies it.

```sql
begin;
set local lock_timeout = '5s';
drop policy if exists clinic_doctors_appointment_history on public.clinic_doctors;
drop trigger if exists clinic_doctor_publish_specialty on public.clinic_doctors;
drop trigger if exists clinic_doctor_specialty_publish_guard on public.clinic_doctor_specialties;
alter table public.clinic_doctors drop constraint if exists clinic_doctor_publish_fields;
alter table public.clinic_doctors alter column is_active set default true;
drop function if exists clinic_private.has_doctor_appointment(uuid);
drop function if exists clinic_private.check_doctor_publish_specialty();
notify pgrst, 'reload schema';
commit;
```

## Verification

Verified on 2026-10-05: production build, typecheck and lint pass; **43 local tests** pass; the **one live demo lifecycle test** and **32 selected existing browser regressions** pass. The regression selection covers security, auth/password recovery, booking conflicts/recovery, archived history, catalog/search, voice permission/error recovery, and bilingual desktop/mobile pages down to 320px. The production migration and lifecycle cleanup preserved the original 4 doctor rows, 6 specialties, 4 specialty links, 224 availability rows and 1 appointment; before/after row hashes match.

Local tests exercise migration upgrade/rerun without modifying existing rows, private defaults, publication rejection, atomic save compatibility, restricted roles/account IDs, archive visibility and retained appointment history. `tests/e2e/admin-integration.spec.ts` uses **one shared clearly fictional temporary doctor** to verify draft/publish/update/archive, specialty/search/profile, public Storage images and replacement, SAL tools, current availability, real test booking, fresh updates, Arabic/320px layout and appointment history. It restores only that run's fixture for other tests; teardown removes temporary rows/accounts/Storage objects. These fixture checks establish integration behavior, not approval of a real clinician catalog or a new live Gemini-model output.

Doctor-management regression verification on 2026-10-06: build, typecheck, lint, 43 local tests and the three `tests/e2e/doctor-management.spec.ts` browser tests passed. The live tests cover English/Arabic validation (including a 390px Arabic viewport), blank optional fields, decimal prices, duplicate URLs, removal confirmation/cancellation, deletion of an unbooked doctor and its dependent availability/specialty links, admin/CSRF/UUID enforcement, and retained booked history after a rejected deletion and subsequent deactivation. The tests use temporary fictional doctors/accounts and remove their fixtures afterward.
