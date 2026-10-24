# Feature status

Audit window: 2026-10-24/25. Status applies to the stated scope, not an entire product certification. A = fully functional/production-compatible **only after the stated critical path is verified**; B = functional with sandbox/test limitations; C = requires credentials/approval/infrastructure; D = demonstration-only; E = broken/incomplete. No complete application feature is certified production-ready by this audit.

| Feature | Verification status | Category now | Evidence and limits |
|---|---|---|---|
| Password registration/login | VERIFIED WORKING in isolated backend tests | B | Real rows, password hashes, duplicate rejection, own bearer token; frontend fallback remains ERR-004 |
| Patient/caregiver authorization | VERIFIED WORKING for tested links; VERIFIED BROKEN global trigger | B/E | Existing 21 caregiver checks pass; ERR-002 bypasses action scope |
| Newly registered caregiver onboarding | VERIFIED BROKEN | E | Register 201 then identity 403; no invite/link flow |
| Google authentication | Mocked claim validation VERIFIED WORKING; real sign-in NOT TESTED | C | Local backend client ID not configured; requires matching Google OAuth setup |
| Demo identities | Backend opt-in mechanism VERIFIED by tests; local enablement not configured | D | Default disabled, production rejects flag; frontend credentials are bundled and auth fallback must be removed |
| Logout/session revocation | Browser token removal inspected; revocation NOT IMPLEMENTED | E | Device-local records remain; 7-day stateless bearer sessions |
| Image preprocessing | VERIFIED WORKING on synthetic images | B | EXIF/contrast/downscale tests; geometric deskew and real handwriting evaluation absent |
| OCR vision provider | NOT TESTED live | C | Configured provider values exist; no billable inference made |
| OCR review/activation boundary | VERIFIED BROKEN | E | Unconfirmed upload creates active medicines and doses |
| Catalog matching agent | Synthetic tests pass; safety gaps source-verified | E | 81 entries, inferred suffixes/conflicting salts need review gating |
| Dosage/confidence agent | Deterministic tests pass; QID/PRN behavior incomplete | E | Heuristic confidence not calibrated; four doses collapsed |
| Human confirmation/reconciliation | Existing graph path tested; system-wide gate VERIFIED BROKEN | E | Confirmation persists, but downstream eligibility ignores confirmation |
| Fifth independent LLM/RAG agent | NOT IMPLEMENTED as described | E | Five graph nodes are not five LLM calls; explain_rag explicitly absent |
| Real pharmacy price fetch | NOT TESTED; BLOCKED BY ACCESS PERMISSION | C | Published terms prohibit automated access; use approved feed/API |
| Backend unknown-price handling | VERIFIED WORKING in tests | B | Does not consume estimated pharmacy MRP; frontend still fabricates fallback prices |
| Price comparison/savings | VERIFIED BROKEN by contract/source trace | E | First-result/product/pack mismatches; v1 comparison absent |
| NPPA data | Local reference catalog inspected; official freshness NOT VERIFIED | C/E | 119-row combined dataset, no complete document/effective-date provenance |
| Jan Aushadhi data | Current official portal located; installed values NOT VERIFIED current | C/E | Old ProductList.aspx link renders 404; current product page has export controls |
| Price prediction model | NOT PRESENT | E if advertised | No trained estimator or evaluation artifacts; estimates must remain separate if later added |
| WhatsApp medication scheduler | Synthetic tests pass; persistence/eligibility gaps VERIFIED | E | 30-second poll, five-minute window, no distributed claims/catch-up |
| 48-hour appointment WhatsApp reminder | NOT IMPLEMENTED | E | Current WhatsApp path handles medication slots; follow-up uses calls |
| Immediate WhatsApp button | Backend send path mocked; live delivery NOT TESTED | C/E | Requires scoped consent/allowlist/template policy; v1 UI can fake action success |
| WhatsApp inbound buttons | Sender-scoping tests VERIFIED WORKING | B | Signature enforcement, replay, text negation and delivery status need fixes |
| WhatsApp text confirmation | VERIFIED BROKEN | E | `nahi li` becomes taken |
| LiveKit voice token/dispatch structure | SDK/source inspection; no live room test | C | Backend runtime manifest incomplete; do not use local unauthenticated token fallback in deployed app |
| Sahayak prompt/tools | Prompt and mock tool tests present | B | Live hallucination, medical grounding and multilingual behavior NOT TESTED |
| Voice worker process readiness | VERIFIED BROKEN self-test in this environment | E/C | Spawn timeout twice; real 90-second worker startup/audio not proven broken or working |
| Murf/Deepgram streaming configuration | VERIFIED supported by installed signatures | B/C | 1.8.3 supports current parameters; actual credentials/voice/region/audio not tested |
| Voice latency/audio quality | NOT TESTED live | C | No measured first-audio p50/p95, packet loss or reconnect rate; 300 ms claim unsupported |
| Twilio/LiveKit SIP calling | Mocked dispatch tests VERIFIED WORKING | C | No real trunk/number/answer/audio validation performed |
| Exact 48-hour calling | VERIFIED INCOMPLETE | E | Date-only plus-two-day query, no exact appointment timestamp |
| Immediate demo call | VERIFIED BROKEN in local prescription UI | E | Fixed timer lifecycle and fallback completion; real action needs explicit authorization |
| Reschedule preference | VERIFIED WORKING in synthetic backend tests | B | Records a request only; clinic-notified claim is false; confirmed booking absent |
| OSM/Leaflet rendering | VERIFIED WORKING map/markers in browser | B | One map and four fixture markers; not verified live facility data |
| Genuine nearby facility search | Active screen VERIFIED BROKEN | E | Missing v1 backend; older live Overpass component is a separate path |
| GPS permission/manual location | Browser GPS not exercised; source gap VERIFIED | E | City ID overrides GPS; no complete manual origin flow; old component mislabels Pune fallback |
| Route navigation | VERIFIED BROKEN | E | No routing backend; constant route is shown as verified |
| Frontend production build | VERIFIED WORKING | B | Next build passes; security advisories remain |
| Frontend responsiveness/accessibility | Partially inspected, NOT comprehensively tested | C | No controlled mobile/keyboard/screen-reader audit or INP benchmark |
| SQLite migrations/recovery regression | VERIFIED WORKING with init_db on temporary files | B | Alembic-only/PostgreSQL drift is a separate defect; user database not changed during audit |
| PostgreSQL deployment | NOT TESTED live | C/E | Compose exists for DB only; schema migration gaps must be fixed |
| Dependency consistency/security | npm audit 0 vulnerabilities (Next 15.5.28, PostCSS 8.5.31 overrides); Python pip-audit baseline recorded (13 vulnerable packages) | B (Frontend resolved / Backend baseline recorded) | Batch 1A resolved all 5 npm vulnerabilities; pip-audit report saved |

## Test interpretation

All 11 existing backend scripts passed. Agent follow-up prompt tests passed. Agent test_agent.py failed with a Windows spawn timeout, including a serial rerun. A passing mock dispatch test does not validate a live phone call; a passing synthetic OCR pipeline test does not validate handwritten medicine recognition. Detailed raw logs and current probe results are under `evidence/`.

## Required real-service gates

Classify every demo screen/result at runtime as live, source-dated cached, synthetic sample, unavailable, or failed. A demo identity can use synthetic appointments and a clearly marked sample prescription, but prices/maps/provider outcomes must retain their own truthful provenance. Never promote category D identity/sample behavior into simulated successful category A messaging, calling or medical extraction.
