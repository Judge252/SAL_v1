# The Clinic · SAL

Voice-first Next.js App Router application with English/Arabic, Supabase authentication and PostgreSQL, Gemini Live care navigation, curated pgvector retrieval, and transaction-safe appointment booking. The supplied SAL image and the existing navy/teal theme are preserved.

## Run

Node.js 22 or newer. Install with `npm ci`, copy `.env.example` to `.env`, then configure `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or the legacy service-role key), and `GEMINI_API_KEY`.

```sh
npm run db:setup
npm run db:seed
npm run dev
```

Open http://127.0.0.1:3000. Set `APP_URL` to the exact origin you use; for production it must be the public HTTPS origin. The database setup script needs `SUPABASE_ACCESS_TOKEN`, which is used only to apply SQL. Alternatively, run the migration files in filename order in Supabase’s SQL editor. All SQL is supplied; no schema design is required.

`db:seed` is **development only**. It adds clearly labelled fictional doctors and future appointment times. Do not run it for a real directory. No ratings, testimonials, accuracy figures, or credentials are fabricated.

## Database and roles

The supplied project already had Clinic tables. This app uses isolated `clinic_*` tables and private helper functions, preserving those existing tables and records. Migrations include indexes, foreign keys, RLS, column permissions, and PostgreSQL exclusion constraints preventing overlapping pending/confirmed appointments. Booking checks the authenticated user and available slot atomically; direct appointment inserts are not granted to patients.

New accounts always start as patients. After creating your own account, a trusted database administrator can assign its role:

```sql
update public.clinic_profiles set role = 'admin' where id = 'YOUR_AUTH_USER_UUID';
```

Then use `/admin` to add doctors, connect doctor accounts, manage specialties, and add clinically reviewed knowledge. Connecting a patient account to a doctor profile grants that account the doctor role. Patients cannot edit roles, verification, or ownership. `/patient`, `/doctor`, and `/admin` enforce authentication and roles on the server.

Doctor photos must use the `clinic-doctor-photos` Supabase Storage bucket. Only privileged uploads are allowed. The app accepts stored photo URLs; it does not show an unimplemented upload control.

## Authentication

Email signup/login, confirmation, password recovery, reset, Google OAuth, and logout run on the server through Supabase SSR cookies. Keys never reach browser code. Guest SAL sessions use an HttpOnly random cookie; only its hash is stored. Guest conversations are associated with the account after successful sign-in. Selected booking slots are preserved through authentication.

In Supabase Auth, allow the exact app callback URLs (`/auth/callback` and `/auth/confirm`) and configure the site URL. Enable Google with your own Google client configuration. Keep email confirmation enabled and use a configured SMTP sender. Google provider login and real email delivery require these provider settings; local callback tests do not prove provider delivery. Recovery supports both PKCE codes and token-hash email links.

## Voice-first SAL

The homepage and `/sal` open with SAL and a central **Talk to SAL** control. Microphone permission and Web Audio activation begin from that tap. Recent input/output captions are shown below the call controls; the full transcript is collapsible. Typing is a secondary control, and guests can talk before signing in.

The official `@google/genai` SDK connects the browser directly to Gemini Live with a single-use ephemeral token. `GEMINI_API_KEY` stays on the server. Configure `GEMINI_LIVE_MODEL`; the configured and live-tested default is `gemini-3.8-live`. The API version is `v1beta`. A token may start one session within 60 seconds and expires after 20 minutes. Server constraints lock the model, system instructions, audio configuration and tool definitions while allowing session resumption.

Microphone audio passes through an AudioWorklet that downmixes and resamples to mono PCM16 at 16 kHz. Received 24 kHz PCM is scheduled continuously through Web Audio. Automatic voice activity detection supports interruption; interrupted playback is cleared immediately. Microphone and output analysers drive SAL's rings, waveform and glow using refs and animation frames. Reduced motion is respected. Mute, end, navigation and errors stop or release the appropriate tracks, contexts and playback buffers. A dropped connection attempts resumption with the existing conversation and microphone; failures expose retry and typing.

If microphone permission is allowed but capture still fails, open the same local address in your regular desktop browser. Site permission can be granted while a browser host or the operating system blocks capture; SAL checks the permission state after a failed request and gives the appropriate recovery message. Audio-processing failures are handled separately, and typing remains available. On this Windows device, the Codex in-app browser returned `NotAllowedError: Permission denied by system` with permission `granted`, while the actual microphone connected successfully through Brave. See the [microphone verification record](docs/verification.md#microphone-permission-follow-up).

Typed input during a call uses `sendRealtimeInput` on the same Live session. Outside a call, the existing validated `/api/sal/message` flow remains available and shares the same owned Supabase session. Finalized input/output transcripts are merged before persistence in `clinic_sal_messages`; the application stores no audio recordings. Persistence failures retain unsaved turns in memory and expose **Retry saving**.

The voice endpoints are:

- `POST /api/sal/live-session`: create or verify an owned conversation and return connection metadata.
- `POST /api/sal/live-token`: verify ownership and rate limits; return only `{ token }`.
- `POST /api/sal/live-tools`: validate function arguments and query actual active Supabase records or curated knowledge.
- `POST /api/sal/live-turns`: idempotently save bounded finalized transcript turns.

Doctor search, details and availability return public records through the server, never privileged browser database credentials. Returned profiles use the existing cards and booking routes. Fictional development profiles remain explicitly labelled in the cards and in SAL's spoken guidance. Emergency checks display urgent guidance, suppress recommendations, and cue spoken emergency guidance. These controls supplement the model's instructions; they are not clinically validated triage.

## Text SAL and curated knowledge

`lib/ai/provider.ts` separates the provider from the application. Gemini responses are validated with Zod; malformed or failed responses produce a recoverable error instead of medical claims. The server controls specialty slugs and doctor matching, ignores model-generated doctor IDs, and persists conversation turns. Deterministic urgent-symptom checks and the system prompt direct obvious emergencies toward emergency care. These safeguards are not a clinically validated triage system.

Knowledge can only be added by an administrator. Source text is chunked, embedded to 768 dimensions, and saved atomically. Queries retrieve active curated chunks through cosine similarity. An empty knowledge base produces no citations. No internet content is automatically ingested. Reference URLs and patient input cannot override the system prompt. Configurable daily limits are stored in PostgreSQL; failed model retries also consume provider calls. Guest and account limits are separate, with a network-wide ceiling. Set `TRUST_PROXY=true` only behind a proxy that overwrites forwarded IP headers; Vercel headers are trusted automatically. Otherwise a conservative shared network bucket is used.

`EMERGENCY_PHONE` is optional and must be configured for the operating region. No emergency number is guessed. Review the rules against local clinical guidance; the general emergency direction was checked against [NHS chest-pain guidance](https://www.nhs.uk/symptoms/chest-pain/) and [stroke warning signs](https://www.nhs.uk/conditions/stroke/symptoms/).

## Verify

The verification record is in [docs/verification.md](docs/verification.md): 34 live browser tests and 27 automated audio/safety/database checks passed, along with lint, strict TypeScript, and the production build. Voice tests use synthetic microphone speech with real Gemini audio, transcription, tools and Supabase persistence; physical device acoustics require a separate check.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run start
npm run test:e2e
```

The browser suite uses installed Microsoft Edge by default; set `PLAYWRIGHT_BROWSER_PATH` to another Chromium executable if needed. Live browser tests create temporary, clearly named verification accounts and clean them up. Traces are off to avoid recording authentication bodies. They require the configured test Supabase/Gemini services and a running server. Run them only against a development project.

## Deploy

Deploy as a standard Next.js application on a Node-capable host such as Vercel. Use `npm run build` and `npm run start`; configure server environment secrets in the host’s secret store, apply migrations, and update Supabase Auth redirect URLs. Remove the management token from the runtime deployment. Keep authenticated responses uncached. Review the development Terms/Privacy pages, operator contact details, retention policy, clinical safety, and real doctor verification before accepting real healthcare users. No public deployment is made by the local setup commands.

The app does not implement payments, billing, video calls, prescriptions, or diagnosis. Consultation type is appointment metadata; a clinician must arrange any external video service.
"# SAL_v1" 
