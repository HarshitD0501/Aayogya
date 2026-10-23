# Frontend owner: five-page PWA implementation guide

**Status:** Handoff only; app code is not present yet. Own this folder and the visual design. Use [`../DESIGN.md`](../DESIGN.md) for product content, [`../docs/API_CONTRACT.md`](../docs/API_CONTRACT.md) for server shapes, and [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for Git discipline. Do not invent a sixth feature/page or medicine facts to make a screen look complete.

## Ownership and stack

Build a Vite + React + TypeScript PWA. Keep the first-search bundle small: load Leaflet only on `/stores`, scan code only on `/scan`, and print styling only when needed. Use a typed API client, route-level error boundaries, accessible semantic controls, and browser IndexedDB for local report summaries. The service worker caches the app shell only; the public versioned catalogue may be stored separately in IndexedDB for stale-labelled offline suggestions. Never service-worker-cache private API responses or OSM tiles. `VITE_API_BASE_URL` is the sole planned public environment value; it contains no secret.

The frontend owner chooses colors, spacing, typography, illustrations and component style. The **required content hierarchy** is savings first when fully verified, then molecule/strength/form/pack, source/date, and disclaimer. For unverified rows, show “No verified comparison available” instead of a made-up hero number.

## Five routes and their content

| Route | Must show | Calls and local work |
| --- | --- | --- |
| `/` | Permanent search, live typo-tolerant candidates, selected exact product/brand, price hero, NPPA if applicable, source/date, medical disclaimer, add-to-report and Scan/Store actions. | `GET /search`, `POST /compare`; debounce and cancel stale requests. |
| `/scan` | Camera/file upload, preview/progress, raw OCR, unconfirmed candidates, manual correction, exact selection, optional manual checkup details. | `POST /ocr`, then `/search` and `/compare`; never auto-confirm. |
| `/prescriptions/:id` | Confirmed rows, basket and exclusions, print slip, reminder time/end-date controls, optional confirmed checkup, Call Patient button, real statuses. | IndexedDB + `/compare`, `/reminders`, `/calls`. |
| `/stores` | City/geolocation choice, list before map, verified Kendras separate from pharmacies/clinics/hospitals, address/hours/contact when known, route geometry/steps. | `/cities`, `/stores`, `/routes`; dynamic Leaflet import. |
| `/history` | Device-local reports, dates, re-open/reprint, sum clearly called **estimated potential savings**. | IndexedDB; no auth or backend history API. |

Navigation has Search, Scan, Stores and History; the detail page opens from a confirmed report. No phone-number field: the backend calls and messages only the configured test recipient. No login or account sync.

## Required UI states and copy

- Every async section has loading, success, empty, ambiguous, timeout/offline and retry. Do not show stale results as current without a “last checked” label.
- Search suggestions expose strength/form/release type/pack and let the user choose with keyboard or touch. A fuzzy score is never called medical confidence.
- Display each price with unit and source date. `null` means “not verified”; market and PMBJP prices must be comparable before showing saving and basket total. NPPA is a separate value.
- OCR text and model candidates carry a visible **unconfirmed** label. Confirmation requires user action. Manual search remains on screen when upload, OCR or model fails.
- Reminder UI requires medicine label, user-confirmed instruction, local daily time, `Asia/Kolkata` timezone, end date and consent. The button saves a real schedule; status changes only from server response/webhook. Do not provide a fake “demo sent” path.
- Checkup UI requires date, time and place entered/reviewed by user. Enable Call Patient only after confirmation. Clicking starts an immediate real call; show requested → ringing → answered → completed/failed based on backend status. Disable repeat taps while pending.
- Use this disclaimer at every comparison and print: **“Informational only — confirm with doctor or pharmacist before substituting.”** Provide equivalent Hindi copy. Explanations never tell the patient to switch medicine.

## Phase sequence: test, commit, then continue

### F0 — Boot and navigation

Create the Vite/React/TypeScript app in this folder with exactly the five routes, shared layout, language switch scaffolding, typed fetch client, error boundary, PWA manifest and service worker policy. Create route shells with honest “not connected yet” states, not fake medicine cards. Add `.env.example` with only `VITE_API_BASE_URL`.

**Check:** install/build succeeds, direct route refresh works locally, keyboard navigation reaches all four primary links, no secret in `dist`. **Commit now:** `chore(frontend): scaffold accessible five-page PWA`. Do not start F1 before committing F0.

### F1 — Manual search and comparison (first judge milestone)

Connect debounced `GET /search`, cancel stale requests, show multiple exact strengths/forms, then call `POST /compare` only after user selects medicine and brand. Read `/catalogue/public` with ETag for an IndexedDB cache of offline **suggestion labels only**; mark them stale and do not calculate a new comparison offline. Render market→PMBJP hero only for complete comparable data, NPPA separately. Show price unit/source/date, missing-data and error states. Preserve typed query on failure.

**Check:** typo, molecule, missing strength, no match, missing market price, strength mismatch, offline/503 and keyboard selection. **Commit now:** `feat(frontend): add verified medicine search and savings view`.

### F2 — Scan and review

Add camera/file input with supported type/size hints, preview, explicit upload, progress/cancel, raw OCR text and candidate cards. Each candidate opens the same manual search/selection flow. Provide correction field permanently. Do not generate or activate reminders from raw OCR. Checkup details may be entered manually and marked confirmed.

**Check:** printed-box image, blurry/handwritten image, unsupported/oversized file, OCR timeout, model-unavailable response, manual recovery. **Commit now:** `feat(frontend): add OCR review and manual correction`.

### F3 — Confirmed report, basket and counter slip

Store a versioned confirmed report summary in IndexedDB using a local UUID; include selected catalogue IDs, quantities, dated comparison snapshot and user-confirmed text, **not** image/raw OCR. Detail page recalculates when online, displays incomplete rows and basket exclusions, and supports browser print/PDF. Print only confirmed molecule/strength/form/product code with disclaimer; unknown code displays “Not verified.”

**Check:** multi-item sum, one missing price, reload/restore, unknown local ID, browser print preview, narrow phone print layout. **Commit now:** `feat(frontend): add local reports basket and chemist slip`.

### F4 — Store locator and route

Add city selector and optional geolocation, list-first results, filters/labels that distinguish Kendras from other places, and lazy-loaded Leaflet map with OSM attribution. Draw server route GeoJSON and steps. Display driving only when API profile is driving; show no route when service fails. Do not preload or save OSM tiles for offline use.

**Check:** geolocation allowed/denied, city search, zero Kendras, phone-width list, map loading failure, route unavailable and correct attribution. **Commit now:** `feat(frontend): add Kendra locator and verified routes`.

### F5 — History

List local reports and estimated potential savings from comparable lines only; open/reprint reports. Explain that history is on this device and browser-data clearing removes it. Provide delete with confirmation and recompute aggregate after deletion. Avoid a login or cross-device sync promise.

**Check:** empty history, several reports, stale-price label, delete/cancel, browser reload and no original image in IndexedDB. **Commit now:** `feat(frontend): add device-local report history`.

### F6 — Live reminder and immediate call controls

On detail page, build confirmed reminder form and call action against the exact API contract. Use `idempotency_key` for duplicate-click safety. Store per-action management tokens in IndexedDB and send them only in an Authorization header for status/cancel. Poll or refresh status with sensible backoff while visible; stop after terminal state. Show accepted/sent/delivered correctly. Limit a schedule to the documented 30-day maximum and explain that a verified `STOP` reply cancels reminders if browser data is lost. A call without confirmed checkup fields is disabled with a clear reason. No number input and no simulated success.

**Check:** missing consent/end date, two daily times as two records, cancel reminder, provider 503, duplicate click, no checkup, real call ringing/answered/failed status. **Commit now:** `feat(frontend): connect live WhatsApp and call actions`.

### F7 — Final quality and deployment

Finish Hindi/English strings, readable numbers, screen-reader status, touch/keyboard focus, 360px/200% zoom, poor-signal and offline shell. Make the PWA installable over HTTPS. Deploy Cloudflare Pages with **root `Frontend`**, command `npm run build`, output `dist`, and public `VITE_API_BASE_URL`. Test deep links and a phone install.

**Check:** production build, five-page smoke path on laptop and phone, no private API response/service-worker cache, no secret in frontend bundle, actual API failures handled. **Commit now:** `chore(frontend): polish accessibility PWA and deployment`.

## Handoff to teammates

Tell Backend owner immediately if a required API field or error state is missing; submit an API contract update first. Tell Agent owner which call statuses and checkup fields must be spoken. Record exact browser/device and test result in each PR. Do not mark the WhatsApp/call demo complete until the handset actually receives/answers.
