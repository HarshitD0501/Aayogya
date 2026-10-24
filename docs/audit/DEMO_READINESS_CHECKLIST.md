# Honest hackathon demonstration checklist

Audit window: 2026-10-24/25. **The current application does not pass this checklist yet.** This is a proposed rehearsal path following approved fixes, not a claim that the checked items already work. No real outbound test is authorized by this document.

## 1. Before public access

- [ ] Resolve P0 dependency advisories, particularly the affected Windows-hosted Next.js release. Keep the current audit server local only.
- [ ] Remove synthetic login/OCR/price/route/action success from real-user paths. Unavailable integrations display their actual state.
- [ ] Close global scheduler-trigger authorization; gate all outbound actions by patient scope, recipient opt-in/allowlist, confirmation, rate/cost limits and idempotency.
- [ ] Enforce human approval before medicines become active, priced as confirmed products, or eligible for reminders. Unknown QID/PRN/strength/composition remains unresolved rather than invented.
- [ ] Enforce production webhook signatures and secret redaction. Preserve the existing patient/caregiver isolation checks.
- [ ] Verify fresh schema/runtime installation, database backup and restoration; do not run concurrent legacy/new schedulers.
- [ ] Set demo environment deliberately; provision disposable nonprivileged synthetic identities using protected setup and real backend login. Disable/rotate them after the event; production config must reject demo enabling.
- [ ] Keep patient documents, tokens, phone numbers and recordings out of screen shares/logs. Use a synthetic sample prescription/appointment explicitly labeled as such.

## 2. New-person flow: demonstrate genuine isolation

1. Open a fresh browser profile, register a new test person through the real backend and log out/in.
2. Confirm their account starts empty; no synthetic patient replaces them during loading, outage or refresh.
3. Show that their history/medicines are account-owned and persist after restart. In a second profile verify another account cannot read or act on those records.
4. If showing caregiver access, use explicit patient-issued consent. An unlinked caregiver sees onboarding, never default access to another account.
5. Use the explicit **Use Demo Account** path only for the separately labeled synthetic demo identity. Do not hardcode real credentials into a frontend build.

## 3. Prescription and pricing demonstration

- [ ] Use a clearly labeled sample prescription containing no genuine patient identifiers. If running real OCR, obtain explicit authorization for the selected provider and any cost first.
- [ ] Show the original transcription, medicine/strength/form/frequency/duration confidence and uncertain fields. Correct or leave uncertain data unresolved.
- [ ] Before confirmation prove it has no active scheduled reminders. Confirm the reviewed instructions and show only those medicines become eligible.
- [ ] For three chosen demo medicines, reconcile NPPA regulatory ceiling and PMBI MRP to downloaded official source documents, product/notification IDs, pack/unit and dates. Show those categories separately.
- [ ] Use an authorized actual pharmacy listing if available; otherwise display **Price unavailable** and omit retail savings. Never use predicted/estimated/dataset fallback values as actual selling prices.
- [ ] Demonstrate different packs only with a genuine normalized price/unit comparison; unknown form/release/composition is incomparable.
- [ ] Show a known limited interaction rule and a no-match result with coverage limitations; never claim the three starter rules certify medication safety.

## 4. Sahayak voice demonstration

- [ ] Start and warm the worker before judges arrive. Verify process readiness on this Windows machine rather than relying on the failing 15-second self-test.
- [ ] Validate permitted model/voice/locale with the account, and confirm region/budget. Do not expose provider keys on screen.
- [ ] After explicit authorization, test microphone, speaker, headphones, Hindi/English short turns, a record tool, a meaningful interruption, background noise, mute and reconnect.
- [ ] Capture actual first-audio latency and tool latency, p50/p95 only when enough real samples exist. Remove the unverified “~300 ms” label.
- [ ] Confirm no duplicate audio, no stale microphone/room after cancel or tab switch and no repeated greeting mid-session.
- [ ] Verify agent failures explain unavailable records/tools without inventing medicines, appointments or clinic notifications. Introduce the agent as an AI assistant.
- [ ] Keep a truthful text mode as a fallback. A provider-unavailable text response is acceptable; a prerecorded or synthetic conversation must be explicitly labeled if separately shown.

## 5. Immediate WhatsApp test

- [ ] Select one allowed verified recipient who has explicitly opted in. Mask the destination in the confirmation UI and obtain the user's separate authorization to send the actual test message.
- [ ] Check service-window eligibility or use the account's approved utility template. Confirm tokens, phone ID, signing secret and HTTPS webhook route.
- [ ] Click once; show request accepted separately from delivery/read. Persist the actual provider message ID, without printing it unnecessarily.
- [ ] Reply using both buttons; test `nahi li`/negative language without recording a dose as taken. Replayed events must not update another slot or send another reply.
- [ ] Verify STOP prevents future messages. The demo button must not trigger other patients' medication/appointment reminders.
- [ ] On provider outage/rejection show failure/unavailable; do not call simulation a delivered message.

## 6. Immediate call and 48-hour schedule

- [ ] Create an explicitly synthetic appointment for the demo identity with a reviewed timezone-aware timestamp. Display appointment time, offset and computed reminder time.
- [ ] Show persisted scheduled state and restart recovery with provider actions mocked; do not fake waiting 48 hours. Demonstrate due-time correctness with an explicitly labeled clock-controlled test, separate from the immediate real call.
- [ ] For the actual demo call, select an approved verified test destination and get separate explicit dialing/cost authorization, including recipient confirmation.
- [ ] Confirm worker readiness/trunk routing, quiet-hours policy, caller ID and limits. Use one unique action key to prevent double clicks from dialing twice.
- [ ] Show only actual dispatch/ringing/answer/end/failure states derived from the selected SIP/LiveKit topology. No frontend timers drive call status.
- [ ] Agent verifies intended recipient before mentioning appointment/health details. Busy/no-answer/voicemail/error follows the approved retry policy; do not flood calls.
- [ ] Record a reschedule preference as requested, not booked or clinic-notified unless a real integration proves it. Cancellation/reschedule invalidates obsolete tasks.

## 7. Map and navigation

- [ ] Use genuine OSM or official facility data; remove fixed fake verified stores, phone numbers and distances.
- [ ] Grant location on intent and show permission/accuracy state. On denial use manual point/address selection; never label a city center as live GPS.
- [ ] Confirm nearby pharmacies and healthcare facilities use the selected coordinates. Null phone/address/hours stays blank and stock remains unknown.
- [ ] Select a result and verify card/marker synchronization, actual route polyline, provider distance/time and navigation-app option.
- [ ] Test denied GPS, unavailable route, slow/missing tiles and failed facility lookup. Keep a genuine source-dated list with a clear unavailable map/routing state if needed.
- [ ] Preserve OSM attribution, correct tile usage/caching and rate limits. Do not bulk-prefetch tiles for the event.

## 8. Final rehearsal and contingencies

| Failure | Truthful contingency |
|---|---|
| OCR provider unavailable | Explain outage; use a separately selected, clearly labeled sample extraction for UI walkthrough only, or reviewed manual entry. Never attach sample output to a real uploaded prescription |
| Pricing source unavailable | Display verified source-dated cached official values with provenance; retail unavailable; no inferred savings |
| Voice provider unavailable | Show current availability and tested text mode if available; no fake live conversation |
| WhatsApp API rejection | Show actual failure and explanation. A separately labeled local webhook test may demonstrate logic, not delivery |
| SIP/trunk failure | Show actual call failure and recorded attempt; explain schedule architecture using persisted mocked test evidence |
| Map tiles unavailable | Real result list and external navigation link; clearly state map/routing availability |
| Backend/database unavailable | Sign-in/data unavailable; no synthetic patient, price or success fallback |

- [ ] Re-run production build, all backend suites, separate agent prompt/tool and worker readiness tests, new negative regressions and desktop/mobile smoke tests.
- [ ] Review remaining exceptions openly with category/status labels. No public production-ready claim while critical paths remain untested.
- [ ] After the demo: disable disposable credentials/test routes, stop scheduled jobs for sample appointments, withdraw test consents as requested, delete unnecessary synthetic test artifacts and rotate intentionally shared demo credentials.
