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
- **Deliverables:** assign enquiry to tailor (consent and approval checks); record forward time/method, tailor response, reported completion, fee and payment status; reassignment with history; dashboard counts and metrics M1–M5, M7, M9 labelled as reported; period selector.
- **Requirements:** FR-REF-01–07, FR-RPT-01/02, FR-ADM-09 (Should), ANA-04/05, BR-08/09/10.
- **Acceptance:** AC-12, AC-13, AC-14.
- **Tests:** unit (metric calculations on a seeded dataset, fee/status constraints); integration (refusals, history retained, anonymisation keeps reporting fields); admin end-to-end journey J3.

## Phase 7 — SEO, accessibility, security and testing

- **Objective:** harden and verify against the non-functional requirements.
- **Dependencies:** Phases 1–6.
- **Deliverables:** structured data; canonical/noindex rules; image and CSS/JS budgets measured on throttled mobile (record the numbers and set budgets in this file); full accessibility pass (axe + manual keyboard/zoom/contrast); security review (headers, uploads, auth, dependency audit); privacy review (logs, analytics, backups); expand tests; fix findings.
- **Requirements:** NFR-PERF-01, NFR-A11Y-01, NFR-SEO-01, NFR-BRW-01, SEC-01–08, PRV-04/05, FR-PRO-07.
- **Acceptance:** AC-15, AC-17; no unresolved high-severity security finding; performance numbers recorded.
- **Tests:** full suite; Playwright + axe on key pages; security checklist; no-JavaScript run of browse and form.

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
| FR-REF-01–07, FR-RPT-*, FR-ADM-09, ANA-03/04/05 | 6 (ANA-03 funnel counts may start in 5) |
| NFR-*, SEC-04 (3), PRV-04/05 | 7 |
| NFR-REL-01, NFR-COST-01, launch criteria | 8 |
