# Aayogya frontend — UI/UX audit and implementation handoff

Reviewed: **5 November 2026**. Application revision: **7b9d207a7849d2a553ddad017aa618b7555eb35a**.

**Start here before changing the UI.** This README compares the available design references with the current frontend and defines the remaining implementation work. It replaces the previous five-page Vite scaffold instructions. The application already exists and uses Next.js.

This was a **source review**, with visual inspection of the local reference image. No application server, authenticated browser session, screenshot comparison, performance trace, call, message, or model inference was run. “Present” below means found in code, not verified in a browser. Proposed changes and acceptance checks are future work. This documentation update does not implement the fixes.

## 1. Read order and design authority

All source paths below are relative to this frontend directory unless stated otherwise.

| Read | Reference | How to use it |
| --- | --- | --- |
| 1 | This README | Current implementation baseline, remaining work, execution order, and completion checks. |
| 2 | [Frontend Master Implementation Plan](../../FRONTEND_MASTER_IMPLEMENTATION_PLAN.md) | Detailed visual contracts, protected hero, screen specifications, and original F01–F40 findings. Its audit is dated 26 October; use section 5 below to reconcile findings with newer code. |
| 3 | [Product design](../DESIGN.md) | Product purpose, medication review, pricing, records, and non-clinical boundaries. Its “pre-scaffold,” patient-only, deferred-caregiver, and planned auth-stack descriptions are historical. |
| 4 | [Caregiver design](../../caregiver.md), especially section 6 | Linked-family workflow and call/WhatsApp distinctions. Compare proposed mechanics with current APIs; some features remain proposals. |
| 5 | [Voice design](../voice.md), especially sections 8–9 | Follow-up status vocabulary and voice/dashboard relationship. Provider setup and latency claims are outside this UI review. |
| 6 | [Earlier engineering audit](../docs/audit/README.md) and [production roadmap](../PRODUCTION_ROADMAP.md) | Historical context and integration dependencies; do not treat old defects, metrics, or “passing” counts as current evidence. |
| 7 | [Visual reference](../../_tpl_preview.jpeg) and [golden leaf logo](../../Aayogya%20Golden%20Leaf%20Health%20Logo.png) | The image shows the earlier cream, navy, amber, serif, and sketch-player direction. Preserve the existing hero player identity; use the master's cream/blue system elsewhere. It is not a complete dashboard or mobile specification. |

The root and application copies of DESIGN.md are byte-identical at this review; the two voice.md copies are also identical. Do not maintain separate interpretations of those duplicates. The root caregiver.md adds implemented caregiver scope beyond the older product design.

**Conflict rule:** follow the user's current instructions, then this dated reconciliation for current status and remaining work, then the master's detailed target contracts. Current code establishes what exists; it does not automatically override the target design. Verify API behavior in server source before wiring actions.

The old frontend README's Vite, TypeScript, no-login, exactly-five-routes, VITE_API_BASE_URL, Cloudflare dist deployment, and configured-test-recipient assumptions do not describe this application. Its links to ../docs/API_CONTRACT.md and ../CONTRIBUTING.md do not exist at those application paths. Do not migrate the app to match them.

Ignored reference checkouts under ../agent/.reference-aushadh/ and ../agent/.frontend-candidate/ are historical material, not the active frontend. No Figma file or complete exported screen specification was discovered in the active design references.

## 2. Current application map

### Stack and ownership

| Area | Current source |
| --- | --- |
| Framework | Next.js **15.5.28**, App Router; React/React DOM **18.3.1**; JavaScript. Versions are from package.json; dependencies were not reinstalled for this review. |
| Styling | Tailwind 3; app/globals.css; legacy brand/sketch helpers plus newer --ui-* tokens and .landing-v2 / .workspace-v2 scopes. |
| Motion | GSAP and ScrollTrigger; several reduced-motion gates already exist. |
| Map | Leaflet dynamically imported inside LazyStoreMap.js; OSM attribution and list controls. Leaflet CSS is also imported globally. |
| Voice | Dynamic LiveVoiceAgent.js with LiveKit; browser speech input/output in Assistant.js. |
| Session | Root AuthProvider, Bearer token, /api/auth/me validation; caregiver target passed via X-Patient-Id. No NextAuth, Supabase session, or cookie-auth migration is required. |
| Persistence | IndexedDB public catalogue, local prescription summaries, action tokens; in-memory resourceCache.js for private GETs. Local reports and backend reports are different record types. |
| API | lib/api.js for authenticated services; lib/client.js for public utilities and older action adapters; app/api/[...slug]/route.js proxies to FastAPI. |
| PWA | public/manifest.json and public/sw.js. /api and /agent requests are explicitly network-only. |
| Test scripts | scripts/test-history-basket.mjs, test-resource-cache.mjs, test-dependencies.mjs. npm test also invokes a network dependency audit. No browser test runner is declared. |

Preserve JavaScript and the existing dependency set unless an actual implementation requirement justifies a change. Do not add a UI kit, chart library, state framework, or second motion framework merely to restyle these screens.

### Reachable routes

| Route | Component and current purpose | Required treatment |
| --- | --- | --- |
| / | app/page.js → Landing.js → Navbar; inline SahayakPlayerCard and PriceSimulatorCard | Refine the existing eight-section landing; preserve the right hero player. |
| /app | Session-gated patient Dashboard or Caregiver | Preserve role routing, recovery states, identity boundaries, and direct entry. There is no /login page. |
| /search | SearchView | Public medicine selection, comparison, local basket. Same view is embedded in patient dashboard. |
| /scan | ScanView | Image upload to authenticated backend OCR, manual matching, local comparison. Visiting this route is public; extraction is not anonymous. |
| /stores | StoresView + LazyStoreMap | Facility discovery, filters, geolocation, routes; also embedded in dashboard. |
| /hospitals | StoresView with initialKind="hospital" | Existing hospital entry point; preserve it. This route was absent from the older master inventory. |
| /history | HistoryView | Device-local reports, potential savings, reopen/print/delete; also embedded. |
| /prescriptions/[id] | Local detail page + ChemistSlip | IndexedDB report detail; its UUID must not be treated as a backend report ID. |
| Unknown path | app/not-found.js | Existing 404; still uses the older sketch styling. |

Patient tabs currently are **summary, assistant, search, scan, medicines, interactions, stores, history**. Caregiver detail tabs are **summary, assistant, upload, medicines, interactions, prices, reports**, preceded by the family overview and patient action panel. Do not accidentally remove caregiver-only record management while unifying presentation.

### Component review coverage

| Files | Role and review result |
| --- | --- |
| app/layout.js, app/globals.css, tailwind.config.js | Tokens exist; global paper overlay and competing legacy styles remain. |
| Landing.js, Navbar.js | New section hierarchy and mobile disclosure exist; landmarks, anchor state, truthful copy, and session-aware CTA need finishing. |
| auth/AuthProvider.js, auth/LoginDialog.js, app/app/page.js | Shared auth, expiry handling, retry, and preload exist; dialog behavior and direct-link return state need completion. |
| Dashboard.js, Caregiver.js, sections.js | New shells and many restyled clinical panels exist; report reachability, SOS callbacks, polling, navigation, and typography remain inconsistent. |
| views/SearchView.js, SearchSuggestions.js, PriceComparisonHero.js | Search errors and keyboard navigation improved; result styling, selection/freshness edge cases, and fabricated metadata remain. |
| views/ScanView.js | Validation, preview cleanup, manual recovery, and unconfirmed text exist; clinical confirmation path is disconnected in patient workspace. |
| views/StoresView.js, LazyStoreMap.js | Expanded facilities/hospitals UI exists; failure states, selectable-card semantics, theme aliases, and map loading need review. |
| views/HistoryView.js, app/prescriptions/[id]/page.js, ChemistSlip.js | Existing local workflow; owner-scoped direct access, action availability, dialogs, and consistent presentation need completion. |
| Assistant.js, LiveVoiceAgent.js | Voice/chat and disconnect cleanup exist; style/semantics/copy need alignment without changing media lifecycle. |
| ui.js, Disclaimer.js, reactbits/* | Shared primitives are partially migrated; SpotlightCard is already a plain wrapper and AuraBackground already returns null. |
| lib/api.js, client.js, indexedDb.js, resourceCache.js, workspacePreload.js, currency.js, contexts/LanguageContext.js | Reviewed state/data dependencies because they determine visible loading, freshness, language, and account behavior. |
| public/sw.js, manifest.json, next.config.mjs, API proxy, scripts/* | Reviewed integration and verification constraints; no deployment or current performance claim was validated. |
| Login.js, Pharmacies.js | Legacy implementations with no current route/component import found. Confirm callers before cleanup; do not redesign these as if they were active screens. |

## 3. Design contract to finish

Keep the direction already established in master sections 6–14: calm cream canvas, white surfaces, blue interaction color, restrained borders, legible clinical information, and the golden logo. The sketch treatment is a deliberate exception for the protected hero player.

| Token | Value | Intended use |
| --- | --- | --- |
| --ui-canvas | #F8F5EE | Solid page canvas |
| --ui-surface | #FFFFFF | Panels and forms |
| --ui-surface-subtle | #F1EBDF | Quiet supporting areas |
| --ui-border-decorative | #E8DFD0 | Separators; not the sole input boundary |
| --ui-text / --ui-text-secondary | #172B4D / #526174 | Primary and supporting text |
| --ui-blue / --ui-blue-hover | #2457A7 / #1D478A | Primary actions, links, focus |
| --ui-control-border | #7A8796 | Visible control boundary |
| --ui-success / --ui-warning / --ui-danger | #25633E / #855800 / #B42318 | Status text with words/icons |

Amber tokens now exist too. Use them for brand accents or a deliberate secondary treatment, not as a competing primary-action system. Do not globally recolor the hero.

- DM Sans for body, controls, dashboard headings, medicine identities, and values; restrained Playfair Display for landing display headings. The current dashboard's serif headings/values are an unfinished migration against the master. Preserve hero font metrics.
- Body 16px with comfortable line height; support 14px; metadata 12px where practical. Numerous 9–11px labels remain and need review for older patients. Mobile input text at least 16px.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 80, 96px. Cards: 12px radius and 16px phone / 20–24px desktop padding. Buttons/inputs: 8px radius and approximately 44–48px height. Reserve 44px touch areas for icon actions.
- Landing max width 1200px; workspace content max width 1440px; reading measure approximately 60–68 characters; FAQ max width 760px; auth max width 408px.
- Phone gutters 16px, tablet 24px, desktop 32px. Shell sidebar starts at 1024px and is currently 268px wide. Short desktop heights must retain access to every nav/account action.
- Use one coherent primitive set across standalone utility pages and embedded views. hideNavbar changes composition and heading level, not the visual identity of the tool.
- Every data panel distinguishes initial loading, updating existing data, success, empty, unavailable/permission failure, offline/stale, and retry. Do not replace old data with a full-screen spinner during routine refresh.
- One visible page H1, a real main landmark, meaningful section headings, accessible labels, visible keyboard focus, and announced async status. Status must remain understandable without color.
- Reduced motion must work across standalone utilities as well as scoped workspaces. Limit transitions to named properties. Preserve content visibility without an entrance animation.

**Protected component:** SahayakPlayerCard is inline in Landing.js, currently around line 581. It is not PriceComparisonHero.js. Preserve its current golden/sketch appearance, internal layout, content, hover behavior, and local interaction. Take baseline screenshots before any shared CSS/font change. Its existing “Live” labels, prices, transcript, duration, and responses are a static interactive illustration; add an adjacent **illustrative preview** caption outside the protected card rather than presenting it as evidence of a real call. Do not connect its buttons to messaging or telephony.

## 4. Design versus implementation: current gaps

P0 = workflow correctness, identity boundary, or misleading result; P1 = primary UX/design/accessibility; P2 = cleanup and measured optimization. Locations are source anchors at this revision and may move after edits.

| ID | Priority | Evidence and current gap | Implementation requirement and acceptance |
| --- | --- | --- | --- |
| U01 | P1 | app/layout.js:36 still mounts a fixed z-50 bg-paper-texture overlay. AuraBackground is already disabled. | Remove the page-wide texture outside the protected visual exception; verify a solid canvas on every route and unchanged hero appearance. |
| U02 | P1 | globals.css:3437–3478 gives legacy card/button selectors !important sketch borders, shadows, amber fill, and uppercase text. Later .workspace-v2 rules are ordinary declarations. Public tools still explicitly use sketch helpers. | Resolve actual selector ownership and migrate shared primitives. A later or more specific ordinary declaration cannot beat !important. Verify matching elements in computed styles; avoid another appended override layer. |
| U03 | P1 | Landing.js has the eight requested primary blocks, but the hero main-content target is a div, there is no landing main landmark, and Navbar anchor links lack active-section state. Public views do not consistently provide the skip target. | Add correct landmarks/skip targets and visible current navigation; preserve eight blocks and direct hash behavior. Keyboard skip must move focus to useful content. |
| U04 | P0 | Landing FAQ/copy claims encrypted account records, complete privacy, broad verification, and automatic reminder outcomes without showing their conditions. HistoryView:169 claims “100% Privacy & Local Storage Law”; Disclaimer has a “Legal Compliance” badge. | Replace unproven assurances with bounded descriptions of implemented behavior. Local storage is not evidence of encryption/compliance. Mark the hero as an illustration externally; do not invent metrics, certifications, reviews, or customer logos. |
| U05 | P0 | ScanView and client.js/ocr upload a backend report, but ScanView only saves selected comparison lines to a local basket. It never invokes confirmReport. Patient Dashboard exposes scan/history, not the existing Upload/Reports workflow. OCR adapter also omits X-Patient-Id. | Restore an explicit, reachable patient review → backend-confirmation → active-record path using existing APIs. Keep “Save comparison on this device” separate. Carry caregiver scope where extraction is used for a linked patient. A reviewed backend report must activate under the intended patient, while local basket saving must not claim activation. |
| U06 | P0 | sections.js:821/830, inside Summary's SOS rendering, calls onSimulateReply / onStopMedicine, names only defined as SlotCard props elsewhere. Summary owns handleSimulateReply / handleStopMedicine. | Wire the correct handlers; test the SOS actions on a record with adherence_id. No ReferenceError, no duplicate action, and UI reflects the server result. |
| U07 | P0 | indexedDb.js:112/157 direct read/delete accept only a report ID; add/update also looks up reports without ownership validation. filterPrescriptionReports includes all guest records for every signed-in patient. | Enforce the exact selected scope for reads, updates, print, and deletes. Keep guest history separate unless explicitly imported. Do not silently adopt guest/another patient's records or clear existing user data. Verify direct foreign-ID links, guest, account A/B, and caregiver patient A/B. This is browser data segregation; backend authorization remains mandatory. |
| U08 | P0 | Local detail calls /api/v1/reminders, absent from v1_router.py. client.js:createCall converts local UUID to Number, omits session/patient headers, forces dispatch, and manufactures a “management token” from IDs; status reverses IDs heuristically. | Show an explanatory unavailable state for unsupported local actions. Only offer live actions for a verified backend report and the real authenticated contract. Never reinterpret UUIDs, generate fake credentials/status, or initiate a call to test appearance. |
| U09 | P0 | PriceComparisonHero.js:30 defaults PMBJP code to PMBJP-GEN; :101/:133 default checked dates to 2026-03-01; market source is hardcoded NPPA. SearchSuggestions defaults a missing match score to 85. | Render actual provenance/date/code or “Not verified” / “Not provided.” Never label retail MRP as an NPPA ceiling. Missing score must not become an invented confidence value. Keep NPPA separate, prices in comparable units, and zero savings distinct from missing comparison. |
| U10 | P0 | client.js:getPublicCatalogue still substitutes DEV_CATALOGUE after a failed live request, and SearchView writes it to IndexedDB. Live search/compare themselves now throw errors correctly. | Stop seeding synthetic catalogue rows on network failure. Retain only previously fetched genuine public labels for stale-labelled offline suggestions. Disable new price comparison offline. Test fresh device offline versus previously cached device. |
| U11 | P1 | Caregiver.js:389 increments pollVersion without remounting, but Summary, Interactions, Prices, and Reports do not consume that prop; Medicines does. Family overview refresh is also separate. | Refresh the intended read resources while visible without remounting chat/forms/voice, indicate last refresh, and stop unnecessary hidden-page polling. A server adherence/status change must reach the open overview without navigating away. |
| U12 | P1 | Dashboard updates ?tab with replaceState; caregiver validates ?patient against linked cards but its detail tab remains local. Auth entry uses openLogin("/app"), dropping original query intent. Back-to-family is a button rather than a browser-history entry. | Preserve validated tab/patient destinations through sign-in. Define push versus replace behavior and synchronize Back/Forward. No query parameter may authenticate a user or authorize a patient. Invalid tab/member values must resolve safely. |
| U13 | P1 | LoginDialog has role/label, Escape and a manual Tab trap, but uses a div rather than native modal; background is not inert and the focus query includes disabled controls. Late auth callbacks can still complete after closing/changing the dialog. | Complete one tested dialog behavior: focus containment/restoration, scroll locking, visible close, background inertness, pending handling and safe late results. Preserve real password/register/Google flows and the two development-only demo selectors. No backend auth rewrite. |
| U14 | P1 | Dashboard mobile drawer has Escape/body lock but no dialog semantics, initial focus, or Tab containment; active patient nav has no aria-current. History deletion and ChemistSlip have dialog labels/Escape but no complete focus lifecycle. Caregiver drawer is more complete already. | Reuse a tested modal/drawer pattern; handle keyboard and assistive technology, initial focus, background inertness, Escape, return focus, short-height scroll. Preserve care/account actions on mobile and print behavior. |
| U15 | P1 | SearchView now has combobox Arrow/Enter/Escape handling. ScanView still uses clickable div candidates, an unlabelled correction input, alert-based comparison errors, and quantity changes that only update packCount. SearchView silently chooses brands[0]. | Share accessible exact-product/brand selection. Make scan candidates keyboard reachable, show inline retry/errors, and recompute comparison before saving a changed quantity. Ensure selected name/strength/form/pack/brand are explicit. Never calculate against a stale quantity/result. |
| U16 | P1 | SearchView does not abort an in-flight search when query becomes empty or invalidate an earlier result immediately on editing; clear can be followed by a late result. Successful zero matches has no dedicated no-results explanation. | Cancel/invalidate stale requests on edit, clear and unmount; tie results to the current selection, distinguish no matches from service failure, and keep manual recovery. Rapid type/clear/select must not restore obsolete candidates or savings. |
| U17 | P1 | StoresView logs city/store failures, potentially leaving old results or treating failure as an empty list. Facility cards use div onClick; map precedes the full list. text-ui-text-muted classes have no configured token. | Add explicit scoped loading/error/retry and clear obsolete selection/route on context changes. Keep a usable list without map/GPS, make selection semantic without nested interactive controls, and replace undefined theme aliases. Confirm both /stores and /hospitals. |
| U18 | P1 | Landing/utility copy uses “live,” “verified,” “24x7,” and facility-level capability descriptions broadly; records label reschedule_requested as “Rescheduled.” Clinical stop copy asks whether someone feels healthy. | Use record-specific source/status language. Say “Reschedule requested” until confirmed; distinguish local data, backend confirmation, human acknowledgment, provider acceptance, delivery, and simulation. Medication action copy must explain the recorded/reminder change without advising a treatment decision. |
| U19 | P1 | LanguageContext now restores html lang correctly, but landing, auth, dashboard, caregiver, and many tool strings remain hardcoded English. Shells lack consistent language controls. | Centralize new/remaining copy, expose a reachable language switch, preserve product vocabulary, and test Hindi wrapping. Changing html lang alone does not translate a screen. |
| U20 | P1 | No app error.js or route error boundary exists. Existing WorkspaceLoading and session retry already cover pending auth/network checks; shared Loader is not consistently announced. | Add recovery at useful route/feature boundaries, retain retry and correct identity, and distinguish rendering errors from request errors. Do not invent a second auth loading gate. Announce pending/completed states without repeated alert chatter. |
| U21 | P2 | API proxy currently forwards Content-Type only; public ETag and Retry-After are lost. CSS Google Fonts import, global Leaflet CSS, and one large dynamically imported sections.js remain. | Preserve useful response headers and private no-store behavior where required. Profile before splitting modules/changing fonts. Dynamic imports from the same sections file share a chunk; comments promising sub-second loading are not measurements. |
| U22 | P1 | Logos lack reserved intrinsic dimensions; PWA icon entries reuse the same asset for 192/512 and maskable; theme values still use the older palette. Full coverage of reduced motion is limited by wrapper scopes. | Reserve image geometry; verify actual icon dimensions/maskable padding and browser/PWA appearance. Test standalone routes, safe areas, large text, reduced motion, and native controls; preserve app install/update and private-cache rules. |
| U23 | P1 | Assistant/LiveVoiceAgent retain older brand/button/voice styles and “consultation” copy; icon toggles rely on titles in places. | Align presentation and plain non-clinical copy; add accessible names/pressed states and readable connected/error/muted status. Keep user-started microphone, text fallback, cancel/end call, unmount disconnect, and selected-patient context. |
| U24 | P1 | HistoryView only logs IndexedDB load failures; delete can leave currentPage beyond the shortened list. Prescription detail starts with a prefilled medication instruction rather than user-confirmed text. | Provide storage error/retry distinct from empty history, clamp pagination after delete, and show clear local-only/freshness labels. Require reviewed instruction rather than implying an authoritative default. |

Line references are investigative anchors, not an exhaustive lint report. U05, U07, U08, U11–U13 and cache changes need focused regression checks alongside visual work.

## 5. Reconciliation of the master's F01–F40

Do not restart all ten old milestones or treat code comments containing “Fix Fxx” as completion evidence. This table describes the current source only.

| Original finding(s) | Status now | What the next agent should do |
| --- | --- | --- |
| F01 | Partial | Shared modal replaces the legacy Login component, but /app still renders an unauthenticated workspace bridge. Finish safe entry/return behavior (U12–U13). |
| F02 | Present in active flow | LoginDialog has two non-production selectors; dashboard demo switching is gone. Legacy Login still has six entries but is not imported. Verify environment/account policy; do not bypass it. |
| F03–F04 | Present in source | AuthProvider listens for expiry; stale 401 handling checks the request token. /app no longer calls loginAsDemo from ?patient. Retain regression coverage. |
| F05–F06 | Partial | Skeleton, role code preload, and deferred sections exist. Shared sections.js is still a single module; no current latency baseline. See U20–U21. |
| F07–F08 | Partial | Caregiver detail is keyed by patient/tab, not pollVersion; patient changes clear the resource cache. Refresh propagation remains incomplete (U11); verify late-response/account-switch behavior. |
| F09 | Present in source | Caregiver prefetch and Medicines use include_prices=false. Preserve this. |
| F10 | Partial | In-memory scoped cache/deduplication and composed caller cancellation exist. Verify invalidation, concurrent consumers, and in-flight results after account/patient changes. |
| F11 | Partial | Semantic tokens and scopes exist; legacy cascade/public utility migration remains (U01–U02). |
| F12 | Partial | Font variable cycle is fixed. CSS Google Fonts import remains; optimize only with hero/font baseline (U21). |
| F13 | Partial | Ambient component is disabled/unmounted and old Architecture section is gone. Global paper texture remains (U01). |
| F14–F15 | Present in source | Eight landing blocks/FAQ exist; fake newsletter success is replaced with unavailable/private-preview copy. Keep the honest unavailable state. |
| F16 | Partial | Several old campaign claims are removed; current assurance/status copy still needs review (U04/U18). |
| F17–F18 | Partial | New 268px shells and mobile account/sign-out exist. Verify short-height scrolling, drawers, and all entry modes (U14). |
| F19 | Partial | Navbar disclosure now has expanded/controls, Escape, and focus treatment. Finish active anchors/skip destinations (U03). |
| F20 | Original pattern removed | Old clickable feature articles are gone. Similar nonsemantic selection remains in scan/stores (U15/U17). |
| F21–F22 | Partial | Search combobox keyboard support and visible search/compare errors exist. Scan selection and its comparison error behavior remain incomplete (U15–U16). |
| F23 | Partial | Search/compare no longer substitute fake results; catalogue fallback still does (U10). |
| F24–F25 | Partial/open | Fabricated reminder success is removed; unsupported reminder UI and invalid local call adapter remain (U08). |
| F26 | Partial | Exact list matching replaces substring matching, and guest list excludes owned reports. Guest mixing and unscoped direct-ID operations remain (U07). |
| F27–F29 | Present in source | Formatted % values bypass count-up; no-dose state exists; evening slot is rendered without an invented preference field. Preserve these fixes. |
| F30–F31 | Open/partial | Local/backend report divergence remains (U05); auth fields gained labels, but scan/detail/time controls need a full association/error pass. |
| F32–F33 | Present with coverage gaps | Motion helpers/shells honor reduced motion; embedded tools use section/H2. Standalone motion coverage and landing/mobile landmarks still need checking (U03/U22). |
| F34 | Partial | Patient tab and caregiver member write URLs, but caregiver detail tab, history behavior and auth return query remain incomplete (U12). |
| F35 | Open | Proxy still discards ETag/Retry-After (U21). |
| F36–F37 | Partial | Overlays gained dialog labels/Escape; stock feature images were removed. Focus lifecycle and logo dimensions remain (U14/U22). |
| F38 | Partial | History tests now import real totals/filter helpers. They do not prove owner-scoped direct read/write/delete or guest separation (U07). |
| F39 | Partial | Workspace loading/session retry exists; render-error boundaries do not (U20). |
| F40 | Present in source | Stored language now synchronizes html lang. Translation coverage remains a different task (U19). |

“Present” does not close browser, device, accessibility, or performance acceptance checks.

## 6. Screen-level implementation instructions

### Landing and navigation

Retain exactly **Hero → Trust → About/How it works → Product experience → Dashboard sign-in CTA → FAQ → Subscribe → Footer**. Navbar is chrome outside the count. Existing anchors are home, trust, how-it-works, product, dashboard, faq, subscribe.

Finish the existing composition; do not recreate Problem/Architecture/Features/Stats/Pricing campaign sections. Keep real public price exploration, with missing-data/provenance handling. Newsletter is unavailable until an actual service exists. Use verified legal/contact destinations when provided; do not create dead footer links.

Use session-aware actions: signed-out users open the same modal; signed-in users can open their actual workspace. Keep the protected hero action compatible with its existing callback. Fix the missing-callback fallback safely if Landing is reused without onOpenAuth.

### Authentication and shell

One shared login/register dialog supports patient/caregiver role selection, password flow, configured Google flow, and development demo selectors. Keep safe relative return paths and server validation. A stored role hint may preload code; it must never reveal private records.

Preserve a usable session-check skeleton and connection retry without discarding a valid token on a temporary outage. Make sidebar, mobile drawer, account, sign out, language and current section consistent. Separate shell navigation from clinical content and preserve input/focus during background updates.

### Patient overview, medicines, safety and backend records

Order content around today's schedule, pending actions, and next follow-up. Preserve four routine slots plus SOS, reminder controls, stopped medicines, and real follow-up states. Keep percentage/no-dose fixes.

Repair the SOS callback bug before visual polish. Keep action pending/error state near the affected medicine. Replace generic alert/confirm popups with accessible, specific in-app feedback where touched. Distinguish pausing reminders from recording a course as stopped; avoid encouraging medication decisions.

Expose backend report upload/review/confirmation and backend records to the patient without conflating them with local shopping comparisons. This may be an integrated scan flow plus a clearly named records view rather than a gratuitous new top-level route. Check all existing backend report fields and human confirmation before activation.

Safety checks must show limited rule coverage, unresolved salt mapping and available source references. No alert must never become a guarantee. Preserve differences between major/moderate/minor findings.

### Caregiver family and patient detail

Retain linked-family cards, selected member identity, follow-up countdown, contact edit, tel: call, wa.me prefill, and authenticated AI-call action. Only server-authorized linked patients may be selected. Do not hardcode four relatives or synthetic adherence figures.

Opening WhatsApp means the caregiver still chooses Send; it is not provider delivery. An AI dispatch accepted by the backend is not an answered call. “Reschedule requested” is not a booked appointment. Preserve clear simulated/unavailable modes. Refresh read resources without remounting draft forms, chat, or voice.

### Search and compare

Share exact medicine/brand selection across search and OCR recovery. Show molecule, strength, form, release type and pack before comparing. Use genuine dated source metadata, explicit unavailable values, an independent NPPA ceiling, and comparable units. Retain integer-paise calculations and existing currency formatting.

Use accessible suggestions, immediate stale-request invalidation, explicit no-results, offline/stale notice, and retry. Adding to a report must clearly mean device-local comparison saving unless a separate backend confirmation succeeds.

### Scan and review

Keep JPEG/PNG/WebP and 5MB validation, image preview cleanup, explicit extraction, progress, unconfirmed text and permanent manual recovery. Offer sign-in when OCR requires it; do not report unauthenticated extraction as an OCR-quality failure.

Review extracted rows before backend confirmation. Local quantity changes must recalculate prices. Remove fabricated instruction defaults, preserve uncertainty and source IDs, and never derive an active regimen from an unconfirmed candidate.

### Facilities and map

Preserve /hospitals, /stores, type/ownership/locality filters, manual city choice, optional GPS, genuine route geometry, attribution and external directions fallback. Distinguish hospitals, pharmacies, and verified Kendras using actual source fields.

Make the list usable first, with optional map; do not collapse fetch failure into “no facilities.” Provide keyboard selection and a readable selected facility panel. Verify lazy-map initialization when Leaflet loads after data has already arrived, tile-load failure and route reset on changing location. GPS and calling emergency numbers remain user actions.

### Local history, detail and print

Explain device-only storage and browser-data loss plainly. Show estimated potential savings from comparable lines only, per-report timestamps/freshness, exclusions and unknown values. Keep local versus cloud records recognizable.

Require scoped ownership on direct detail/open/reprint/update/delete, including previously known URLs. Test zero/incomplete totals, deletion on the last page and unavailable IndexedDB. Print only reviewed rows with semantic table headers, real product codes or “Not verified,” and the disclaimer. Preview must trap/restore focus; print output must exclude background app chrome.

### Assistant and voice

Keep voice and text fallback, real connection states, microphone permission on explicit start, mute/end/cancel, patient scope and cleanup on exit. Style readable status and controls with the shared system; use non-clinical wording. Do not autoplay a connection or mount a voice session for prefetch. Never test a live provider action just to verify layout.

## 7. Execution order for the implementation agent

Work within the user's authorized scope; do not request approval again for routine frontend work already authorized. Missing backend services, real external actions, or deployment are separate scope. Unavailable services should have truthful UI so they do not block unrelated frontend completion.

| Batch | Scope / main files | Exit checks |
| --- | --- | --- |
| A — Correctness before polish | U05–U10, U15–U16; sections.js, ScanView, SearchView, indexedDb.js, client.js, PriceComparisonHero | Patient report confirmation reachable; SOS handlers work; foreign local report hidden; unsupported actions unavailable; missing metadata remains missing; stale/quantity results cannot be saved. |
| B — Foundations and cascade | U01–U04; layout, CSS, Tailwind, ui.js, Disclaimer; all standalone tool wrappers | One canvas/palette/type system; no matching legacy !important wins outside hero; protected player baseline unchanged. |
| C — Entry, navigation and overlays | U03/U12–U14/U20; Navbar, auth, /app, shells, history/slip overlays, relevant error boundary | Safe direct links after auth; Back/Forward works; keyboard cannot escape modal; focus returns; mobile sign out and all nav reachable. |
| D — Clinical and family workflows | U11/U18; sections.js, Caregiver, Dashboard and report review UI | Refresh updates overview without remount; truthful action/follow-up status; correct patient header; drafts/chat/voice survive refresh. |
| E — Tool and assistant consistency | U09/U15–U17/U23–U24; utility views, comparison, map, local detail, assistant/voice | Same tool behavior/design standalone and embedded; list/error recovery without map; print, search, scan and storage failures usable. |
| F — Language, adaptive layout and finish | U19/U22; translations, all touched DOM/styles, manifest/assets; measured U21 work | Hindi, zoom, small/short viewports, reduced motion, keyboard, icon dimensions and PWA checks recorded; no speculative performance claims. |

Within each batch, make small reviewable changes and run the checks that exercise changed behavior. Keep visual changes separate from identity/cache changes where practical. Do not mark a batch done based on a commit message or source comment.

Preserve backend/**, agent/**, environment files, databases, provider configuration, existing user data and repository history during a frontend-only implementation. Backend contract gaps must be documented rather than patched through frontend impersonation, fake responses, or forced dispatch.

## 8. Verification and completion criteria

The commands below are instructions for the future implementation pass, not tests run during this documentation review. Run from Aayogya/frontend.

| Check | Command or manual path | What it proves / limit |
| --- | --- | --- |
| Basket/filter helpers | node scripts/test-history-basket.mjs | Existing calculation and filter cases; extend with meaningful ownership regressions when storage behavior changes. Does not exercise a real browser database alone. |
| Cache helper behavior | node scripts/test-resource-cache.mjs | Existing scoped dedupe/cancellation cases; add regressions for any changed invalidation/switch behavior. |
| Full declared suite | npm test | Also runs npm audit through test-dependencies.mjs and reads installed dependency metadata; needs registry access. |
| Production compile | npm run build | Next.js production compile; does not prove visual, authenticated or provider behavior. |
| Local UI | npm run dev | Starts Next; predev deletes generated .next. Use a separate frontend instance/worktree when another session needs its build output. |
| Production UI | npm run start after build | Check actual production chunks/routes and PWA behavior, not only development mode. |

Use existing approved local/staging services or an isolated test environment for authenticated verification. Backend startup can seed data/start schedulers and some reads synchronize adherence. Never start against a persistent personal database or trigger reminders/calls as an incidental visual test.

Required acceptance cases:

- Landing: eight blocks/order; correct landmarks/anchors; solid canvas; same protected hero; truthful preview; single shared modal; no fake newsletter completion.
- Auth: password/register/role mismatch, configured Google, expiry/401, temporary offline with token retained, logout, safe direct destination and no URL-based login.
- Identity: patient self, caregiver linked/unlinked member, rapid patient switch, late response after logout/login; no old-patient content flash. Local guest/A/B direct read/write/delete/print tested separately.
- Clinical: backend report review → confirm → overview/medicines/records; four time slots and SOS; empty/no-dose; reminder settings; actual error states; no fake success.
- Refresh: server status changes while detail is open; foreground updates without remount; draft/contact/chat/voice preserved.
- Tools: fast type/clear/out-of-order search, zero matches, multiple brands, missing metadata, zero savings, incomplete basket, offline labels, bad/oversized image, unauthenticated OCR and manual correction.
- Facilities: /stores and /hospitals deep links; GPS denied/unavailable; city/locality changes; empty results versus fetch error; map unavailable; route unavailable; keyboard-only list.
- Local reports: fresh device, IndexedDB error, guest separation, another patient's known report URL, reload, delete/cancel/last page, stale labels, zero/incomplete totals, print preview.
- Accessibility: keyboard-only navigation; dialog/drawer focus lifecycle; no nested main; correct labels/headings/status; screen-reader smoke; visible unobscured focus; contrast checked against final composed colors.
- Responsive: widths 320, 375, 768, 1024, 1440 and wide desktop; desktop heights 600/768/900; 200%/400% zoom and long/Hindi labels. Check overflow rather than merely hiding it with overflow-x:hidden.
- Motion/PWA: reduced motion on standalone and embedded screens; no hidden content; install/update/offline shell; no private API or agent-token response in SW cache; map remains usable without cached tiles.
- Performance: record comparable before/after conditions if claiming improvement. The older master sets targets, not measured results. No “guaranteed sub-second” claim from code splitting alone.

For every completed batch, append a short dated entry here or link its implementation report containing changed files, checks run/results, screenshots with viewport, unresolved dependencies, and any deliberate departure from the master. Keep current status and future work distinguishable.

## 9. Dependencies and safe defaults

| Dependency | Default frontend behavior until resolved |
| --- | --- |
| No public local-report reminder API | Explain unavailability; preserve working authenticated reminder controls elsewhere. |
| No local UUID → backend-report relationship | No dispatch from a local report. Require actual backend identity before offering that action. |
| Newsletter service absent | Keep signups unavailable; no collected email or success animation. |
| Demo accounts unavailable/environment disabled | Hide/disable demos; ordinary login remains; do not change seed/production policy. |
| Missing legal/contact destinations or unverified product claims | Use bounded copy and only real links; record missing content. |
| Caregiver invitation flow | Do not promise self-service linking where only existing server-authorized links are supported. |
| Provider/message/call delivery unverified | Display actual unavailable/simulated/accepted state; do not claim handset delivery or appointment booking. |
| Local storage ownership policy | Separate guest and exact patient scopes; do not silently migrate, reassign or delete reports. |

## 10. Ready-to-use instruction for the next agent

> Implement the Aayogya frontend UI/UX using this README as the dated reconciliation of the older Frontend Master Implementation Plan. Recheck the current revision/diff, preserve other work, and complete remaining batches in dependency order. Reuse the existing Next.js/JavaScript app and functioning auth, role, data, map, OCR and voice integrations. Preserve SahayakPlayerCard's appearance and interaction. Fix workflow/identity/truthfulness gaps alongside the visual migration. Test public and embedded tools, patient and caregiver paths, keyboard/mobile/Hindi/reduced motion, and record actual verification. Do not recreate already implemented foundations, substitute mock results, trigger external calls/messages, or change backend/provider/database scope to make the UI appear complete.

Review checklist informed by [Vercel Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), fetched 5 November 2026. Local code and design documents provide the evidence for the findings above; guideline review is not an accessibility certification.
