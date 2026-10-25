# Todo: tailor inbox

- [x] **T1 Referral columns. Done 2026-10-25; staging ALTER run.** `shared_to_inbox_at TEXT`, `decline_reason TEXT` (fixed list) in `migrations/0016_referral.sql`; one-off ALTER on staging; types.
  - Verify: schema test (column exists, decline_reason only from the list); local reset still runs all migrations.
  - Files: `migrations/0016_referral.sql`, `tests/workers/schema-enquiry-referral.test.ts`.
- [x] **T2 Inbox module (FR-TPO-09..12). Done 2026-10-25.** `src/modules/referral/inbox.ts`: send and take back (staff), list and get for a tailor with the privacy states, accept and decline (tailor), audit.
  - Verify: unit/integration tests for every state (not sent, sent, accepted, declined, closed, anonymised, taken back) and for another tailor's id.
  - Files: `src/modules/referral/inbox.ts`, `tests/workers/referral-inbox.test.ts`.
- [x] **T3 Staff buttons (FR-TPO-09, FR-TPO-13). Done 2026-10-25 (a new staff route `/admin/enquiries/[id]/referrals/[rid]/inbox`, `referral.edit`).** "Send to the tailor's inbox" and "Take back" on each referral card; "WhatsApp tailor" message points at the portal; the tailor's answer shown on the referral.
  - Verify: integration test of the buttons and permission; message holds the reference only.
  - Files: referral card in `src/pages/admin/enquiries/[id].astro`, `src/modules/referral/update.ts` or inbox actions, `src/modules/contact-links/admin-links.ts`.
- [ ] **T4 Portal inbox (FR-TPO-10..12).** "Requests for you" tab, list with the count on the overview, item page with Accept and Decline (+ reason), contact details after Accept.
  - Verify: integration per state; e2e and axe at 375 px; portal route inventory and isolation tests.
  - Files: `src/pages/portal/requests.astro`, `src/pages/portal/requests/[id].astro`, `src/modules/portal/routes.ts`, `src/layouts/PortalLayout.astro`, `src/pages/portal/index.astro`.
- [ ] **T5 Owner alert (FR-TPO-13).** Best-effort alert "Tailor accepted / declined AT-XXXX" with a link; reference only.
  - Verify: unit test of the text; a failing sender never breaks the answer.
  - Files: `src/modules/notify/index.ts`, inbox answer path.
- [ ] **T6 Close.** Isolation + privacy matrix, mutation checks seen failing, e2e, STATUS, DECISIONS, DEPLOY note for the staging ALTER, run `privacy-scope-reviewer` and `docs-sync`, deploy staging.
