# Controlled implementation plan

Audit window: 2026-10-24/25. **Not implemented. Approval is required before editing application code**, as requested in Stage 6. Existing architecture should be retained. Each batch below has a small, independently testable outcome; do not combine dependency migration, scheduler redesign and UI redesign into one change.

## Release decision and dependencies

Do not expose the current server to a public demo audience or genuine patient traffic until the P0 defects are addressed. Local mock tests are useful engineering evidence, not permission to demonstrate simulated provider success as live.

Order: dependency/security containment and truthful identity/data -> patient/review gates -> reproducible schema/runtime -> provider status and outbound consent -> persistent scheduling -> voice/map measurement and optimization -> verified pricing ingestion -> frontend refinement -> full rehearsal. Data acquisition and provider approvals can proceed independently, but no billable send/call/inference is implied by audit approval.

## Batch 1A — Dependency security, without application redesign [COMPLETED]

- **Issues:** ERR-003. Priority P0. Status: COMPLETED.
- **Outcome:** A supported patched frontend dependency graph. Next upgraded to 15.5.28 with overrides for PostCSS 8.5.31 and postcss-selector-parser 7.1.7. Zero npm audit vulnerabilities. Production build passed. Regression test suite added (`npm test`). pip-audit baseline recorded.
- **Files:** frontend/package.json, package-lock.json, next.config.mjs and only API/rendering compatibility files proven necessary.
- **Dependencies/approvals:** Public registry access; no provider keys. Do not run automatic `--force` upgrades.
- **Checks:** Audit dependency paths, production build, API proxy body/error/header handling, dynamic imports, routing, hydration and smoke tests on Windows. Python vulnerability scanning must be added separately; pip check is insufficient.
- **Risk/rollback:** Major Next changes can alter route parameter/caching semantics. Keep the original lockfile and branch; revert the dependency batch if correctness fails. Do not revert to an exposed vulnerable server as the deployment solution.

## Batch 1B — Truthful authentication and explicit demo entry [COMPLETED]

- **Issues:** ERR-004/005/012/026/034. Priority P0. Status: COMPLETED.
- **Outcome:** Real registration/login gates patient UI; outages fail visibly. Canonical client contract with real error statuses. Explicit demo entry uses real backend auth and selectable demo accounts; no silent Ramesh auto-login. IndexedDB multi-tenant partition prevents report leakage; sensitive cache cleared on logout. Caregiver identity decoupled from patient link requirement on /api/auth/me with onboarding state.
- **Files:** frontend/app/app/page.js, app/api/[...slug]/route.js, lib/api.js, lib/client.js, components/Login.js, components/Caregiver.js, frontend/app/prescriptions/[id]/page.js, frontend/components/views/HistoryView.js, lib/indexedDb.js, backend/app/auth.py, backend/app/main.py, backend/test_caregiver.py.
- **Steps:** Inventory every client URL against OpenAPI. Remove unconditional fixture success. Preserve unavailable/401/403 statuses. Use an auth loading state, then real account state. Separate actor identity from selected patient. Partition/clear sensitive offline cache; make server report IDs canonical. Keep caregiver registration disabled or show unlinked onboarding until the invitation flow exists.
- **Environment:** Existing ENABLE_DEMO_ACCOUNTS is development-only and production rejects true. Proposed DEMO_ACCOUNT_EMAIL/PASSWORD/seed-profile settings would be new; do not assume they already exist. Load demo credentials through protected setup, never bundle real secrets. Provide judges a documented nonprivileged demo credential via the demo setup mechanism; publish only intentionally disposable credentials, with a rotation/disable plan.
- **Checks:** Valid/invalid login, new user, Google unavailable, empty account, logout/back/offline, separate A/B local records, demo account and linked/unlinked caregiver. Assert no fixtures on a real-user route in either development or production builds.
- **Rollback:** Feature-disable the newly connected screens rather than restoring fake success or leaking another identity.

## Batch 2 — Review gate, dosage and upload correctness

- **Issues:** ERR-001/010/011/013/023/025. Priority P0/P1.
- **Files:** backend/app/{models,schemas,main,graph,extraction,preprocessor,catalog,dosage,whatsapp}.py, affected migrations and scanner/review UI. Split upload validation, review activation and dosage representation into separate commits/tests.
- **Steps:** Verify decoded bounded uploads before providers. Validate a full structured extraction schema inside provider attempts. Treat missing/contradictory/suffix/fuzzy fields as unresolved. Store pending-review records, expose review fields/raw transcription safely, allow explicit correction, then atomically activate approved instructions. Never schedule PRN/unknown frequency; preserve exact administrations/quantities. Check expiry at eligibility time. Fix datetime response types.
- **Dependencies:** Agreed typed schedule schema and medically reviewed synthetic fixtures; no model replacement required. A labeled, consented/redacted handwriting corpus is needed before accuracy claims.
- **Checks:** Pending/rejected/uncertain records never dispatch; QID/q6h/PRN/half-tablets/combination ambiguity; bad images and oversized multipart never call providers; stop/list/resume contracts; model shape/date errors and timeouts. Existing graph tests must be supplemented, not merely changed to match implementation.
- **Risks/rollback:** Data migration must not convert old uncertain instructions automatically. Quarantine legacy pending records; preserve original extraction and user correction audit. Roll back API/UI together, retaining original records.

## Batch 3 — Reproducible runtime and explicit migrations

- **Issues:** ERR-014/015/033. Priority P1 before deployment.
- **Files:** backend requirements/lock, app/db.py, Alembic revisions, deployment scripts; reference Git metadata only after purpose/remote is established.
- **Steps:** Declare Pillow and optional/required LiveKit API dependencies explicitly. Resolve/pin environments without inheriting accidental local packages. Add migrations for six patient preference columns, three medicine reminder/stop columns and DoseAdherence, then constraints/defaults/indexes. Replace startup schema patching with a verified migration entrypoint. Keep SQLite suitable for one local worker; use PostgreSQL when deploying concurrent application/worker processes.
- **Environment:** DATABASE_URL, SECRET_KEY, ENVIRONMENT, DB_POOL_SIZE/MAX_OVERFLOW/RECYCLE. Do not copy development Compose DB credentials into production.
- **Checks:** Fresh manifest-only environments; empty and legacy SQLite/PostgreSQL upgrades to head; metadata diff with zero unplanned gaps; init/restart/idempotency; recovery regression and backup restoration. PostgreSQL was not available for runtime certification in this audit.
- **Rollback:** Tested data backup and migration strategy; never delete/reset user databases. Disable workers during incompatible schema rollout. Preserve SQLite DB and WAL together for consistent backups.

## Batch 4 — Outbound action authorization, truthful status and provider contracts

- **Issues:** ERR-002/006/008/009/018/019/020/029/034. Priority P0 for scoping; P1 for live services.
- **Files:** backend/app/{main,models,schemas,whatsapp,telephony,config}.py, agent/{voice,backend_client}.py, prescription detail/summary/caregiver controls.
- **Steps:** Remove global patient-trigger access. Add per-action consent/allowlist/confirmation/cooldown and unique attempt key. Demo clicks select one approved destination and one appointment/dose group; they never invoke a global sweep. Require production webhook HMAC. Record inbound message IDs, sender ownership and reply context. Handle negation/ambiguity before positive text matching. Store accepted/delivered/read/failed and dispatched/ringing/answered/ended/failed independently. Delete UI lifecycle timers and synthetic IDs/success. Reschedule language must reflect preference recording only.
- **Environment/approvals:** See configuration matrix. A genuine WhatsApp/telephone test requires separate explicit user authorization for recipient, message/call and any provider cost. Credentials being configured does not satisfy that requirement. Restrict test destinations and keep secret values out of logs and dispatch metadata wherever possible.
- **Provider details:** Approved utility templates outside the service window; opt-in/STOP persisted. Meta statuses are signature verified and idempotent. Twilio Elastic SIP Trunking outcomes must come from SIP/LiveKit infrastructure, not assumed Programmable Voice status callbacks. Persist LiveKit dispatch/room/participant IDs, bound dial/participant wait and set termination/retry policy. Check answering machine behavior and identity before mentioning the appointment; avoid disclosing health information to an unintended recipient.
- **Checks:** No credentials, wrong destination, no consent, rate limit, repeated clicks, two patients, 429/5xx/timeout, replay and out-of-order events; no fake delivered/completed state. Mock all sends first. After explicit authorization, one allowed real message and one allowed real call, with observed status/recipient confirmation.
- **Rollback:** Server-side outbound kill switch (new setting, not currently implemented); retain attempt records; stop dispatch, not validation. Do not revert to fake results.

## Batch 5 — Persistent appointment and medication scheduling

- **Issues:** ERR-016/017. Priority P1.
- **Model:** Appointment(id, patient_id, appointment_at_utc, timezone, state, version, confirmed_source). ReminderTask(appointment/dose identifier, channel, reminder_at_utc, offset, state, idempotency_key, lease_until, attempts, next_attempt_at, last_error). Channel consent is persisted separately with source and withdrawal timestamp.
- **Steps:** Migrate reviewed appointment times; leave date-only OCR follow-ups unconfirmed until time/timezone are supplied. Compute the configured offset deterministically. Use a single durable worker/outbox with database claims and unique keys; polling persisted rows is sufficient for this project if done correctly. Do not add Celery/Redis unless measured scale requires it. Recompute tasks on reschedule/cancel and verify eligibility again just before sending.
- **Quiet hours:** Decide whether reminders falling outside permitted hours defer to the next allowed time or send earlier. Display that the resulting time may differ from exactly 48 hours. Use user's IANA timezone with Asia/Kolkata default and store UTC instants.
- **Checks:** Due boundary ±1 second, restart past due time, concurrent workers, crashed lease, provider uncertain timeout, opt-out between claim/send, appointment version changes, DST for non-IST users, two same-date reports. Assert no duplicate actions and explicit late/deferred/failed status.
- **Rollback:** Pause worker, preserve old/new task records and schedule version; never let both legacy polling and new jobs dispatch concurrently.

## Batch 6A — Sahayak instrumentation and targeted latency/audio work

- **Issues:** ERR-027/028/031/032 plus tool latency. Priority P1 for readiness, P2 tuning.
- **Files:** agent/voice.py, chat.py, backend_client.py, config.py; frontend LiveVoiceAgent/Assistant; dedicated public-data tool projection in backend.
- **Steps:** First add redacted correlation/timing metrics and measure the unchanged pipeline. Diagnose Windows cold imports/prewarm and process readiness independently. Fix profile field names and browser cancel/reconnect lifecycle. Keep streaming STT/LLM/TTS and preemptive generation already present. Remove compulsory price/history waterfalls from record tools. Bound tool/model retries and context size. A/B supported VAD/turn/interruption/TTS pacing options with Hindi/English synthetic speech. Confirm configured Murf voice/model/style through authorized voice listing; do not assume a voice ID in a comment is available on this account.
- **Checks:** See PERFORMANCE_REPORT.md before/after protocol and provisional budgets. Validate microphone echo suppression, one audio track, short interruptions, false interruptions, noise, reconnect and two simultaneous sessions. Never suppress warnings to claim lower latency.
- **Privacy:** Explicit recording controls, aggregate metrics only by default; do not retain patient audio/transcripts just for benchmarking.
- **Rollback:** Feature flag each tuning change; revert to prior measured settings. Text fallback must report its own provider errors, not pretend a live voice session succeeded.

## Batch 6B — Genuine facility lookup, location, routing and map performance

- **Issues:** ERR-007/024/030. Priority P1 for correctness, P2 optimization.
- **Files:** backend geospatial endpoints (small module), frontend lib/client.js, StoresView, LazyStoreMap; retire duplicate path only after replacement covers existing needs.
- **Steps:** Use actual OSM/official facility records with provenance; include pharmacies/hospitals/clinics/medical shops using documented OSM tags and avoid calling every pharmacy a Jan Aushadhi Kendra. Backend may cache public POI results by area/type and TTL. Obtain GPS on intent, display permission/accuracy state, offer manual point/address selection using a permitted geocoder. Never substitute fixed coordinates as live location. Implement OSRM-compatible routing for the target India region, using self-hosted or a permitted hosted service with documented quotas; public demo endpoints are for bounded testing, not an unlimited backend.
- **UI:** One retained map instance; incremental markers, safe popup DOM, synchronized result cards and marker selection, genuine route polyline and provider distance/time, optional navigation-app link. Null phone/address/opening hours remain absent; stock status stays unknown.
- **Checks:** Real coordinate pair, denied/unavailable GPS, manual origin, route unavailable, external timeout, stale cancellation, synthetic malicious OSM tags, category filters, mount/unmount memory and mobile layout. Establish tile/data/render timings separately.
- **Rollback:** Disable directions when routing is unavailable; keep genuine list/provenance and source-dated cached results with explicit labels, never fictional routes.

## Batch 7 — Real pricing datasets and a unit-safe comparison engine

- **Issues:** ERR-021/022 and frontend contract gaps. Priority P1. Begin acquisition now; integration waits for source validation.
- **Principal categories:** Exactly (1) NPPA regulatory ceiling, (2) Jan Aushadhi official listed MRP, (3) authorized pharmacy/open licensed actual retail listing. No fourth synthetic-price fallback. No trained prediction model exists; an estimator would need separate labeling, uncertainty and evaluation and is unnecessary for the first reliable demo.
- **Schema:** Product/ingredient identity with normalized mass/concentration, form, release, pack count/unit and route where relevant. Price observation with category, amount/currency, original price basis, normalized unit price, source URL, source record/product/notification ID, publication/effective date, checked_at, expiry/staleness policy, source file hash, rights/usage basis and availability if genuinely supplied. Never use a notification date as an automatic proof of present effectiveness.
- **Matching:** Exact validated ingredient+strength+form+release before pack normalization. Preserve combination ingredient ratios and distinguish tablet/capsule/injection/syrup; never match only a brand prefix. Resolve conflicts by authoritative notification/version and retain history. Return incomparable/unavailable with a clear reason. Compute savings only between equivalent quantities of actual products; show ceiling in its own regulatory field.
- **Files:** New import/validation scripts and pricing tables/migrations; backend prices.py; price/search/result components and a single API schema; data source documentation. Do not hand-edit a large generated catalog as the ingestion pipeline.
- **Checks:** Table-based matching fixtures; official-source spot checks; duplicate/conflict/stale/missing/zero-MRP rows; mg/mcg/ml/concentration; 10/15/30 tablet packs; SR/IR; exact decimal arithmetic/currency; provider outage. All displayed values must trace to a stored source observation.
- **Rollback:** Versioned import batches with an active dataset pointer. Revert to a previously verified source-dated dataset, not invented current prices.

### Dataset acquisition findings and exact user fallback

1. **Jan Aushadhi:** The old `https://janaushadhi.gov.in/ProductList.aspx` used in code loads a 404 page in the browser. The current official location found is [Product List (Sorting-View)](https://janaushadhi.gov.in/product-portfolio/product-view-list). Search-indexed official content exposes Download Files / Download PDF / Download CSV and says zero-MRP products are under process. Browser navigation to that current list timed out during this audit; a valid current CSV/PDF was **not downloaded or imported**. Do not claim otherwise.
   - Open the [official home page](https://janaushadhi.gov.in/), choose **Product Portfolio -> Product & MRP List / Product List (Sorting-View)**, select the required category/all products, and use the site's **Download CSV** and **Download PDF** controls.
   - Save the unmodified files with the download date. Include the exact page URL and any visible revision/update date; if none is shown, say unknown. Supply those files in `docs/audit/data-inbox/pmbjp/` (create the directory when supplying files). Do not send patient data.
   - Zero-MRP/under-process products are unavailable, not free. Download permission does not automatically establish every redistribution right; preserve applicable official terms.
2. **NPPA:** The [official circular/order index](https://nppa.gov.in/en/view_more?id=4) is search-index accessible but a direct retrieval returned 502 in this audit. It lists final notifications and separate drafts, including the March 2026 WPI revision for 767 NLEM 2022 formulations and later formulation-specific notifications. A final current consolidated dataset was **not downloaded**.
   - Open NPPA -> Circulars/Orders/price notifications. Download the **final ceiling-price notification PDFs** covering demo formulations, their later revisions/corrigenda, and the current WPI adjustment applicable to them. Do not use draft calculation sheets as final prices.
   - Supply unmodified PDFs under `docs/audit/data-inbox/nppa/`, with exact source URL, notification number, publication/effective date if given, and download date. A full national catalog is unnecessary for the first demo; a small officially verified subset is preferable to an unsupported large list.
3. **Actual retail prices:** PharmEasy's [published terms](https://pharmeasy.in/legal/terms-and-conditions) prohibit automated access. Its current internal endpoint was not queried in this audit. No current, correctly licensed India-wide actual retail-price feed was validated. Do not use a Kaggle/GitHub mirror without proving provenance and redistribution rights.
   - Obtain a permitted pharmacy API/partner export or a written-authorized CSV from a participating pharmacy containing product ID/name, composition, strength/form/release, pack, MRP, actual selling price, currency, observed date, location/availability and source/license/permission. Supply a redacted permission reference with the public product file under `docs/audit/data-inbox/pharmacy/`.
   - Until then, show **Price unavailable** for actual retail and suppress retail-vs-generic savings. Official PMBI MRPs and NPPA ceilings can still be shown honestly as their own categories after validation.

Public download attempts and official research do not authorize importing arbitrary sources, scraping prohibited sites, or representing stale data as live. These acquisition blockers do not prevent implementing the schema/tests with clearly labeled synthetic fixtures after approval.

## Batch 8 — Frontend polish, measurable loading and full demo rehearsal

- **Issues:** ERR-028/030/032, remaining source/UI gaps. Priority P2 after functional gates.
- **Steps:** Profile chunk graph (314 kB first load for /app), defer eagerly imported caregiver voice code where supported, avoid fixture-to-real account flashes and request waterfalls, cache public data appropriately, paginate histories, fix object URL/map/audio teardown and preserve loading/error/empty states. Retain the existing visual system; prioritize contrast, focus, keyboard actions, clear review and provider status over animation changes.
- **Checks:** Desktop/mobile cold/warm traces, accessibility/keyboard, LCP/INP/CLS, network-offline/reconnect, new-user and explicit-demo flows, no sensitive service-worker caching, production build, backend/agent tests and negative provider cases. Add CI with separate isolated processes because existing suites mutate environment/module globals.
- **Rollback:** Revert individual lazy-load/UI changes if hydration/accessibility/regression metrics worsen. Keep correctness/data provenance fixes.

## Integration configuration and authorization matrix

Existing variables below are references, not values to paste into reports. “Present” means populated locally, not validated. Never send keys in chat.

| Integration | Existing variables | Outstanding requirements |
|---|---|---|
| Core | ENVIRONMENT, DATABASE_URL, SECRET_KEY, DB_POOL_* | Stable production secret, backup/restore, explicit migration deployment, Python scan |
| Demo | ENABLE_DEMO_ACCOUNTS; agent AAYOGYA/AAROGYA_DEMO_IDENTIFIER/PASSWORD aliases | Local backend default disabled; agent credentials blank; isolated synthetic identity, rotate/disable outside demo |
| Google login | GOOGLE_CLIENT_ID | Not present in local backend env; matching OAuth origin/audience and real browser verification |
| OCR | OLLAMA_URL/MODEL, GROQ_API_KEY/MODEL, HF_TOKEN/MODEL, GEMINI_API_KEY/MODEL, ENABLE_MOCK_EXTRACTION | Valid supported model/vision capability, data-processing permission, quotas and explicitly authorized test inference |
| Agent HTTP | AGENT_CHAT_URL, agent AAYOGYA_BACKEND_URL/AAROGYA_BACKEND_URL; GOOGLE_API_KEY/GEMINI_API_KEY, GEMINI_MODEL | Private service boundary, bounded retry/context, startup and readiness; no unvalidated demo token access |
| Speech | LIVEKIT_URL/API_KEY/API_SECRET, DEEPGRAM_API_KEY/MODEL, STT_LANGUAGE, MURF_API_KEY/VOICE/LOCALE/STYLE/MODEL | Keys present locally, not validated; model/voice entitlement, region and budget; audio test authorization |
| WhatsApp | WHATSAPP_API_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN, APP_SECRET | APP_SECRET absent locally; approved template/opt-in/window/status webhook and allowed opted-in test recipient |
| Calls/SIP | LIVEKIT_SIP_TRUNK_ID or TWILIO_SIP_DOMAIN/USERNAME/PASSWORD; LIVEKIT_AGENT_NAME; TWILIO_ACCOUNT_SID/AUTH_TOKEN/PHONE_NUMBER | Provider/trunk validation, allowed verified destination, recipient consent and explicit dialing/cost approval |
| Unused/misleading call config | TWILIO_ENABLE_AMD, TWILIO_STATUS_CALLBACK_URL | Values existing does not implement AMD or lifecycle callbacks; design for actual selected SIP topology |
| Frontend proxy | BACKEND_ORIGIN, AGENT_ORIGIN, NEXT_PUBLIC_BACKEND_URL | Correct private origins, restricted rewrites, error propagation and headers |
| Pricing/map | No complete ingestion/routing integration variables currently | Proposed source paths/provider endpoint/timeouts/cache/limits are new settings; agree only after provider selection |

## Batch approval and release gates

Approve batches by number/scope. Recommended first authorization: 1A, 1B and the scoped P0 parts of 2/4, with provider actions still mocked. Each batch must deliver: diff review, focused new regression tests, existing relevant suites, contract checks, a brief before/after evidence note and a rollback path. Broaden testing only for new changes/failures. Before the final demonstration, complete DEMO_READINESS_CHECKLIST.md and obtain separate explicit authorization for each real external demonstration action.
