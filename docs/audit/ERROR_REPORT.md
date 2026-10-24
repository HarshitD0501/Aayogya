# Verified defects and control gaps

Audit window: 2026-10-24 to 2026-10-25, Asia/Kolkata. **Recommendations only; application code was not changed.** P0 means before a public/real-user demonstration, P1 before relying on the affected feature, P2 after the critical path is reliable. Severity describes impact; it is not proof that a specific attacker exploited the system.

Evidence keys: `evidence/backend-probes.json` and the reproducible `reproduce_backend.py` use temporary SQLite databases and synthetic identities with all provider sends mocked. `evidence/tests.json` and per-suite logs contain existing test results. `evidence/npm-audit.json` is the registry scan. Source-only findings below explicitly say so; they are verified implementation gaps, not invented provider failures. Existing local SQLite corruption repaired in the preceding task is not reported as a new failure.

## P0: gates, isolation and dependency exposure

### ERR-001 — Unconfirmed prescriptions become active medicines and reminders

- **Component/severity/location:** OCR/reminders; Critical; `backend/app/main.py:349`, `main.py:358`, `main.py:417`; `backend/app/whatsapp.py:217`.
- **Problem/reproduction/evidence:** Run the audit probe. Upload with a synthetic extraction result. Response has `confirmed=false`, but `/api/medicines` returns one active medicine and `/api/adherence/today` creates two scheduled doses. No external OCR or messaging occurs in this probe.
- **Root cause:** `_persist_meds` stores active status before confirmation; active queries and adherence sync do not require `Report.confirmed`. Unknown schedule/low-confidence flags also do not gate dispatch.
- **Impact:** An unreviewed extraction can enter medication advice and outbound reminders.
- **Solution/priority:** P0. Persist pending-review medicines; require confirmed report, approved fields and valid schedule at every list/advice/scheduler selection boundary. Activate atomically in confirm. Define an explicit policy for manually entered medicines without a report. Add a correction contract; do not merely hide a button.
- **Verification:** Upload unconfirmed, unknown-salt and rejected prescriptions; assert zero active advice/doses/sends. Confirm corrected data and assert exactly the approved schedule becomes eligible, including after restart.

### ERR-002 — Any patient can force the global reminder/call sweep

- **Component/severity/location:** Authorization; Critical; `backend/app/main.py:809`, especially `815`; `backend/app/whatsapp.py:823`, `836`.
- **Problem/reproduction/evidence:** As synthetic patient A, POST `/api/reminders/trigger-check`. Probe records HTTP 200, patient B in mocked send targets, and one mocked voice dispatch attempt.
- **Root cause:** Route authenticates a patient but does not pass their ID to the all-patient worker. `force=True` bypasses timing and duplicate checks.
- **Impact:** Cross-patient outbound actions, disclosure in returned dispatch details, spam and billable calls.
- **Solution/priority:** P0. Remove the global sweep from patient-facing routes. Make an immediate test action scope to one authorized patient, one chosen reminder/report, explicit recipient confirmation and a server allowlist. Keep the full scheduler reachable only by the worker or an authenticated operational job.
- **Verification:** Two-patient API tests must prove A cannot affect B, read B's dispatch details, override B's preferences, or force unrelated appointments.

### ERR-003 — Frontend dependency scan reports critical/high advisories

- **Component/severity/location:** Dependencies; Critical (registry classification); `frontend/package.json:15`, `frontend/package-lock.json`.
- **Evidence:** Completed `npm audit --json`: five affected package entries, one critical (`next`), one high (nested `postcss`), three moderate. Next installed is 14.2.35. The direct PostCSS is 8.5.31; the high finding includes another dependency instance. The maintainer confirms [GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) affects Windows-hosted servers on this release line. See raw dependency paths and advisory ranges in the JSON. This is a package/configuration finding, not a demonstrated exploit of every advisory in this app.
- **Root cause/impact:** Installed dependency versions fall in published vulnerable ranges. Several findings concern externally reachable server behavior; deployment exposure depends on affected feature/configuration.
- **Solution/priority:** P0. Validate maintainer advisories, choose a supported patched release line and resolve all nested vulnerable instances. Audit suggests a major Next upgrade; do not use `npm audit fix --force` without compatibility review. Upgrade on an isolated branch, regenerate the lock and check rewrites, route handlers, rendering, Leaflet and LiveKit.
- **Verification:** Re-run registry audit with no unresolved reachable critical/high findings; record exceptions individually with applicability evidence. Run production build, routing/auth tests and smoke tests before exposure. [Next.js security advisories](https://github.com/vercel/next.js/security/advisories).
- **Status (Batch 1A):** RESOLVED. Upgraded `next` to 15.5.28 (patched against GHSA-p293-qw3h-jr36, GHSA-2464-fhr4-w9xw, GHSA-p3m5-59mp-jv5r); pinned overrides for `postcss` (8.5.31) and `postcss-selector-parser` (7.1.7). `npm audit --json` returns 0 vulnerabilities. Production build compiles cleanly in 9.4s. Added regression test script `scripts/test-dependencies.mjs` (`npm test`). pip-audit baseline recorded in `evidence/pip-audit-batch1a.json`.

### ERR-004 — Backend outages can produce synthetic successful authentication

- **Component/severity/location:** Frontend auth; High; `frontend/app/api/[...slug]/route.js:65`, `78`; `frontend/lib/api.js:284`; `frontend/app/app/page.js:19`, `61`.
- **Problem/evidence:** Source-verified: proxy network failures return HTTP 200 with a fixture token for login; browser fallback does likewise without validating the password. The workspace starts with synthetic patient state and `ready=true`, then auto-attempts demo login. This is a UI authentication illusion, not proof that the real backend accepts that synthetic token.
- **Reproduction:** Against an intentionally unavailable backend, submit arbitrary login details and inspect token/state. Do not stop a shared backend merely for this test; point an isolated test proxy at an unused port.
- **Root cause/impact:** Unconditional fallback is mixed with real identity handling. Users can see fabricated health data and an apparently signed-in workspace.
- **Solution/priority:** P0. Remove authentication fallbacks; require successful backend verification before rendering patient state. Make demo entry explicit and use provisioned nonprivileged accounts through the same auth API. Keep optional fixture mode separately labeled and disabled for real-user flows.
- **Verification:** Backend outage, bad password, expired token and random account must fail visibly without patient fixtures or replacement tokens; explicit demo and newly registered accounts must remain distinct.

### ERR-005 — New feature screens call nonexistent v1 APIs and return synthetic data

- **Component/severity/location:** OCR/search/prices/reminders; High; `frontend/lib/client.js:190`, `225`, `299`, `366`, `500`; `frontend/components/views/SearchView.js:84`.
- **Evidence/reproduction:** Backend probes and browser fetches return 404 for `/api/v1/search`, `/cities`, `/stores`, `/routes`. Backend route inventory contains no v1 router. The client catches failures and returns a four-entry medicine catalog, invented OCR text, price comparisons and action IDs. SearchView sets offline mode false even for a fixture response. The backend's explicit mock-extraction protection therefore does not protect this frontend path.
- **Root cause/impact:** Two independently implemented API clients with incompatible contracts make functional-looking screens while real services are unused.
- **Solution/priority:** P0. Choose the existing backend contract and adapt the new views, or implement versioned adapters with shared schemas. Remove synthetic success on all real data/action paths. Explicitly label permitted sample prescriptions; never return sample extraction for an arbitrary real upload.
- **Verification:** Contract tests for every client method; fail the build on unmatched endpoints. Offline/404/401/502 must display unavailable states, not medicine candidates/prices/action success.

### ERR-006 — The prescription call UI invents call progression

- **Component/severity/location:** Demo calling; High; `frontend/app/prescriptions/[id]/page.js:184`, `215`; `frontend/lib/client.js:578`, `585`.
- **Evidence:** Source-verified: timers set ringing at 1.8 s, answered at 4.5 s and completed at 10 s, independent of a provider. Client fallback returns a requested call and later completed status without a provider.
- **Root cause/impact:** Presentation timers substitute for a call state machine. A judge/user can see a completed call that never existed.
- **Solution/priority:** P0. Remove lifecycle timers and synthetic completion; persist an attempt with provider IDs and update it only from authenticated worker/SIP/provider events. Separate requested, accepted, ringing, answered, ended and failed. Demo dialing must be explicit and real, or visibly unavailable.
- **Verification:** No provider configuration must never reach ringing/answered/completed. Busy, rejected, timeout and worker-offline paths must match actual recorded outcomes.

## P1: correctness, data and integration blockers

### ERR-007 — Fixed stores, phone numbers and routes are presented as verified

- **Component/severity/location:** Map/routing; High; `frontend/lib/client.js:388`, `445`; `frontend/components/views/StoresView.js:105`, `179`.
- **Evidence:** Browser `/stores` showed four fixed listings marked official/verified. Source fallback always returns 1.2 km, six minutes and a three-point polyline, regardless of a routing provider. The driving route API is missing. This audit did not call the displayed numbers.
- **Root cause/impact:** Static fallback data and labels imply official facilities/navigation; users may travel to or contact the wrong place.
- **Solution/priority:** P0 for truthful demo, P1 for full routing. Return unavailable until genuine OSM/official facility records and a routing service exist. Store provenance, OSM element type+ID, coordinates and optional fields. Use OSRM-compatible geometry and genuine distance/duration; do not infer opening/stock status.
- **Verification:** Two distant origin/destination pairs produce different provider routes. Missing address/phone remains absent. Provider outage produces no fabricated directions. [OSRM route API](https://project-osrm.org/docs/v26.4.0/http).

### ERR-008 — Negative WhatsApp text is recorded as taken; replay is not deduplicated

- **Component/severity/location:** Adherence; High; `backend/app/whatsapp.py:631`, `661`, `676`, `519`.
- **Evidence/reproduction:** Audit input `nahi li` yields `marked_taken_via_text`. Positive terms include substring `li`, and positive checks run before negatives. The handler has no persisted inbound message-ID uniqueness check; it picks the first pending slot, so retrying a text can affect another slot.
- **Root cause/impact:** Substring matching and missing event idempotency corrupt adherence and may inform caregivers incorrectly.
- **Solution/priority:** P0. Handle explicit negation first using token/phrase boundaries; ambiguous text asks for clarification. Persist provider message IDs before applying changes. Prefer reply context/message-to-dose mapping; do not infer the intended slot from row order alone.
- **Verification:** Table-driven Hindi/English/Hinglish cases including `nahi li`, `not taken`, `forgot`, mixed/ambiguous phrases; replay identical webhook IDs and assert one transition and one reply only.

### ERR-009 — Blank Meta secret disables verification even in production

- **Component/severity/location:** Webhook security; High; `backend/app/whatsapp.py:200`, `204`; `backend/app/config.py` security validator.
- **Evidence/reproduction:** Set the Settings object to production in the isolated probe with blank signing secret: `verify_signature(b'{}', None)` returns true. Local backend env has no signing-secret entry. Actual key values were never printed.
- **Root cause/impact:** Code comment says development-only but no environment guard exists. An exposed endpoint could accept fabricated events for a known sender and alter adherence/send replies.
- **Solution/priority:** P0. Fail startup or disable the webhook when the production signing secret is absent. Verify raw-body HMAC, reject missing/invalid signatures, deduplicate events, and redact the verification token currently logged at `main.py:572`.
- **Verification:** Blank/missing/wrong/correct signatures in test and production; tampered raw bytes must fail. [Meta webhook guidance](https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks).

### ERR-010 — PRN, expired and unknown-frequency medicines receive scheduled doses

- **Component/severity/location:** Medication scheduler; High; `backend/app/whatsapp.py:221`, `255`; `backend/app/graph.py:110`.
- **Evidence:** Probe creates an already-expired PRN medicine and adherence sync produces an SOS dose. Source maps missing timing to morning and PRN to a daily SOS slot. Scheduler does not recompute duration expiry. Uploaded medicines can remain status active indefinitely after confirm-time reconciliation.
- **Root cause/impact:** Status strings and fallback schedules substitute for eligibility. Unclear prescriptions are converted into fixed reminders; PRN can be prompted like a daily dose.
- **Solution/priority:** P0. Exclude PRN from scheduled dose creation, require reviewed timing, and evaluate canonical start/end timestamps at eligibility time. Expire old active rows through an idempotent reconciliation job. Never default an unknown frequency to morning.
- **Verification:** PRN, no-notation, future-start, expired-course, stopped and rejected medicines produce no automatic sends; reviewed chronic medicines retain their exact schedules.

### ERR-011 — Catalog inference can invent salts without an uncertainty gate

- **Component/severity/location:** OCR medical normalization; High; `backend/app/catalog.py:165`; `backend/app/graph.py:104`, `126`; `backend/app/extraction.py:245`.
- **Evidence:** Source-verified: suffix inference appends a generic salt modifier to any known stem and returns `suffix_inferred`; the graph flags only `fuzzy` matches, treats every non-fuzzy hit as grounded, and preserves a contradictory model-supplied salt without comparison. Confidence can rise while identity is unresolved.
- **Root cause/impact:** Brand suffix conventions are treated as identity evidence. Wrong composition/release form can enter advice, matching and interactions.
- **Solution/priority:** P0. Verify exact catalog composition/strength/form/release with provenance. Treat suffix/fuzzy results as suggestions requiring explicit field review; flag model/catalog disagreements. Calibrate confidence on a labeled corpus instead of presenting heuristic scores as accuracy probabilities.
- **Verification:** Brand suffix collisions, combination products, contradictory salt, unseen brands and lookalike names must remain unresolved until reviewed; report medicine/strength exact-match error rates on a held-out set.

### ERR-012 — Device-local prescriptions and action tokens are shared across accounts

- **Component/severity/location:** Privacy/persistence; High; `frontend/lib/indexedDb.js:6`, `24`, `94`, `116`; `frontend/lib/api.js:15`; `frontend/components/views/HistoryView.js`.
- **Evidence:** Source-verified: one browser database and `report_id` keys, no patient namespace in reads/writes; logout clears bearer/patient selection but not local medical reports/action tokens. Scanner/search save local reports, while the backend holds different records.
- **Root cause/impact:** Shared-device users can see previous-account local records. New screens do not establish canonical account-owned persistence and can drift from server prescriptions.
- **Solution/priority:** P0. Make server patient-scoped reports canonical. Partition any permitted offline cache by authenticated account and schema version, enforce ownership checks, and clear/relock sensitive local state on logout. Minimize stored health data and avoid persistently storing long-lived action credentials.
- **Verification:** Register A/B, save as A, logout and login as B; list/detail/history must not expose A. Repeat with offline mode and browser back navigation.

### ERR-013 — Stopping a medicine breaks report serialization

- **Component/severity/location:** API schema; High; `backend/app/schemas.py:59`; `backend/app/main.py:122`, `128`; `backend/app/whatsapp.py:715`.
- **Evidence/reproduction:** Probe stops a medicine, then GET `/api/reports` returns HTTP 500. `stopped_at` is a database datetime but MedicineOut declares it as `Optional[str]`; `_med_out` calls `model_validate` before converting it.
- **Root cause/impact:** ORM/response type mismatch breaks report/history access after a normal action.
- **Solution/priority:** P1. Use timezone-aware datetime response fields and normal JSON serialization, or a consistent explicit conversion before validation. Check all report/medicine timestamps for the same mismatch.
- **Verification:** Stop, list reports, retrieve summary, restart and resume; response contracts must remain valid for null and populated timestamps.

### ERR-014 — Alembic is not the complete schema source of truth

- **Component/severity/location:** Database/deployment; High; `backend/app/db.py:71` onward; `backend/alembic/versions/`; `backend/app/models.py:75`, `103`.
- **Evidence:** Source-verified: reminder preference and medicine stop/reminder columns have no migrations. `create_all` does not alter existing tables; SQLite startup adds these columns ad hoc, whereas PostgreSQL skips that block. DoseAdherence is created through metadata rather than an explicit revision. A fresh Alembic-only schema comparison was run separately; see migration evidence/report.
- **Root cause/impact:** Existing SQLite tests mask schema drift. A clean migration-driven or PostgreSQL deployment can fail when ORM queries select missing columns.
- **Solution/priority:** P1, before deployment. Add explicit incremental, data-preserving migrations for every model difference. Backfill defaults, add necessary constraints/indexes and remove ad hoc ALTER swallowing once all supported upgrades are covered. Run migrations once outside multi-worker API startup.
- **Verification:** Empty database -> head and previous snapshot -> head for SQLite and PostgreSQL; compare metadata/columns/defaults/indexes and run the application without `create_all` repairing omissions. Roll back only through tested migrations/backups.

### ERR-015 — Clean backend installation omits runtime dependencies

- **Component/severity/location:** Reproducibility; High; `backend/requirements.txt`; `backend/app/preprocessor.py:18`; `backend/app/main.py:520`; `backend/app/telephony.py:115`.
- **Evidence:** Pillow and LiveKit API/protocol imports exist but are not direct backend requirements. They happen to be installed locally. Both `pip check` commands pass, which does not detect undeclared imports.
- **Root cause/impact:** A clean environment may fail importing the app due to PIL, or fail a configured voice endpoint because LiveKit modules are absent. Agent requirements are not installed in the backend environment automatically.
- **Solution/priority:** P1. Declare backend runtime/optional integration dependencies explicitly, pin a tested resolved environment and verify Python support. Separate optional extras intentionally and return configured-but-uninstalled readiness failures.
- **Verification:** Build fresh virtual environments from only the documented manifests, import all app modules and execute all non-network routes; verify configured voice token signing without contacting LiveKit.

### ERR-016 — Date-only follow-ups cannot implement an exact 48-hour reminder

- **Component/severity/location:** Appointments; High; `backend/app/models.py:39`; `backend/app/whatsapp.py:832`, `845`, `907`.
- **Evidence:** `follow_up_date` is a string, queried as today's IST date + two days. There is no appointment time, canonical timezone-aware reminder timestamp or configurable offset. Reschedule requests change a status/preference string, not the underlying due timestamp.
- **Root cause/impact:** A morning poll can be substantially earlier/later than 48 hours before the actual appointment; cancellations/completed/reschedule-requested status do not exclude calls from the due query.
- **Solution/priority:** P1. Introduce an appointment record with reviewed `appointment_at` UTC, IANA timezone, state and schedule version. Compute `reminder_at=appointment_at-offset`. Specify quiet-hours deferral semantics and invalidate old tasks on cancellation/reschedule. Keep requested reschedule distinct from clinic-confirmed booking.
- **Verification:** 48-hour boundary, IST/UTC day rollover, non-IST preference, cancellation, reschedule and quiet hours; one task per appointment/version/channel/offset.

### ERR-017 — Polling reminders have no durable claims or reliable catch-up

- **Component/severity/location:** Concurrency/reliability; High; `backend/app/whatsapp.py:232`, `865`, `878`, `917`, `953`; `backend/app/models.py:151`.
- **Evidence:** Source-verified: send eligibility is read then awaited then committed; no atomic claim or unique `(patient, medicine, dose_date, slot)` constraint. Each API worker starts its own in-memory scheduler. Only a five-minute due window is accepted. Voice deduplication searches log body/date rather than a report-specific unique attempt.
- **Root cause/impact:** Multi-worker concurrency can duplicate doses/sends; outages skip reminders; a failed/simulated log can suppress real retry, and two reports sharing a date can suppress each other.
- **Solution/priority:** P1. One worker/outbox polling persisted due tasks with transactional claims, unique idempotency keys, bounded retry/backoff, attempt history, leases and a documented lateness policy. Mark provider acceptance before completing task state and reconcile uncertain timeouts. Do not solve multi-worker duplicates with a Python global flag.
- **Verification:** Concurrent workers, crash before/after provider acceptance, provider timeout, reboot across due time, duplicate callbacks and two same-day reports must produce exactly the approved number of attempts. [APScheduler 3.x FAQ](https://apscheduler.readthedocs.io/en/3.x/faq.html).

### ERR-018 — WhatsApp scheduling ignores service-window/template and STOP rules

- **Component/severity/location:** Meta messaging; High; `backend/app/whatsapp.py:292`, `397`, `626`; `backend/app/models.py:103`.
- **Evidence:** Source-verified: only free-form text/interactive messages are sent. No approved-template integration, last inbound-window timestamp, explicit consent record or STOP/opt-out parser was found. WhatsApp preferences default enabled for new accounts. A frontend consent checkbox does not persist equivalent backend evidence.
- **Impact:** Business-initiated reminders outside the permitted window may be rejected or violate provider policy; opt-out can fail.
- **Solution/priority:** P1. Store consent/withdrawal and verified recipient, track the service window and select approved utility templates where required. Persist STOP before any further send. Add allowed-test-recipient and per-patient limits for the demo.
- **Verification:** Inside/outside-window cases, template rejection, unapproved recipient, consent absent/withdrawn and STOP retry; report accepted/delivered separately. [WhatsApp policy](https://whatsappbusiness.com/policy/). Meta developer page returned 429 during this audit; confirm account/template specifics before live testing.

### ERR-019 — Immediate call/send endpoints bypass consent and cost controls

- **Component/severity/location:** Outbound safety; High; `backend/app/telephony.py:81`, `89`; `backend/app/main.py:596`, `837`, `864`; `frontend/components/Caregiver.js:218`.
- **Evidence:** Source-verified: `force=True` bypasses disabled-call preference and calling hours. Ordinary authenticated callers can supply force; no destination allowlist, persisted explicit test consent, cooldown, daily attempt cap or idempotency key is enforced. Direct WhatsApp send similarly lacks preference/rate checks.
- **Impact:** Repeated/billable or unwanted contact, including from synthetic demo appointments whose phone was changed to an arbitrary destination.
- **Solution/priority:** P0 before enabling live demo. Separate `send_test` authorization from scheduler eligibility. Require confirmation of masked verified destination; enforce opt-in, allowlist, rate/cost caps and idempotency server-side. A demo override may bypass time only when explicitly authorized; it must not imply consent.
- **Verification:** Repeated clicks, unauthorized/unverified destination, disabled consent, caregiver permissions and expired confirmation; no provider attempt on any rejected action.

### ERR-020 — Provider acceptance is not delivery/call outcome tracking

- **Component/severity/location:** Status truthfulness; High; `backend/app/whatsapp.py:89`, `428`, `519`; `backend/app/telephony.py:128`, `135`, `189`; `backend/app/main.py:908`; `agent/voice.py:358`.
- **Evidence:** Message status webhook arrays are ignored; failed sends can still return a synthetic-looking message ID. Dispatch response ID is discarded and `call_placed` can be returned for simulation. SIP failure only logs/shuts down the agent. Recent call logs are filtered by patient, not report. No outcome callback updates the database.
- **Root cause/impact:** UI cannot prove delivery, answer, duration or failure for a specific action/report. Simulated or failed attempts may be counted as sent.
- **Solution/priority:** P1. Persist message/dispatch/room/SIP attempt IDs, nullable IDs on failure, accepted vs delivered/read/failed states, and report IDs on logs. Connect signed Meta statuses and authenticated agent/SIP events with out-of-order/idempotent updates. For Twilio Elastic SIP Trunking, use SIP/LiveKit lifecycle; Programmable Voice status callbacks are a different integration.
- **Verification:** Accepted then failed/delivered, duplicate/out-of-order events, no-answer and agent disconnect; report A must not show report B's calls. [Twilio SIP/callback distinction](https://help.twilio.com/articles/223132267-Tracking-the-call-status-of-an-outbound-call).

### ERR-021 — Pharmacy matching and savings ignore product equivalence/units

- **Component/severity/location:** Pricing; High; `backend/app/prices.py:109`, `144`, `198`, `226`.
- **Evidence:** Source-verified: first search product is accepted without composition/strength/form/release/pack validation. Its pack sale price is subtracted directly from the Jan Aushadhi reference amount, and NPPA ceilings are sorted into the same offers array. Only salt/strength text keys exist; no pharmacy pack size is retained.
- **Impact:** Wrong medicine or pack sizes can produce misleading cheapest-price and savings claims; a ceiling can be mistaken for a pharmacy offer.
- **Solution/priority:** P0 for savings suppression, P1 for full matching. Normalize ingredient quantities, form/release and package units. Compare verified equivalent products per common unit; present NPPA as regulation separately. Return unavailable/incomparable with reason when identity or units are missing. Keep availability unknown unless a source confirms it.
- **Verification:** 10 vs 30 tablets, mg vs mcg, syrup concentration, SR vs IR, combinations, conflicting strengths, unrelated first result, missing and stale listings. No savings should appear for non-equivalent items.

### ERR-022 — Price provenance/freshness and retail access permission are unverified

- **Component/severity/location:** Data integrity/provider; High; `backend/app/data/medicine_pricing_dataset.json`; `backend/app/prices.py:31`, `96`, `212`.
- **Evidence:** Dataset has 119 rows, estimated pharmacy fields and generic source links but no per-row notification/effective/verified dates. Backend intentionally ignores estimated pharmacy MRP; frontend still uses other fixed prices. The app's old Jan Aushadhi product-list URL renders 404 in a browser. PharmEasy's published terms prohibit automated access, so its search endpoint was not probed or scraped during this audit.
- **Impact:** Cannot establish current official ceilings/MRPs or claim a permitted production retail integration.
- **Solution/priority:** P1. Acquire official PMBI export and NPPA final notifications with immutable source files, hashes, dates, identifiers and row-level provenance. Obtain written pharmacy/API permission or a licensed feed. Quarantine unverifiable rows. Follow IMPLEMENTATION_PLAN.md acquisition instructions; do not promote an old PDF to current data.
- **Verification:** Sample rows reconcile to official documents, package units and dates; import is repeatable; source rights are documented; missing real retail data displays “Price unavailable.” [PharmEasy terms](https://pharmeasy.in/legal/terms-and-conditions), [PMBI current list](https://janaushadhi.gov.in/product-portfolio/product-view-list), [NPPA](https://nppa.gov.in/en/view_more?id=4).

### ERR-023 — Server accepts unbounded/unvalidated image payloads

- **Component/severity/location:** Upload/security; High; `backend/app/main.py:324`, `326`; `backend/app/preprocessor.py:37`, `82`; `backend/app/extraction.py:151`.
- **Evidence:** Probe sends invalid bytes with image MIME; mocked extractor is reached and a report is created. Server reads the entire body and accepts any `image/*`. Decode/preprocess failures fall back to original bytes. Frontend 5 MB validation cannot enforce a backend limit.
- **Impact:** Memory/CPU exhaustion and unintended external transmission of invalid files; not evidence that a real OCR provider would accept those bytes.
- **Solution/priority:** P1. Enforce upload/body limits at proxy and app; decode/verify allowlisted formats, pixel/dimension limits and decompression-bomb handling before provider invocation. Reject malformed images. Validate extraction shape/dates/constraints and bound the provider chain with an overall deadline. Return redacted errors rather than exception strings.
- **Verification:** Spoofed MIME, oversized multipart, decompression bomb, corrupted image, EXIF rotation, unsupported format, malformed provider JSON and provider timeout; assert no outbound provider call for rejected input.

### ERR-024 — Map popups interpolate untrusted HTML

- **Component/severity/location:** XSS; High; `frontend/components/Pharmacies.js:108`; `frontend/components/LazyStoreMap.js:94`.
- **Evidence:** Source-verified: store names/addresses/phones are inserted into Leaflet popup HTML strings without escaping. Overpass names are publicly editable; Leaflet parses string popup content as HTML. An exploit against a real user's browser was not attempted.
- **Impact:** If untrusted data reaches these paths, script-capable markup can compromise the origin and local bearer/medical data.
- **Solution/priority:** P1. Construct popup DOM with `textContent`, validate phone/URL schemes and coordinates, or use a strict audited sanitizer. Add a restrictive CSP after inventorying required origins.
- **Verification:** Malicious synthetic names, address markup and phone schemes render as inert text; no script/event handler runs. [Leaflet popup reference](https://leafletjs.com/reference.html#popup).

### ERR-025 — Four-times-daily dosing is collapsed into three slots

- **Component/severity/location:** Dosage; High; `backend/app/dosage.py:26`, numeric four-part branch at `dosage.py:99`; `backend/app/graph.py` dosage mapping.
- **Evidence:** Source-verified: QID is mapped to morning/afternoon/night, with `per_day=3`; a four-part notation folds noon and evening quantities into one slot. Graph stores timings/per_day but not a separate schedule preserving all prescribed intervals/quantities.
- **Impact:** Frequency/interval and dose quantity can be misrepresented. Existing tests accepting three-slot folding do not demonstrate clinical correctness.
- **Solution/priority:** P0 for marking unsupported, P1 for proper scheduling. Preserve original notation and a typed dose/interval schedule; require clinician/user review for ambiguous abbreviations. Do not merge distinct administrations solely to fit dashboard slots.
- **Verification:** Clinically reviewed QID, q6h, half-tablet, four-part notation, meal-related and PRN fixtures retain each administration, quantity and uncertainty. Do not infer instructions absent from the prescription.

## P2 and remaining security/operational gaps

### ERR-026 — Newly registered caregivers cannot load their own profile

- **Component/severity/location:** Onboarding; Medium; `backend/app/main.py:198`, `303`; `backend/app/auth.py:168`.
- **Evidence:** Probe: caregiver registration 201, subsequent `/api/auth/me` 403. Identity endpoint calls patient resolution, which rejects caregivers with no links. No real-user consent invitation/linking flow was found.
- **Root cause/impact:** Actor identity is unnecessarily dependent on having an accessible patient; a new caregiver cannot complete basic onboarding.
- **Solution/priority:** P1. Resolve actor identity separately from an acted-on patient; show an empty caregiver onboarding state. Add patient-initiated invitation, acceptance/revocation and audited consent, or disable caregiver registration until available. Verify new unlinked caregiver identity is readable without granting patient access.

### ERR-027 — Voice profile uses different field names from the backend

- **Component/severity/location:** Voice personalization; Medium; `agent/voice.py:87`, `90`, `439`; `backend/app/schemas.py` PatientOut.
- **Evidence:** Source-verified: voice reads `language` and `subscription_plan`; backend returns `lang` and `plan`. Preferred language/plan falls back to defaults; age/gender also are not profile fields here.
- **Root cause/impact:** Duplicated profile contracts lose language preferences and insert incorrect/default context into greetings and prompts.
- **Solution/priority:** P2. Use a shared profile schema/adapter and omit absent information from prompts. Verify an English-profile greeting, Hindi-profile greeting, caregiver-selected patient's identity and free/pro plan without provider calls, then confirm with an authorized audio test.

### ERR-028 — Browser voice lifecycle and visualizer can flicker/race

- **Component/severity/location:** Voice UI; Medium; `frontend/components/LiveVoiceAgent.js:49`, `69`, `145`, `191`, `225`, `231`.
- **Evidence:** Source-verified: one analyzer mixes local and remote audio but drives `userSpeaking`; draw callback captures agentSpeaking at call start. Cancel during token/connect awaits has no generation guard, so late completion may publish the microphone/start timers. Cleanup disconnect is not awaited. These are UI/lifecycle defects; actual choppy audio was not measured and double playback is not established.
- **Root cause/impact:** Shared visualizer state and stale asynchronous call completions can mislabel speaker activity and leave audio resources alive after cancellation.
- **Solution/priority:** P2. Separate analyzers/speaker state, throttle React visualizer updates, use refs for current state and a cancellation generation/abort signal; await connection teardown and ignore stale events. Handle autoplay/reconnect states explicitly.
- **Verification:** Cancel at every async boundary, switch tabs during connect, mute/interrupt/reconnect, rapid repeat start/end; exactly one room/mic/audio element and no stale timer. Instrument real WebRTC packet/jitter/playout data before blaming TTS.

### ERR-029 — Reschedule tool says the clinic was notified without doing so

- **Component/severity/location:** Agent truthfulness; Medium; `agent/voice.py:155`; `backend/app/telephony.py:204`.
- **Evidence:** Source-verified: tool response claims clinic notification; backend only stores preferred date/notes and logs a request. No clinic delivery/booking integration exists.
- **Root cause/impact:** Tool wording promises an external action beyond its implementation; the patient may believe the clinic changed or received an appointment request.
- **Solution/priority:** P1. Say “preference recorded; appointment is not yet changed.” Only claim notification/confirmation with an actual integration and persisted outcome. Verify provider/tool failure does not claim success and requested vs confirmed date remains distinct.

### ERR-030 — Frontend cancellation/timeouts and map teardown are incomplete

- **Component/severity/location:** Performance/resources; Medium; `frontend/lib/client.js:175`; `frontend/components/LazyStoreMap.js:131`; `frontend/components/views/StoresView.js:134`.
- **Evidence:** Source-verified: when an external AbortSignal is passed, the client's timeout aborts its unused controller. Caught aborts can still return fixtures. Inline onSelectStore identity retriggers marker recreation. Unmount cleanup does not `map.remove()` or cancel all outstanding geolocation/fetch work. Older Overpass mirrors have no browser deadline/cancellation/cache.
- **Root cause/impact:** Cancellation and ownership of long-lived resources are split across components, causing stale updates, excess work and unbounded waits.
- **Solution/priority:** P2. Combine signals correctly, preserve AbortError, guard stale responses, split map creation from incremental marker/route updates, stabilize callbacks and remove map/listeners on unmount. Bound/cancel/cache facility queries and use manual location entry.
- **Verification:** Rapid search/city changes, slow/hanging upstream, repeated mount/unmount, 100/1,000 markers and permission denial; bounded timeouts, no stale UI, stable heap/listener counts.

### ERR-031 — Agent process-spawn self-test fails on this environment

- **Component/severity/location:** QA/worker readiness; Medium; `agent/test_agent.py:35`, `49`; `agent/voice.py:461`.
- **Evidence:** Full test exits 1 with `Windows spawn smoke check timed out`; serial rerun also exits 1. Initial suite took 48.649 seconds. Other prompt/tool checks must be reported independently. Real worker configuration permits a 90-second initialization budget; this is not proof that it cannot run.
- **Root cause/impact:** The test imports the heavy voice stack in the spawned child but permits only a short join. Exact OS/import/model contribution remains to be measured; worker readiness is not demonstrated by the failing test.
- **Solution/priority:** P1 before voice demo. Measure cold imports/model prewarm separately, diagnose child startup under the intended machine/service account, and keep the minimal OS-spawn test free of heavy module imports. Establish readiness after warmed workers join; do not suppress event-loop warnings or arbitrarily increase every timeout.
- **Verification:** Repeated clean starts, two warmed workers, two concurrent synthetic jobs and graceful shutdown on target OS. Live audio remains a separately authorized test.

### ERR-032 — Product metrics and existing roadmap overstate verified state

- **Component/severity/location:** Truthfulness/documentation; Medium; `frontend/components/LiveVoiceAgent.js:485`; `backend/app/main.py:174`, `183`; `PRODUCTION_ROADMAP.md`.
- **Evidence:** Source-verified: UI asserts approximately 300 ms latency without metrics; public stats force at least 120 medicines and name a live partner regardless of a successful lookup. Roadmap still describes removed fake-backend-price and silent-mock behavior, while missing current frontend fallbacks. Summary counts include failed/simulated reminder logs.
- **Root cause/impact:** Presentation and documentation use constants/attempt counts instead of validated metrics and outcomes, misleading both reviewers and operators.
- **Solution/priority:** P1. Remove unmeasured speed/partner/verified claims, derive counts from provenance-backed rows, count outcomes by status and update documentation from current evidence. Verify outages do not report online/live/complete and unavailable metrics are explicitly unknown.

### ERR-033 — Broken reference submodule metadata

- **Component/severity/location:** Repository; Low; Git entry `agent/.reference-aushadh`.
- **Evidence:** `git submodule status` fails: no submodule mapping found. Main application source is accessible; reference contents were not audited.
- **Root cause/impact:** A tracked Git link lacks its mapping, making a clean reference checkout unreproducible. No runtime dependency on it was found.
- **Solution/priority:** P2. Determine whether the reference is needed; restore the correct original mapping only from known repository information or remove the reference intentionally after review. Do not invent a remote or clone over local work. Verify a clean checkout contains everything the documented build needs.

### ERR-034 — Missing authentication abuse limits and weak session isolation controls

- **Component/severity/location:** Security; High; `backend/app/auth.py:30`, `188`; `backend/app/main.py:188`, `198`, `113`; `frontend/lib/api.js:6`; `frontend/next.config.mjs`.
- **Evidence:** Source-verified: no login/upload/chat/call per-user rate limiter; bearer tokens last seven days without a server revocation/version mechanism; tokens live in localStorage; CORS permits all origins with credentials; outbound work has no cost budgets. An exploit or brute-force load test was not attempted. Stateless bearer APIs are not automatically CSRF-vulnerable; changing to cookies requires explicit CSRF defenses.
- **Root cause/impact:** Development-oriented access/session defaults have no deployment-level abuse and revocation boundary; credential theft or repeated requests can consume patient/API resources.
- **Solution/priority:** P0 for outbound limits, P1 for sessions. Add user/IP/resource quotas, stable production keys, short-lived/revocable sessions, explicit allowed origins and security headers. Prefer same-origin HttpOnly secure cookie sessions with CSRF protections when appropriate. Restrict/disable local-only `/agent/token` deployment and remove cross-identity voice-token fallback on authentication failure.
- **Verification:** Brute-force thresholds using synthetic accounts, invalid/expired/revoked sessions, CORS allowlist, cookie CSRF tests if adopted, unauthorized token minting and provider cost caps. Preserve patient/caregiver isolation tests throughout.

## Not classified as verified provider failures

- Populated provider settings were observed; validity, quotas, template approvals, trunk verification and regional reachability were not tested.
- No real handwritten OCR accuracy or live voice p50/p95/audio jitter benchmark was performed.
- No actual WhatsApp delivery or real PSTN call was initiated.
- PostgreSQL runtime was not started; schema drift is a source/schema-test finding, not a measured production PostgreSQL outage.
- Python vulnerability scanning was not completed: pip-audit is not installed. Passing pip check is dependency consistency only.
- A successful build/test suite does not validate clinical safety, paid integration availability or production readiness.
