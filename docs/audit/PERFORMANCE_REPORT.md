# Performance baseline and optimization plan

Audit window: 2026-10-24/25, Windows, Python 3.11.9, Node 22.22.3, Next.js 14.2.35. **No performance changes were implemented.** Measured numbers below are local observations, not service-level guarantees. Synthetic/provider-mocked runs are identified explicitly. Some build/test activity overlapped; repeat final benchmarks on an otherwise idle target machine before setting a release baseline.

## Measurements obtained

| System/test | Result | Conditions and limits |
|---|---|---|
| Frontend production build | Pass | All nine static pages generated; webpack cache snapshot warnings occurred, compilation completed |
| `/` first-load JavaScript | 166 kB | Next build report; route size 12 kB, shared first-load 87.9 kB |
| `/app` first-load JavaScript | 314 kB | Route size 165 kB; biggest reported route despite dynamic tool tabs |
| `/stores` first-load JavaScript | 115 kB | Route size 7.1 kB; lazy Leaflet and tiles add runtime work |
| `/scan`, `/search`, `/history` first-load JS | 119, 118, 109 kB | Build estimates, not observed wire bytes on every visit |
| `/prescriptions/[id]` first-load JS | 118 kB | Server dynamic page plus client logic |
| `/stores` browser navigation | TTFB 693.7 ms; DCL 1,490.4 ms; load event 1,492.7 ms | One cold local production-server observation on port 3017; these are not LCP or map-readiness timings |
| Cities/store requests | 935.8 ms and 1,015.0 ms | Browser requests to missing `/api/v1` routes; independent manual browser fetches confirmed HTTP 404 |
| OSM tile resource durations | Approximately 3,950–8,338 ms | One `/stores` visit; cross-origin `transferSize=0` cannot establish byte count/cache status or distinguish every failed/cached request. Not a community-server SLA |
| Backend `/` | p50 4.241 ms, p95 7.825 ms | 30 in-process TestClient requests, temporary SQLite, no network transport |
| Backend `/api/public/stats` | p50 9.278 ms, p95 16.370 ms | Same synthetic test, n=30 |
| Backend `/api/adherence/today` | p50 16.544 ms, p95 22.635 ms | Same synthetic test, n=30; this endpoint can write adherence rows |
| Existing backend suites | All 11 script files passed | Per-suite elapsed times in `evidence/tests.json`; test duration is not product latency |
| Agent spawn self-test | Failed twice | First full suite 48.649 s; 15 s child join threshold exceeded. Serial rerun also failed; this is not a live conversation latency measure |

API p95 uses the 29th sorted sample for n=30. These small-sample percentiles characterize the local probe only; do not extrapolate to concurrent production traffic. `evidence/backend-probes.json` contains the machine-readable observations and `reproduce_backend.py` defines conditions.

## Measurements not obtained

| Metric | Status/reason | How to obtain after approval |
|---|---|---|
| Frontend LCP/INP, mobile CPU and memory | NOT TESTED with a controlled trace | Chrome performance/Lighthouse navigation and interaction traces with fixed viewport, CPU and network; at least five cold and warm runs |
| OCR real image -> validated result p50/p95 | NOT TESTED: no paid/provider inference authorized | Consented/redacted labeled image corpus; stage spans and per-provider errors, no clinical content in logs |
| Real pharmacy response/cache p50/p95 | BLOCKED BY ACCESS PERMISSION | Approved provider sandbox/feed first; current PharmEasy automated access conflicts with published terms |
| Voice endpoint/STT/LLM/TTS/playout p50/p95 | NOT TESTED: live session authorization required | Correlated SDK/plugin/WebRTC metrics and acoustic loopback for synthetic phrases |
| Map first fully painted tile and first genuine facility result | NOT MEASURED | Separate tile load/error, map-ready and facility-result marks; current stores are fixtures |
| WhatsApp accepted -> delivered | NOT TESTED: no external send authorized | Opted-in allowed test recipient and signed Meta status events |
| Call setup -> answered -> first agent audio | NOT TESTED: no real call authorized | Verified allowed number, trunk test, SIP events and worker audio readiness |
| Real DB query p50/p95 and contention | NOT TESTED on user database | Synthetic seeded volume, SQLAlchemy query listeners, SQLite/PostgreSQL separately |
| Error/reconnect rates | Unknown | Repeated provider tests with a recorded denominator, network conditions and failure injection |

## Measured versus source-derived bottlenecks

### Map: distinguish APIs, geolocation, tiles and rendering

The measured store/city 404s are a broken contract, not useful geospatial work. The active screen returns fixed fallback records. Fixing the contract is required before optimizing real nearby search. Slow tile requests independently affect perceived map completion. A geolocation timeout of 8 seconds exists, but GPS is requested on a user action in StoresView; it cannot explain the initial v1 failures. The old Pharmacies component automatically requests location and then sequentially tries three Overpass mirrors without a browser deadline. Do not mix these two paths when diagnosing the active page.

Plan: one canonical facility API; render the map shell immediately; make GPS/manual-location states explicit; cache permitted geospatial data by rounded area/type with TTL; debounce viewport changes; cancel superseded queries. Update marker selection without reconstructing the whole layer; cluster only when measured marker volume warrants it. Serve the official OSM tile URL or a provider with documented quotas/SLA, preserve attribution/referrer/cache requirements and avoid tile prefetch. Keep a list-first unavailable state if tiles fail. Routing must await a real origin and actual provider geometry.

Estimated impact: removes the known failed v1 work and repeated layer churn; actual milliseconds/percentage are unknown until a genuine data path exists. Community tile latency is not fully controlled by application code.

### Record tools include synchronous per-medicine pharmacy work

`main.py:_med_out` calls `get_prices`, which makes synchronous urllib requests. Medicine/history responses execute one lookup per medicine, sequentially; a miss is not negatively cached. Each urllib call configures a 2.5-second timeout, but that is not a total response deadline. Large histories or repeated misses can therefore delay voice tools and uploads even when the user did not request prices. Voice BackendClient uses a finite HTTP timeout, so slow record retrieval can fail before all enrichment completes.

Plan: record APIs return canonical records immediately; a separate requested pricing endpoint enriches a deduplicated set using authorized sources, bounded concurrency, pooled connections, negative caching and per-source deadlines. Cache non-patient product data only. Do not embed all report history and price offers into every voice tool result; return a concise, paginated projection. Benchmark SQL/query count separately from provider lookup time.

Estimated impact: potentially large on cold/missing lookups; no live-provider timing was measured. Do not advertise an `N*2.5s` estimate as a measured total latency.

### OCR: one expensive model attempt, plus potentially long fallback

The main path already uses `run_in_threadpool`; moving that same blocking call to another thread again will not reduce provider inference. OpenAI-compatible providers have a 60-second read timeout and 3-second connect timeout; sequential failures add waits. Gemini legacy SDK has no explicit application-level request deadline here. Provider outputs are validated only after a candidate has been accepted, so schema failure can become an HTTP error rather than trying the next allowed provider.

Plan: strict image validation before the model, record preprocessing/provider/JSON/normalization/persistence spans, validate candidate output inside each bounded attempt, choose one healthy primary with a circuit breaker, cap total deadline and explicitly allowed fallbacks. Parallelize unrelated post-review pricing, interaction explanation and facility discovery; keep medication interpretation dependencies sequential. Cache public terminology, never another patient's prescription output. Introduce async job/result polling only if measured inference cannot fit the agreed HTTP budget; do not add orchestration infrastructure preemptively.

Confidence evaluation: use ingredient/name/strength/form/dose/frequency/duration exact-match metrics and false-accept rate by confidence bucket. Split by printed, handwritten, low-light, rotated, multilingual and unseen-brand cases. Preserve uncertainty and review instead of filling missing strengths or dosages. Current heuristic confidence is not a calibrated accuracy percentage.

### Voice: current configuration already streams

Installed livekit-agents and Murf plugin are 1.8.3. Signature inspection confirms streaming Murf WebSocket defaults, `text_pacing` and `turn_handling` are supported. STT interim results default on. The code enables preemptive generation with preemptive TTS. VAD min silence is 0.55 s; endpointing min delay is 0.3 s; interruptions require 0.8 s and two words, and false-interruption resume is disabled. These settings are configuration values, not measured delays and must not simply be summed. A one-word response can be a meaningful interruption; evaluate Hindi/English behavior rather than universally shortening thresholds.

Potential causes to test: blocking cold imports/prewarm; profile GET before greeting; slow record/price tools; long prompt/tool outputs; LLM/provider region; genuine VAD misses; current interruption/resume behavior; TTS buffering/model/voice compatibility; WebRTC packet loss/jitter; autoplay and stale room lifecycle. The combined browser visualizer can falsely mark user speech while the agent speaks; that explains a UI flicker mechanism, not measured audio stutter. No evidence yet establishes duplicate audio playback or codec mismatch.

Instrumentation plan:

1. Assign opaque session/turn/attempt correlation IDs, with no names, numbers, tokens or raw prescription text.
2. Mark browser click, token fetched, signal connected, microphone published, remote track subscribed and first audible playout.
3. Capture VAD speech end and turn-final timing; STT first/final transcript timestamps without storing text; LLM first-token and full-generation latency; tool duration/status; TTS first-audio and synthesis duration.
4. Use installed SDK/plugin `metrics_collected` where supported, per-turn `ChatMessage.metrics`, session usage and final reports. Current docs deprecate the session-level metrics event; verify the installed surface before implementation. Explicitly disable audio/transcript recording unless separately consented.
5. Record WebRTC getStats RTT, jitter, packet loss, concealed samples and reconnect counters; keep capture/output sample-rate and telephony codec facts in the test record.
6. Exercise 100 or more synthetic turns per language/mode: warm/no-tool, tool turn, interruption, backchannel, silence, short reply and provider error. Separate cold/warm sessions and browser/PSTN calls. Compute p50/p95 only on real completed samples and report failure rate independently.
7. A/B one supported setting at a time. Keep medical correctness and interruption acceptance criteria fixed. Do not promise a human identity or lower latency by suppressing necessary validation.

### Frontend loading and storage

Route-level splitting exists, but `/app` imports Caregiver eagerly; Caregiver imports Assistant, which imports LiveVoiceAgent and livekit-client. This is a route to pulling expensive audio code into the initial workspace despite a dynamic Assistant in Dashboard. Confirm the chunk graph before changing imports. Loading fixture state immediately also creates visible account/content swaps. Preserve the design system, defer voice initialization until intentional interaction, and gate patient rendering on real auth readiness.

Browser-local histories are not account scoped; privacy correctness comes before local cache speed. Add controlled cold/warm/mobile traces, memory lifecycle checks and production smoke tests before choosing memoization or animation changes. No full accessibility audit or screen-reader certification was performed.

## Proposed acceptance criteria — targets, not current results

| Path | Initial target under documented demo conditions | Correctness guard |
|---|---|---|
| Auth and record API without providers | p95 <300 ms at agreed small-demo concurrency | Real DB reads, authorization, no fixtures |
| Frontend | Mobile LCP <=2.5 s, INP <=200 ms; no new horizontal overflow | Measured on target demo device/network |
| Workspace initial JS | Reduce below current 314 kB; budget <=220 kB if chunk analysis supports it | No removal of features; record actual compressed transfer separately |
| OCR | Warm p50 <=8 s, p95 <=20 s as a provisional provider-dependent goal; explicit bounded failure | Zero silent synthetic substitutions; accuracy/false-accept evaluation must pass |
| Public price retrieval | Cached p95 <300 ms; uncached explicit deadline <=5 s | Only authorized comparable products; unavailable on failure |
| Map | Usable shell <=1.5 s; cached nearby list p95 <500 ms; uncached provider budget <=5 s | Genuine coordinates/provenance; tile readiness measured independently |
| Voice warm turn without tools | First audible reply p50 <=1.5 s, p95 <=3 s, provisional | No restart/duplicate speech; no loss of meaningful interruption |
| Voice record tool | Internal tool p95 <=500 ms excluding declared upstream deadlines | Patient-scoped, concise records; no mandatory price waterfall |
| WhatsApp | API accepted p95 <=3 s; delivered timing measured separately | Never label accepted as delivered; no silent loss/duplicates |
| Call | Worker readiness before dispatch; setup/answer/audio distributions measured, not guessed | Busy/no-answer are valid outcomes, not successful completion |
| Scheduler | Due task claimed within polling interval + agreed lateness tolerance | Persistent catch-up, consent, one eligible attempt per idempotency key |

These budgets must be revised if the permitted provider tier/region or device cannot support them. A failed budget is surfaced honestly; no fallback fabrication is acceptable.

## Repeatable before/after procedure

Record commit/dirty diff, dependency lock hashes, OS/runtime, instance count, DB type/volume, region, provider tier, viewport/network/CPU, cache state and dataset versions. Run isolated stages and then the full flow. Save aggregate spans and synthetic failure traces. After each approved batch rerun the same input/corpus, report median/p95 and failure/accuracy deltas, and roll back on authorization, clinical-review or truthfulness regression. No after-optimization numbers exist in this initial audit.

Official references: [LiveKit metrics/data hooks](https://docs.livekit.io/testing/observability/data/), [recording controls](https://docs.livekit.io/reference/agents/session-recording-options/), [turn handling](https://docs.livekit.io/agents/logic/turns/), [Murf streaming](https://murf.ai/api/docs/api-reference/text-to-speech/stream-input), [OSMF tiles](https://operations.osmfoundation.org/policies/tiles/), [Leaflet](https://leafletjs.com/reference.html).
