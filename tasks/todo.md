# Tasks: Phase 7b

- [x] **T1 Contract test, admin layout, navigation and base stylesheet**
  - Acceptance: first, `tests/integration/admin-contract.test.ts` records for every admin page, as owner and as manager where allowed, the form actions, input and select names, hidden fields and link targets (in a stable, sorted form) and passes on today's code; then `AdminLayout.astro` (header bar with site name, role-based links from `modules/admin-ui/nav.ts`, current page `aria-current="page"`, signed-in email and role, Sign out form, skip link, main landmark) and `src/styles/admin.css` (tokens shared with the public site, 44 px controls, focus styles, reduced motion) replace `Base.astro` on every admin page except the sign-in page, which gets a small centred card; the contract test passes unchanged except for the new nav links (updated in the same commit and listed).
  - Verify: contract test green before and after; unit test of nav links per role (owner, manager, editor, viewer) and per permission; integration tests that each admin page marks its own link current, that the sign-in page has no nav, and that no admin page loads a script; full AC-09 matrix and existing admin tests unchanged; mutation checks on a link's permission and on the current-page marker.
  - Files: `tests/integration/admin-contract.test.ts`, `src/layouts/AdminLayout.astro`, `src/styles/admin.css`, `src/modules/admin-ui/nav.ts`, `src/pages/admin/**` (layout swap only)

- [x] **T2 Banners, status chips, cards, empty-state component and form styles**
  - Acceptance: `modules/admin-ui/messages.ts` classifies every message code in every admin dictionary as success or problem; `Flash.astro` shows "Done" or "Problem" in words with `role="status"` or `role="alert"`; `StatusChip.astro` shows enquiry, referral and tailor states in words; `Card.astro`, `EmptyState.astro`, button variants (primary, secondary, destructive) and form spacing exist in `admin.css`; every page uses the banner instead of its one-line message.
  - Verify: a test iterates all message dictionaries and fails on an unclassified key; integration tests that a problem uses `role="alert"` and a success `role="status"`, and that `?msg=` text is still allow-listed (hostile codes show nothing); contrast test for chip and banner colours (at least 4.5:1); contract test unchanged; mutation checks on the classification of one success and one problem code.
  - Files: `src/modules/admin-ui/messages.ts`, `src/components/admin/*.astro`, `src/styles/admin.css`, `src/pages/admin/**`, tests

- [x] **T3 Dashboard as cards**
  - Acceptance: period as three tab-style links (current marked), the Phase 6 figures as a responsive card grid with the same numbers, labels, definitions and "no data", the status counts as a chip row linking to the inbox filtered by status, the fee block a separate owner-only card, and a getting-started card when there is no data at all (create categories and areas, add a tailor, record permission, publish).
  - Verify: the existing dashboard integration expectations pass unchanged; new tests for the period tabs, the chip links, the owner-only fee card and the getting-started card; the e2e dashboard check still passes; screenshots at desktop and 375 px shown to the owner.
  - Files: `src/pages/admin/index.astro`, `src/components/admin/StatCard.astro`, `src/styles/admin.css`, tests

- [x] **T4 Inbox**
  - Acceptance: per-status counts (spam excluded) on the filter chips, each filtering on click; list sorted new first then newest; rows show reference, received date, name, number, status chip and referral state (none, pending, accepted, declined, no response); labelled large search box; empty-state text with a link to the request form; spam toggle and 100-row cap behave as before.
  - Verify: unit tests for the counts query, the sort order and the referral-state column (including a spam row and an anonymised row); integration tests for chips, filtering, empty state and unchanged search behaviour; contract test unchanged except the new chip links; mutation checks on the sort and on the spam exclusion in the counts.
  - Files: `src/modules/enquiry/queries.ts`, `src/pages/admin/enquiries.astro`, `src/styles/admin.css`, tests

- [ ] **T5 Enquiry page in cards**
  - Acceptance: summary header with status chip and a one-line next-step hint (`modules/admin-ui/next-step.ts`), customer details card, copy-to-forward card, referral cards (history included), status and note forms, status history in a native `<details>`, and the anonymise action last in a warning box shown to the owner only; every form, field, route, permission and server rule unchanged.
  - Verify: contract test unchanged; unit tests for `nextStep` in every state; integration tests that the warning box is owner-only and last, that fees stay hidden from managers, and that anonymised enquiries show the right state; e2e referral journey unchanged; screenshots shown to the owner.
  - Files: `src/pages/admin/enquiries/[id].astro`, `src/modules/admin-ui/next-step.ts`, `src/components/admin/*.astro`, `src/styles/admin.css`, tests

- [ ] **T6 Tailor page checklist, tailors list, empty states**
  - Acceptance: a publish checklist at the top of the tailor page built from `publishBlockers` (each requirement done or missing, with a link to the field that fixes it, and the reason the Publish button cannot be used yet); the tailors list shows status chips and a "needs attention" count; tailors, categories and areas have empty states with the next step; categories and areas lists get the same card styling.
  - Verify: a test compares the checklist with `publishBlockers` for every blocker and for a ready tailor; integration tests for the empty states and chips; contract test unchanged; publish and permission tests unchanged; mutation checks on one checklist rule and on the chip for unpublished tailors; screenshots shown to the owner.
  - Files: `src/pages/admin/tailors/[id].astro`, `src/pages/admin/tailors.astro`, `src/pages/admin/categories.astro`, `src/pages/admin/areas.astro`, `src/components/admin/Checklist.astro`, tests

- [ ] **T7 Demo data (local only)**
  - Acceptance: `seeds/demo.sql` and `scripts/demo.mjs`: `npm run db:demo` adds clearly fake data to the local database only (published "[Demo]" tailors with permission and consent, categories and areas, enquiries in several statuses with referrals and fees, a few tap counts, no photos); `npm run db:demo:remove` deletes exactly those rows (slug prefix `demo-`, reference prefix `AT-DEMO`) and nothing else; the runner refuses `--remote` and any non-local target.
  - Verify: tests on a scratch database: add then remove leaves the database as it was; every inserted row carries a demo marker; no real-looking contact details beyond the made-up pattern; the scripts in `package.json` contain `--local`; the runner exits non-zero when asked for a remote target; running add twice does not duplicate; the check:repo rules still pass.
  - Files: `seeds/demo.sql`, `scripts/demo.mjs`, `scripts/demo-lib.mjs`, `package.json`, `README.md`, `tests/workers/demo-seed.test.ts`

- [ ] **T8 Browser checks and budgets**
  - Acceptance: admin pages added to the 320 px reflow and text-spacing e2e checks; a keyboard path through the header bar; a first-run journey as the throwaway owner (empty system, create category and area, create a tailor, follow the checklist to publish) and a demo-data journey; a byte budget for `admin.css` (measured plus about 20%) enforced in the integration budget test; no admin page loads a script.
  - Verify: `npm run test:e2e` and `npm run check` pass; a removed label on an admin page and an inline script were each seen failing and reverted.
  - Files: `e2e/admin-reflow.spec.ts`, `e2e/first-run.spec.ts`, `tests/integration/budgets.test.ts`, `e2e/seed.sql` if needed

- [ ] **T9 Docs, reviewers, security audit, fresh clone, owner sign-off**
  - Acceptance: README, STATUS (including "run `npm run db:demo:remove` before launch"), DECISIONS, ARCHITECTURE (admin layout section), SPEC deviations and AGENTS lessons updated; privacy-scope, docs-sync and security reviewers run with no unresolved blockers; the owner has clicked through (phone and desktop screenshots recorded, with what was not checked) and signed off.
  - Verify: `npm ci && npm run check` from a fresh clone, `npm run test:e2e`, `npm run perf`; `git ls-files` has no secrets, databases, uploads or photos.
