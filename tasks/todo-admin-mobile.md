# Todo: admin on the phone (phases A and B)

Each task: acceptance, how to verify, files. Requirement IDs are from the spec.

## Phase A

- [ ] **A1 Dashboard counters (FR-ADM-10).** Four large counters at the top, each a link: new requests, join requests waiting, tailors ready to publish, orders opened today; a role sees only counters it may open.
  - Verify: unit test of the counter query per role; integration test of the page for owner and viewer; at 375 px all four visible without scrolling (e2e).
  - Files: `src/modules/admin-ui/counters.ts` (new), `src/pages/admin/index.astro`, `src/styles/admin.css`, `src/i18n/en.ts`, tests.
- [ ] **A2 Reply time and the 24h flag (FR-ADM-11, FR-ADM-12).** "Average time to first reply" in the figures; New requests older than 24 h show "waiting 24h+" (text) and sort oldest first.
  - Verify: unit tests with fixed dates (exactly 24 h, none replied, one replied); list order test.
  - Files: `src/modules/reporting/metrics.ts`, `src/modules/enquiry/queries.ts`, `src/pages/admin/enquiries.astro`, tests.
- [ ] **A3 WhatsApp buttons (FR-ADM-13).** "WhatsApp customer" on a request, "WhatsApp tailor" on a referral; message has the reference only; plain line when no number.
  - Verify: unit test that the message contains the reference and nothing else of the request; integration test of both pages.
  - Files: `src/modules/contact-links/whatsapp.ts` (reuse), `src/pages/admin/enquiries/[id].astro`, tests.
- [ ] **A4 Global search (FR-ADM-14).** Search box in the top bar; `/admin/search?q=` returns requests, tailors and orders by reference, name or phone within the role's rights; nothing logged; query not kept in analytics.
  - Verify: matrix test (owner, manager, editor, viewer x three sources); `%`, emoji and backslash input (D1 pattern limit, lesson 2026-10-19); route inventory and contract baseline updated.
  - Files: `src/pages/admin/search.astro` (new), `src/modules/admin-ui/search.ts` (new), `src/layouts/AdminLayout.astro`, tests.
- [ ] **A5 Bottom bar and phone layout (FR-ADM-15).** Below the mobile breakpoint a bottom bar: Enquiries, Shop orders, Tailors, More; sidebar unchanged above it.
  - Verify: e2e at 375 and 320 px (no sideways scroll, bar does not cover the last content or focus, keyboard order); axe; contrast test.
  - Files: `src/layouts/AdminLayout.astro`, `src/modules/admin-ui/nav.ts`, `src/styles/admin.css`.
- [ ] **A6 Request card on a phone (FR-ADM-16).** Card with reference, area, garment, waiting time; four large buttons (WhatsApp, status chips, assign placeholder hidden until phase C, note); details below; 44 px targets.
  - Verify: e2e at 375 px; status change by one tap works without JavaScript; axe.
  - Files: `src/pages/admin/enquiries.astro`, `src/pages/admin/enquiries/[id].astro`, `src/components/admin/StatusChip.astro`, `src/styles/admin.css`.
- [ ] **A7 Confirmations (FR-ADM-17).** Two-step (details/summary, no JavaScript) only for publish or unpublish, tailor sign-in off, anonymise; none elsewhere.
  - Verify: integration test that the three forms are inside a confirm control and a status change is not; keyboard test.
  - Files: `src/pages/admin/tailors/[id].astro`, `src/pages/admin/enquiries/[id].astro`, `src/styles/admin.css`.
- [ ] **A8 Close the phase.** Update PRD rows, STATUS, DECISIONS; run `privacy-scope-reviewer` and `docs-sync`; owner click-through on staging at a phone.

## Phase B

- [ ] **B1 Keep me signed in (FR-ADM-18).** Tick at sign-in; 30-day renewing session when ticked, current limits when not; password change and account switch-off end all sessions; "Sign out everywhere" button on My account.
  - Verify: unit tests with a fake clock (29 days kept, 30 ended, unticked ends at 30 minutes idle); integration test of the cookie lifetime and of switch-off.
  - Ask first: a column on the session table (owner approves the migration wording).
  - Files: `src/modules/auth/session.ts`, `src/modules/auth/login.ts`, `src/pages/admin/login.astro`, `src/pages/admin/account.astro`, tests.
- [ ] **B2 Add to home screen (FR-ADM-19).** Manifest "Alfaiate Admin", icon (wordmark tile, draft OQ-A3), standalone, scope `/admin`; linked only from admin pages; no service worker.
  - Verify: integration test of the manifest and its link; the public pages do not link it; CSP unchanged.
  - Files: `public/admin.webmanifest`, `public/images/admin-icon-*.png`, `src/layouts/AdminLayout.astro`.
- [ ] **B3 Order alert (FR-ADM-20).** New notice kind `order`; sent best-effort after an order is recorded; text has the reference and an admin link only.
  - Verify: unit test of `notificationText`; test that a failing sender does not break the order; no item or customer text in the notice.
  - Files: `src/modules/notify/index.ts`, `src/modules/orders/whatsapp-service.ts`, `src/pages/order.astro` and `src/pages/tet/order.astro`, tests.
- [ ] **B4 Go-live gate.** Deploy staging, test on the owner's phone (install, 30-day sign-in, alerts, WhatsApp buttons, search), then production per `docs/DEPLOY.md` section E.

## Phases C and D (planned after launch)

C: Helper role (FR-ADM-21), assignee on requests and its filters (FR-ADM-22, 23); needs migrations (ALTER once production exists). D: two-step sign-in (FR-ADM-24). Each gets its own plan, tasks and owner approval.
