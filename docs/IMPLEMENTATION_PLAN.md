# Alfaiate TL — Implementation Plan

Status: Draft v0.1 · 2026-10-16 · Requirements: [PRD.md](PRD.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md)

Phases are executed **one at a time**, in order. Each ends with a verifiable state; do not start the next phase until the current phase's tests pass and docs are updated. IDs (FR-, NFR-, SEC-, PRV-, ANA-, AC-, AD-, OQ-) refer to [PRD.md](PRD.md) / [ARCHITECTURE.md](ARCHITECTURE.md). Nothing here is implemented yet.

## Smallest useful end-to-end release

Phases 1–5 produce a publicly usable directory with a working request form and admin inbox. Phase 6 adds referral/fee tracking. A pilot is possible after Phase 5 (with spreadsheet tracking of referrals) if the owner wants to start earlier, but fee tracking (BR-09, M7) needs Phase 6 before revenue is measured.

## Phase 1 — Repository assessment and project setup

- **Objective:** confirm the repo state, resolve the stack decisions, and create a runnable, empty, tested skeleton.
- **Dependencies:** owner answers to AD-01, AD-02 (stack/hosting) — default proposed stack applies if unanswered.
- **Deliverables:** re-run of the repo assessment (update ARCHITECTURE §1 if changed); verify Astro 7.4 and adapter compatibility (AD-01); project scaffold per ARCHITECTURE §2 (Astro, Cloudflare adapter, Wrangler config with local D1 and R2 bindings, staging/production environments); lint/format/typecheck/test scripts; `.dev.vars.example` (placeholders only); `.gitignore` (excludes `.env`, DB, uploads); git repo initialised; README with run instructions; CI or a single check script; module folder layout (ARCHITECTURE §3); base layout with mobile-first CSS tokens and a placeholder home page.
- **Acceptance:** app starts locally; `check` script (lint + typecheck + tests + build) passes; secrets absent from version control.
- **Tests:** one smoke test (home renders its h1 via Astro's container; HTTP 200 on the Workers runtime and the Workers/D1 test pool are deferred to Phase 2); build succeeds.

## Phase 2 — Data model and administrative foundations

- **Objective:** database, migrations and secure admin login.
- **Dependencies:** Phase 1; AD-03 (password hashing on Workers), AD-10 (phone rules), AD-11 (roles, OQ-15).
- **Deliverables:** schema and migrations per DATA_MODEL (all MVP entities, constraints, indexes); seed script for categories/areas placeholders (owner's real lists per OQ-10 later); D1 migrations; first-owner seed script; auth (login/logout, hashed-token sessions, CSRF, rate limiting); RBAC (role column, permission map in code, `can()` guard on every admin route and handler, user management for owners, last-owner protection, audit log); `/admin` guard and shell; security headers; noindex/no-store on admin; config validation.
- **Requirements:** FR-ADM-01, SEC-01/02/03/06/08/09.
- **Acceptance:** AC-09 (incl. 403 per role); password never stored in plaintext; session expires; failed logins are rate limited.
- **Tests:** set up the Workers/D1 test pool (deferred from Phase 1); unit (password hashing, permission map, last-owner rule, phone normalisation, schema constraints such as publish-requires-permission); integration (unauthenticated access to every admin route is refused, login/logout, CSRF rejection, each role allowed/denied on each protected route); migration up on a clean DB.

## Phase 3 — Tailor profiles and directory (admin side first)

- **Objective:** owner can create, edit, image-manage and publish tailors; data is ready for display.
- **Dependencies:** Phase 2; AD-04 (image store/resizing approach), AD-07 (image limits).
- **Deliverables:** admin CRUD for tailors, categories, areas; tailor–category prices and tailor–area links; permission and verification fields; publish/unpublish rules; portfolio upload to R2 (browser-side resize/re-encode, server validation, generated keys, public vs private location, D1 metadata only), sort/hide/delete with permission flag; role checks (editor may edit drafts, only owner/manager may publish); internal notes on tailors; tailor fee-terms fields (FR-REF-08).
- **Requirements:** FR-ADM-02/03/04/05/08, FR-REF-08, BR-05/06/11, SEC-04.
- **Acceptance:** AC-10; unpermitted images never reach the public directory; EXIF stripped; no image bytes in D1.
- **Tests:** unit (publish rule, image validation); integration (upload valid/invalid/oversized files, delete removes files); admin form validation.

## Phase 4 — Homepage and discovery experience (public)

- **Objective:** customers can discover tailors and contact them directly.
- **Dependencies:** Phase 3 with at least a few real or clearly fake test tailors in the dev database (never published fake data).
- **Deliverables:** homepage (service explanation, how it works, disclaimer, CTA); directory with filters; category (and area) pages; profile pages with verified/tailor-supplied labelling; WhatsApp/tel links; contact click counter; static pages (content placeholders flagged for owner approval); empty and 404 states.
- **Requirements:** FR-PUB-01/02/03/04/05/06, FR-DIR-01–04, FR-PRO-01–08, ANA-01/02, NFR-SEO-01 (metadata, sitemap, robots), NFR-A11Y-01 (baseline).
- **Acceptance:** AC-01, AC-02, AC-03, AC-04, AC-05.
- **Tests:** integration (only published and permitted content rendered; filter combinations; 404 for unpublished; sitemap contents); unit (link builders); Playwright (mobile viewport browse → profile → link href check); a11y automated scan on key pages.

## Phase 5 — Enquiry and doorstep request workflow

- **Objective:** customers submit a request; the owner sees it.
- **Dependencies:** Phase 4; OQ-06 (notification channel), OQ-10 (areas), OQ-08 draft privacy text.
- **Deliverables:** `/request` form with consent and disclaimers; server validation; spam controls; persistence with consent version/time and reference code; acknowledgement page; owner notification (best-effort); admin enquiry inbox, detail, status updates with log, notes, spam flag; "copy details for forwarding" view; privacy notice page wired to consent text. Optional (Should): reference images (FR-ENQ-07).
- **Requirements:** FR-ENQ-01–06 (07/08 as Should), FR-ADM-06/07/08, SEC-05/07, PRV-01/02/03, BR-03/07/08.
- **Acceptance:** AC-06, AC-07, AC-08, AC-11, AC-15 (enquiry paths: logs, URLs, notifications; the full sweep is Phase 7).
- **Tests:** unit (validation schema, reference code generation); integration (valid/invalid submit, honeypot, rate limit, no customer data in logs/URLs, failure to notify does not lose the enquiry, DB failure shows error not success); Playwright (complete the form on mobile and by keyboard).

## Phase 6 — Referral tracking and basic reporting

- **Objective:** record the enquiry → referral → reported completion → fee trail and show counts.
- **Dependencies:** Phase 5; OQ-03/OQ-04 (fee model) — fields exist regardless, the interpretation is the owner's.
- **Deliverables:** assign enquiry to tailor (consent and approval checks); record forward time/method, tailor response, reported completion, fee and payment status; reassignment with history; dashboard counts and metrics M1–M9 labelled as reported; period selector. Built as in [SPEC-phase-6.md](SPEC-phase-6.md).
- **Requirements:** FR-REF-01–07, FR-RPT-01/02, ANA-04/05, BR-08/09/10 (FR-ADM-09, deletion and anonymisation, was deferred by the Phase 6 spec).
- **Acceptance:** AC-12, AC-13, AC-14.
- **Tests:** unit (metric calculations on a seeded dataset, fee/status constraints); integration (refusals, history retained, anonymisation keeps reporting fields); admin end-to-end journey J3.

## Phase 7 — SEO, accessibility, security and testing

- **Objective:** harden and verify against the non-functional requirements.
- **Dependencies:** Phases 1–6.
- **Deliverables:** structured data; canonical/noindex rules; image and CSS/JS budgets measured on throttled mobile (record the numbers and set budgets in this file); full accessibility pass (axe + manual keyboard/zoom/contrast); security review (headers, uploads, auth, dependency audit); privacy review (logs, analytics, backups); expand tests; fix findings.
- **Requirements:** NFR-PERF-01, NFR-A11Y-01, NFR-SEO-01, NFR-BRW-01, SEC-01–08, PRV-04/05, FR-PRO-07, FR-ADM-09 (anonymise only; hard delete and automatic purge stay unbuilt). Built as in [SPEC-phase-7.md](SPEC-phase-7.md).
- **Acceptance:** AC-15, AC-17; no unresolved high-severity security finding; performance numbers recorded.
- **Tests:** full suite; Playwright + axe on key pages; security checklist; no-JavaScript run of browse and form.

### Phase 7 measurements and budgets (NFR-PERF-01), recorded 2026-10-19

**Method.** `npm run perf` builds, serves the built Worker on a throwaway seeded database and measures five pages through Chromium's DevTools protocol: 375 × 812 mobile viewport, 4× CPU slowdown, slow 4G (1.6 Mbps down, 750 kbps up, 750 ms round trip), empty cache for every run, median of five runs. **Limits:** one developer machine, not Dili; the test data has no photos; the 750 ms round trip dominates the times, so the numbers show page weight and the number of round trips, not real-world speed. A check from Dili belongs in Phase 8.

| Page | Requests | HTML (transfer / decoded KB) | CSS | JS | Images | DOMContentLoaded | Load | LCP |
|---|---|---|---|---|---|---|---|---|
| Home | 2 | 1.7 / 3.4 | 2.1 / 6.3 | 0 | 0 | 776 ms | 1563 ms | 1576 ms |
| Directory | 2 | 1.7 / 3.5 | 2.1 / 6.3 | 0 | 0 | 780 ms | 1543 ms | 1600 ms |
| Category | 2 | 1.5 / 2.9 | 2.1 / 6.3 | 0 | 0 | 777 ms | 1570 ms | 1588 ms |
| Profile | 3 | 2.0 / 4.1 | 2.1 / 6.3 | 0.5 / 0.3 | 0 | 1585 ms | 1585 ms | 1592 ms |
| Request | 2 | 2.2 / 4.9 | 2.1 / 6.3 | 0 | 0 | 779 ms | 1542 ms | 1588 ms |

No web fonts, no third-party requests; JavaScript only on a profile with contact buttons (the tap counter).

**Budgets (enforced in `npm run check` by `tests/integration/budgets.test.ts`, uncompressed bytes, measured + about 20%):** HTML home 4,300, directory 4,300, category 3,400, profile 5,400, request 5,700, how it works 4,300; stylesheet 7,800; JavaScript 400. Images: every image needs alt text, `srcset` and `sizes`, and all but the profile hero are `loading="lazy"`; image weight comes from the three resize widths (320, 800, 1600) and the upload caps, since the test data has no photos. Timings are reported by `npm run perf`, not enforced. The budgets come from the byte counts of the fixed dataset in the budget test (home 3,513 B, directory 3,476, category 2,796, profile 4,400, request 4,728, how it works 3,510, CSS 6,474, JS 287), which is slightly different from the `perf` seed data in the table above (the how-it-works page is budgeted and tested but not in the `perf` table). A directory with many tailors grows the HTML (cap 200 cards): re-measure with real content in Phase 8.

## Phase 7b — Admin UX polish and first-run experience (added 2026-10-19)

- **Objective:** make the admin pleasant and obvious to use before real tailors and customers appear.
- **Dependencies:** Phase 7. Spec: [SPEC-phase-7b.md](SPEC-phase-7b.md).
- **Deliverables:** shared admin layout and navigation; banners for messages; status chips; dashboard cards; inbox counts, order and referral state; reorganised enquiry page; tailor publish checklist; empty states; local-only demo data and its remove command.
- **Requirements:** no new requirement; presentation of FR-ADM-02–09 and FR-RPT-01/02 with NFR-A11Y-01 kept.
- **Acceptance:** behaviour unchanged (all earlier tests pass); axe clean on every admin page; owner sign-off after a click-through.
- **Tests:** a contract test that every admin page keeps its forms, fields and links; component, helper and integration tests; Playwright journeys and reflow; byte budget for the admin stylesheet.

## Phase 7c — Public site art direction and conversion (added 2026-10-19)

- **Objective:** a fashion-editorial, story-led public site that converts visitors into requests and tailor interest, fast on weak phones.
- **Dependencies:** Phase 7b (owner sign-off). Spec: [SPEC-phase-7c.md](SPEC-phase-7c.md).
- **Deliverables:** art direction and tokens; one self-hosted display serif; redesigned shell, home story (CSS 3D swatch, pattern steps, tape-measure illustration), directory, profile and static pages; two-step request; tailor interest form `/join` with admin list (no accounts or profiles); motion and reduced-motion rules; measured budgets.
- **Requirements:** no change to FR-ENQ, BR-06/07/08/11; FR-JOIN-01..03 added to the PRD in T7; NFR-A11Y-01 and NFR-PERF-01 kept.
- **Acceptance:** behaviour of existing flows unchanged; axe clean in both languages; reduced-motion and no-JavaScript runs pass; budgets met; owner sign-off.
- **Tests:** consent, honeypot and permission tests for `/join`; contrast test for tokens; Playwright for motion, reflow and keyboard; `npm run perf` before and after.
- **Status (2026-10-19):** built T1-T9; T10 (reviews, fresh clone, owner sign-off) in progress. The join form ships switched off (`JOIN_ENABLED`) until the owner approves its wording (OQ-08).
- **Measured after T9 (2026-10-19), median of 5 runs, 375 px, 4x CPU slowdown, 1.6 Mbps, 750 ms RTT, empty cache:** home 3 requests, HTML 2.8 KB transfer (6.8 decoded), CSS 4.7 (14.4), LCP 1600 ms; directory 2.7 KB CSS transfer (9.0 decoded), LCP 1584 ms; category, profile and request LCP 1576 to 1580 ms with the 18.6 KB display font loading after first paint (`font-display: swap`). Before Phase 7c the LCP was about 1588 ms, so the redesign did not move it on this profile. Budgets, uncompressed bytes (measurement plus about 20%): HTML home 7800, directory 4700, category 3400, profile 5400, request 8200, how it works 4400, join 4600; CSS 11000 per page and 17600 on the home page (site plus story sheet); admin CSS 8200; JS 400. The font is capped at 30 KB in `font.test.ts`. The home page is the heaviest page by design; it is still one request for HTML plus two small CSS files and no images.

## Phase 8 — Deployment and initial pilot

- **Objective:** go live with a small set of real tailors and learn.
- **Dependencies:** Phase 7; AD-02/05/06/08 resolved; launch criteria items (PRD §15) progressing.
- **Deliverables:** Cloudflare production and staging Workers, D1 and R2 resources, custom domain/TLS, secrets set via Wrangler, migrations applied; D1 export job and R2 replication to the destination chosen in AD-06; **tested restore** (AC-16); uptime check; staging walkthrough by the owner (J1–J4); real tailor content entered with permissions and verification flags; privacy notice and terms live; pilot success thresholds written down (OQ-01); short operations notes (admin runbook, password reset, takedown, deletion).
- **Requirements:** NFR-REL-01, NFR-COST-01, PRD §15 criteria; Cloudflare plan limits checked against pilot expectations.
- **Acceptance:** AC-16; all PRD §15 launch criteria checked off or explicitly waived by the owner in writing.
- **Tests:** smoke tests against production after deploy; restore drill; verify that unpublished/draft items are not reachable or indexed.

## Cross-cutting rules for every phase

- Write or update tests with the code; run lint, typecheck, tests and build; report only what was actually run.
- Update the PRD/ARCHITECTURE/DATA_MODEL when a decision changes, in the same change.
- Do not add anything from PRD §7.3.

## Requirement-to-phase traceability

| Requirements | Phase |
|---|---|
| FR-ADM-01, SEC-01/02/03/06/08/09 | 2 |
| FR-ADM-02/03/04/05/08, FR-REF-08 | 3 |
| FR-PUB-*, FR-DIR-*, FR-PRO-*, ANA-01/02 | 4 |
| FR-ENQ-*, FR-ADM-06/07, SEC-05/07, PRV-01/02/03 | 5 |
| FR-REF-01–07, FR-RPT-*, ANA-03/04/05 | 6 (ANA-03 funnel counts were left out of 5 and 6) |
| NFR-*, SEC-04 (3), PRV-04/05, FR-ADM-09 (anonymise only) | 7 |
| NFR-REL-01, NFR-COST-01, launch criteria | 8 |
