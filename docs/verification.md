# Verification · 4 October 2026

The existing application was transformed to voice-first SAL and tested against the configured Supabase project and Gemini API. The optimized production server is running locally at http://127.0.0.1:3000; no public deployment was made.

## Results

| Check                                                                   | Result                                                                           |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Strict TypeScript                                                       | Passed                                                                           |
| ESLint                                                                  | Passed, no warnings                                                              |
| Optimized Next.js production build                                      | Passed                                                                           |
| Production server, visual review and language interaction               | Passed; no browser page errors                                                   |
| Automated audio, contracts, safety rules, PostgreSQL migrations and RLS | 27 passed                                                                        |
| Microsoft Edge browser tests against live services                      | 34 passed                                                                        |
| Production dependency audit                                             | No reported vulnerabilities                                                      |
| Browser build secret scan                                               | 25 files scanned; no supplied Gemini, Supabase secret, or management token found |
| Supplied mascot                                                         | Source, public file and actually served asset have identical SHA-256             |

## Verified voice journeys

- The homepage immediately renders the canonical SAL mascot and central microphone control. Typing is secondary. Captions can be hidden, and the full transcript is collapsible.
- A user activation requests microphone permission and resumes Web Audio before network work. The server returns only a single-use ephemeral token; the browser connects directly through the official Google SDK to `gemini-3.8-live`.
- English microphone PCM passes through the actual AudioWorklet at 16 kHz. Google returns input transcription, native 24 kHz PCM audio and output transcription. The waveform follows measured microphone amplitude. Speech interrupts SAL, clears queued playback and receives a continuing response.
- Typed input while muted reaches the same Live session. An explicit empty turn boundary finishes the input when no microphone silence can be delivered to VAD; the typed text is not duplicated. SAL recalls the duration from prior speech.
- A real WebSocket disconnect resumes with a new ephemeral token and the provider's resumption handle. The conversation ID and original microphone remain unchanged. Speaking again after typing and resumption preserves duration and aggravating-factor context.
- Live doctor function calls reach the secure server and return actual Supabase IDs, specialties and availability. Existing doctor cards appear while the call remains connected. The test data is explicitly fictional; cards and spoken guidance identify demo profiles. Booking links open the existing available-time selector.
- Finalized transcript turns persist with unique request/role identities and a bounded message count. Repeated persistence requests do not duplicate messages. Foreign session access, cross-origin token requests, privileged extra tool arguments and fabricated doctor IDs are rejected.
- Arabic microphone input produces Arabic native audio and captions in an RTL 390-pixel screen. Ending a call and navigating to booking close Live connections, stop all microphone tracks, close AudioContexts and clear playback.
- Microphone denial shows a friendly error and usable text composer without requesting a token. A real text exchange persists; a voice retry uses the same session and remembers its content.
- Urgent spoken symptoms display emergency guidance first, suppress ordinary doctor cards and routine homepage sections, produce actual spoken emergency guidance and persist an urgent response. The final emergency presentation was separately retested after the full suite.

The microphone sources in automated voice tests are synthetic WAV fixtures generated with Windows speech synthesis. Google connections, transcriptions, audio responses, Web Audio rendering, tools and Supabase requests are real. This proves the software path, not physical microphone acoustics, speaker intelligibility or echo cancellation on a person's device. No patient recordings were used. See [fixture details](../tests/fixtures/README.md).

## Microphone permission follow-up

The user's reported error was reproduced in the Codex in-app browser on this Windows device. `getUserMedia` failed with `NotAllowedError: Permission denied by system`, although the page was a secure context and the microphone permission query returned `granted`. Windows device, application and desktop microphone consent entries were already `Allow`. The same application successfully opened the actual microphone in the user's Brave desktop browser, connected to Gemini, and received native audio and transcription. The call was ended afterward. This confirms the desktop browser capture path on this device; it does not establish which internal in-app-browser or system component rejected capture, and it does not quantify acoustic quality.

The application now classifies capture failures using the failed operation and, where supported, the microphone permission state. A granted-site capture block directs the user to a regular browser or system microphone settings. AudioWorklet errors are handled as audio-processing failures instead of permission denials. The microphone and AudioContext are released on both failures. Logs contain only the stage, error code/name and permission state; no audio, captions or credentials are logged. Typing and retry stay available. No browser or system privacy settings were changed.

After this fix, three focused browser regressions passed: granted permission with blocked capture in English and Arabic at 320 pixels; a processing `SecurityError` after successful capture with all tracks/contexts released; and actual text fallback followed by a live Gemini voice retry that retains the conversation. None of the capture/processing failures requested a Live session or token. The production build, strict TypeScript, lint and all 27 existing automated checks also passed. The full 34-test result above is the earlier baseline; the complete suite was not repeated for this narrow fix. The current in-app-browser recovery message was verified directly after rebuilding and refreshing.

## Verified live journeys

- Homepage symptom input reaches Gemini, persists a guest conversation, and returns database-backed doctor matches. Another browser cannot read the conversation.
- Booking retains a selected slot through email/password login, associates the guest conversation with the patient account, saves a confirmed test appointment, and displays it in the patient dashboard. Cancellation releases the slot.
- Two patients attempting the same slot produce one successful booking and one conflict. Invalid slots, forged ownership, unauthorized cancellation, and private appointment access are rejected.
- Supabase recovery token links establish a session and save a new password. Logout clears access. Authentication cookies are HttpOnly. Unsafe callback destinations remain on the app origin.
- Doctors add availability, edit their own public profile, and mark their assigned ended appointment completed. Patient accounts cannot perform doctor or admin actions.
- Administrators create and edit specialties and doctors, activate/deactivate profiles, and add/remove curated knowledge. Real Gemini embeddings have 768 dimensions; active chunks are retrieved through pgvector, and inactive documents are excluded.
- Deterministic emergency behavior appears immediately, persists with no doctor recommendations, and disables ordinary conversation. Failed and malformed AI responses retain the patient's message and offer recovery.
- Real Arabic SAL output persists through reload in an RTL conversation. Saved doctors and the patient's preferred language persist to the database.
- English and Arabic homepages were checked at 1440, 1280, 1024, 768, 430, 390, 375, and 320 pixels. Care, directory, specialty, doctor, booking, and auth pages were also checked at 375 pixels. No horizontal overflow or browser page errors were recorded. Mobile screenshots were visually reviewed.

## Integration and security boundaries

Both supplied migration files and the labelled development seed were applied. The existing application's tables and records were preserved. The new application uses `clinic_*` tables, restricted grants, RLS, server role checks, and database exclusion constraints for appointments. Test accounts and controlled test records were removed after verification. Secrets and temporary verification files are ignored by Git.

Supabase's live security advisor reported no warnings on the new application objects. Its three informational notices are for deliberately service-only knowledge and rate-limit tables with RLS enabled and no public policies. Six existing project warnings concern legacy helper functions and the Auth breached-password setting; those existing definitions and global security settings were not changed.

Google is enabled and the OAuth request preserves the app callback and next destination. A human Google login was not completed. Confirmation and recovery email delivery were not tested; no custom SMTP sender is configured. Password recovery was verified with a real generated Supabase recovery token, which proves the application flow but does not prove email delivery.

Text defaults use Gemini 3.8 Flash and Gemini 3.5 Flash-Lite. Actual generation requests returned HTTP 200; a model-listing success alone is not treated as generation proof. Voice uses Gemini 3.8 Live through `v1beta`; actual ephemeral connections returned native audio and transcriptions. `npm run check:providers` now probes all three paths without logging keys, prompts, captions or audio. Model and protocol configuration follows [Google's current model guidance](https://ai.google.dev/gemini-api/docs/latest-model) and [Live API capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities).

## Before accepting real patients

Replace the explicitly fictional directory with verified clinician records; configure a production HTTPS origin, Supabase redirect URLs, and SMTP. Assign the initial administrator through a trusted database operation as documented in the README. Complete the operator's privacy, retention, contact, and clinical safety policies. The emergency rules and LLM guidance have software checks, not clinical validation. Development bookings do not arrange real care.

Commands and setup details are in [README.md](../README.md). Browser reports and screenshots are in the ignored `work/` directory; no authentication traces are retained.
