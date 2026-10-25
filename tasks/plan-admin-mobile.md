# Plan: Admin on the phone, phases A and B (then go live; C and D follow)

Spec: [docs/SPEC-admin-mobile.md](../docs/SPEC-admin-mobile.md) (approved 2026-10-25, the draft answers to OQ-A1..A4 accepted). Tasks: [todo-admin-mobile.md](todo-admin-mobile.md). Phases C (helper, assignment) and D (two-step sign-in) get their own plan after launch.

**Before task A1:** the eight old uncommitted files (launch question Q18 is still open) include `src/pages/admin/tailors/[id].astro`, `Flash.astro` and `admin.css`, which tasks A5, A6 and A7 also edit. Review and commit or set aside those first so the diffs stay clean.

## Order and dependencies

```
A1 dashboard counters ──> A2 reply time + 24h flag ──> A6 request card (needs A2 flag, A3 buttons)
A3 WhatsApp buttons (request, referral)             ──> A6
A4 global search (top bar)                          independent of A1..A3
A5 phone bottom bar and layout                      independent; A6 sits inside it
A7 confirmations on three actions                   independent
A1..A7 ──> A8 docs, reviewers, e2e at 375 and 320 px, owner click-through
B1 keep me signed in (session) · B2 add to home screen · B3 order alert  independent of each other
A8 + B1..B3 ──> B4 staging check on a real phone, then production go-live (DEPLOY.md section E)
```

One task at a time, one commit each, only when `npm run check` exits 0 and, for any page change, `npm run test:e2e` passes (AGENTS lessons). Edits to existing files go through `node scripts/replace-once.mjs`; deploy with `npm run deploy:staging`.

## Findings that shape the plan

- The notifier already has `interest` and `tailor-ready` kinds; only **shop orders** have no alert (B3). FR-ADM-20 is therefore one new kind, not three.
- The dashboard already has `todoItems` ("What needs you now") and `metrics`; A1 and A2 extend them rather than add a second system.
- Enquiries list and detail are 150 and 510 lines; the request card (A6) is a presentation layer over the same data and status form, not a new route.
- The admin has a route inventory and a contract baseline test: A4 adds `/admin/search` and must update both on purpose.

## Risks

| Risk | Mitigation |
|---|---|
| Search leaks what a role may not see | One query per source, each guarded by its own permission; test every role against every source |
| Bottom bar covers content or focus on a phone | `padding-bottom` and `scroll-margin` on the main area; e2e at 375 and 320 px, keyboard test |
| Long session is stolen with a phone | 30-day session only when ticked; "Sign out everywhere"; ended by account switch-off or password change; two-step (phase D) follows before any helper |
| Many edits in two large page files | One concern per task, `replace-once`, `npm run test:e2e` before each commit |
| Real-phone behaviour unknown (OQ-A4) | B4 tests on the owner's phone before production |

## Checkpoints

After A5: the owner looks at the dashboard and bottom bar on a phone (staging). After B4: go-live decision.
