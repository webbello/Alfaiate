# Plan: Phase 6 — Referral tracking and basic reporting

Spec: [docs/SPEC-phase-6.md](../docs/SPEC-phase-6.md) (approved 2026-10-19). Tasks: [todo.md](todo.md). Earlier plans are in git history (Phase 5: `8f6d57c`).

## Order and dependencies

```
T1 Dili date helpers + period ranges (pure)
T1 ──> T2 create referral (consent, approval, one active) + list query (fee columns only on request)
T2 ──> T3 update referral: forwarding, response, completion (+ audit, owner_confirmed rule)
T3 ──> T4 fee rules (amount, status, paid date, BR-09 agreed terms) + audit
T2 + T3 + T4 ──> T5 admin routes (3) + Referrals section on the enquiry page + route inventory ([rid])
T1 ──> T6 reporting metrics (M1–M9, hand-computed seeded dataset, AC-14)
T6 ──> T7 dashboard on /admin (period selector, fee figures owner-only)
T5 + T7 ──> T8 Playwright + axe (referral journey, dashboard)
all ──> T9 docs, reviewers, security audit, fresh clone, manual look
```

One task at a time, one commit each, commit only when `npm run check` exits 0 (`npm run test:e2e` must pass before T8 and T9 are ticked). No migration: every rule is enforced in the module and, where it already exists, by the database.

## Risks

| Risk | Mitigation |
|---|---|
| A manager sees fee data | The referral query selects fee columns only when the caller passes `withFees` (set only for `fee.view`); the fee route needs `fee.view`; integration test searches a manager's page and response for seeded fee values; mutation check on the flag |
| Rules only in the form | Every rule lives in the module and is tested there; AC-12 rules also have database triggers, and tests prove both layers (a direct INSERT is refused by the trigger) |
| Two admins create an active referral at once | The "one active" check is inside the INSERT (insert-select with a NOT EXISTS clause), so a second concurrent create inserts nothing; test with two parallel creates |
| Wrong period boundaries (UTC vs Dili) | One helper module converts Dili days to UTC bounds; tests at midnight edges on both sides and across month ends; metrics tests use events just inside and just outside each boundary |
| Metrics that look right but count wrong | Expected values for the seeded dataset are written out by hand, plus a cross-check against plain counts; zero denominators tested; spam exclusion tested; each figure has a mutation check |
| Ratios mislead on small numbers | Each ratio is shown with numerator and denominator and labelled "reported"; "no data" for zero denominators |
| A completion is shown as verified | The wording is "reported" everywhere (test scans the dashboard and enquiry page); `owner_confirmed` is owner-only |
| BR-09 bypass (fee due before terms agreed) | The fee module checks the tailor's `fee_terms_agreed_on` for `due` and `paid`; test and mutation check; the form says why it was refused |
| Customer data on the dashboard | The dashboard queries only counts and sums, never names, numbers or notes; test seeds a recognisable customer and searches the page |
| Fee amount parsing mistakes | Reuse `dollarsToCents` (already tested); reject negatives, more than two decimals and absurd sizes; stored as integer cents |
| Dashboard slows `/admin` | A few indexed aggregate queries on pilot-size data, run in one batch; no caching needed now |

## Verification checkpoints

- After T2: AC-12 holds at module and database level, and two parallel creates leave one active referral.
- After T5: a manager can run the whole referral journey except fees; the owner can also record a fee; nothing changes an enquiry's status.
- After T7: AC-14 passes for each period against the seeded dataset.
