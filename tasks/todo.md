# Tasks: Phase 6

- [x] **T1 Dili date helpers and period ranges**
  - Acceptance: `diliToday(now)` gives the Dili calendar day (UTC+9) as `YYYY-MM-DD`; `isDiliDate` validates a real date; `periodRange(period, now)` for `month` (current Dili calendar month), `30d` (last 30 Dili days including today) and `all` returns date bounds (inclusive start, exclusive end) as Dili days and as UTC timestamps for `created_at` comparisons; an unknown period falls back to `month`.
  - Verify: unit tests at midnight edges (UTC 14:59 vs 15:00 on the day before), month and year ends, leap day, 30-day window, invalid input; fail first.
  - Files: `src/modules/referral/dates.ts`, `src/modules/reporting/period.ts`, `tests/workers/referral-dates.test.ts`, `tests/workers/reporting-period.test.ts`

- [x] **T2 Create a referral and list referrals**
  - Acceptance: `createReferral(db, {enquiryId, tailorId, userId})` refuses an unknown enquiry or tailor, an enquiry without sharing consent or anonymised (`no_consent`), a tailor not `approved` (`not_approved`) and an enquiry that already has a referral with response `pending` or `accepted` (`already_active`), the last check inside the INSERT so parallel creates cannot both succeed; allowed after `declined` or `no_response`, and the old referral stays; writes a `referral_created` audit row (ids only); `listReferrals(db, enquiryId, {withFees})` returns explicit columns and includes fee columns only when `withFees` is true; `approvedTailors(db, preferredId)` lists approved tailors with the preferred one first.
  - Verify: unit/D1 tests for each refusal, a direct SQL INSERT refused by the triggers (AC-12), two parallel creates, history kept after reassignment, the result for `withFees: false` has no fee keys; mutation checks on consent, approval, the one-active clause and the fee flag.
  - Files: `src/modules/referral/create.ts`, `src/modules/referral/queries.ts`, `src/modules/auth/audit.ts`, `tests/workers/referral-create.test.ts`

- [x] **T3 Update forwarding, response and reported completion**
  - Acceptance: `updateReferral(db, {id, userId, role, input})` records forwarded date (valid Dili date or empty), method (`whatsapp|phone|sms|in_person|other` or empty), shared-fields note (max 500), response (`pending|accepted|declined|no_response`) with response date (today's Dili date when a non-pending response has none), completion date with reporter (`tailor|customer|owner_confirmed`; both or neither; `owner_confirmed` only for the owner), and `closed_reason` (max 300); clearing a completion is allowed; a `referral_updated` audit row (ids only) per change; unknown referral gives `not_found`; a referral of another enquiry is refused.
  - Verify: unit tests for every field and refusal, defaults, owner-only `owner_confirmed`, audit content, hostile text kept as plain text; mutation checks on the owner-only rule and the pairing rule.
  - Files: `src/modules/referral/update.ts`, `tests/workers/referral-update.test.ts`

- [x] **T4 Fee rules**
  - Acceptance: `setFee(db, {id, userId, input})` (caller must hold `fee.view`, enforced by the route) records amount in dollars as cents (no negatives, at most two decimals, at most 1,000,000), `fee_basis_note` (max 300), `order_value_note` (max 300), status (`not_due|due|paid|waived|disputed`) and paid date; refuses an amount with no reported completion (`needs_completion`), `paid` without a paid date (`needs_paid_date`), and `due` or `paid` when the tailor has no `fee_terms_agreed_on` (`no_agreed_terms`, BR-09); `waived` and `not_due` need nothing; a `referral_fee_updated` audit row (ids only); nothing is computed or suggested.
  - Verify: unit tests for each rule and message, cents conversion edges, audit content without amounts; mutation checks on BR-09 and the completion rule.
  - Files: `src/modules/referral/fee.ts`, `tests/workers/referral-fee.test.ts`

- [x] **T5 Admin routes and the Referrals section on the enquiry page**
  - Acceptance: `POST /admin/enquiries/[id]/referrals` (`referral.edit`), `POST /admin/enquiries/[id]/referrals/[rid]` (`referral.edit`) and `POST /admin/enquiries/[id]/referrals/[rid]/fee` (`fee.view`) with CSRF, plain digit ids, redirect with an allow-listed message; the enquiry page lists referrals (history included) with forms for a manager and owner, and fee fields and the fee form for the owner only; the manager's page and response contain no fee value; `concretePath` and the route inventory learn `[rid]`; the role matrix gets valid forms; messages shown through an allow-list.
  - Verify: integration tests for anonymous 302, editor/viewer 403, manager allowed except the fee route 403, owner allowed, missing CSRF 403, bad ids 404, AC-12 end to end, a seeded fee amount absent from a manager's page and from every manager response, `owner_confirmed` refused for a manager; mutation checks on each route's permission and on `withFees`.
  - Files: `src/pages/admin/enquiries/[id]/referrals.ts`, `src/pages/admin/enquiries/[id]/referrals/[rid].ts`, `src/pages/admin/enquiries/[id]/referrals/[rid]/fee.ts`, `src/pages/admin/enquiries/[id].astro`, `src/modules/auth/admin-routes.ts`, `src/i18n/en.ts`, `tests/integration/referrals.test.ts`, `tests/integration/ac09-matrix.test.ts`

- [x] **T6 Reporting metrics**
  - Acceptance: `metrics(db, period, {withFees})` returns M1, enquiries by status, referrals forwarded and accepted, M2, M3, M4, M5, M6, M8 and (only with `withFees`) fees due, disputed, M7 and M9, exactly as defined in the spec, each with numerator and denominator and `null` for a zero denominator; spam excluded; period membership by the date each event was recorded; no names, numbers or notes are queried.
  - Verify: a seeded dataset with every expected value written by hand (AC-14), events just inside and outside each period edge, spam and anonymised enquiries, a waived fee, zero-denominator cases, a cross-check against plain counts over the same rows, `withFees: false` has no fee keys; mutation checks on each metric's edge, denominator and the spam filter.
  - Files: `src/modules/reporting/metrics.ts`, `tests/workers/reporting-metrics.test.ts`

- [x] **T7 Dashboard on /admin**
  - Acceptance: `/admin` shows the figures for `?period=month|30d|all` (default `month`) to roles with `enquiry.view`, with the period links, each figure's definition in plain words, "reported" labels on manual figures and "no data" for empty ratios; fee figures only for the owner and queried only for the owner; editors and viewers see no figures; no customer data on the page.
  - Verify: integration tests per role and period, seeded customer name and fee amounts absent where they must be, labels present, the existing dashboard tests still pass; mutation checks on the owner-only flag and the default period.
  - Files: `src/pages/admin/index.astro`, `src/i18n/en.ts`, `tests/integration/dashboard.test.ts`

- [x] **T8 Playwright and axe**
  - Acceptance: e2e as the throwaway owner creates a referral on the seeded enquiry, records forwarding, response and a reported completion, records a fee (after the seeded tailor has agreed terms), sees the dashboard figures change; axe zero violations on the enquiry page with referrals and on `/admin`; a deliberately broken label fails the suite once, then is reverted.
  - Verify: `npm run test:e2e` passes.
  - Files: `e2e/referral.spec.ts`, `e2e/a11y.spec.ts`, `e2e/seed.sql`

- [ ] **T9 Docs, reviewers, security audit, fresh clone, manual look**
  - Acceptance: README, STATUS, DECISIONS, ARCHITECTURE §4–§6, DATA_MODEL §3.8 and §9, SPEC deviations and AGENTS lessons updated; `privacy-scope-reviewer`, `docs-sync` and `agent-skills:security-auditor` run with no unresolved blockers; one manual look at the dashboard and a referral recorded; launch items written down (fee model OQ-03/04, no fee relied on until agreed).
  - Verify: `npm ci && npm run check` from a fresh clone and `npm run test:e2e`; `git ls-files` has no secrets, databases or uploads.
