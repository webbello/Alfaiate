# Plan: Phase 7b — Admin UX polish and first-run experience

Spec: [docs/SPEC-phase-7b.md](../docs/SPEC-phase-7b.md) (approved 2026-10-19). Tasks: [todo.md](todo.md). Earlier plans are in git history (Phase 7: `fa9bab3`).

## Order and dependencies

```
T1 contract test (baseline of every admin page's forms, fields, links) + AdminLayout + nav + admin.css; move all pages onto it
T1 ──> T2 banners (message classification), status chips, cards, empty-state component, form and button styles
T2 ──> T3 dashboard: cards, period tabs, status chips, getting-started card
T2 ──> T4 inbox: per-status counts, new-first order, referral state, empty state
T2 ──> T5 enquiry page: reorder into cards, next-step hint, warning box (same forms and rules)
T2 ──> T6 tailor page: publish checklist from the server's rules; tailors list chips; categories and areas empty states
T6 ──> T7 demo data: seeds/demo.sql, local-only runner, remove command, safety tests
T3..T7 ──> T8 browser: admin reflow and text spacing, nav keyboard path, first-run and demo journeys, admin stylesheet budget
all ──> T9 docs, reviewers, security audit, fresh clone, owner click-through with screenshots, sign-off
```

One task at a time, one commit each, commit only when `npm run check` exits 0 (`npm run test:e2e` must pass before T8 and T9 are ticked). After T1, T3, T5 and T6 I show screenshots (built-in browser) so the owner can steer before the next slice. No migration, no dependency.

## Risks

| Risk | Mitigation |
|---|---|
| A refactor of 1,700 lines of admin markup silently drops a form, field or link | T1 starts with a contract test that records, for every admin page and role, its form actions, input names and link targets, passing on today's code; it must stay green unchanged through T1 to T6 (updated only where the spec adds something, in the same commit) |
| A new layout breaks the sign-in or owner flows | Sign-in keeps its own small card layout; the full integration, AC-09 matrix and e2e suites run after every task |
| Message classification misses a key and a problem shows as success | One module maps every code to success or problem; a test iterates every message dictionary and fails on an unclassified key |
| Colour used as the only signal, or low contrast | Chips and banners carry words; colours checked with the contrast calculator in a test; axe runs over all admin pages |
| Checklist disagrees with the server's publish rules | The checklist is built from `publishBlockers`, the server's own function; a test compares them for every blocker |
| Layout looks fine on desktop but breaks at 320 px | Admin pages join the reflow and text-spacing e2e checks; screenshots at phone width before sign-off |
| Demo data reaches a real database | Not a migration; the runner uses `--local` only and refuses anything else; tests assert both; every row carries the demo prefix; remove deletes by prefix; STATUS lists "run db:demo:remove" as a pre-launch item |
| Demo numbers collide with real people's numbers | Made-up numbers in a clearly unassigned pattern, names prefixed "[Demo]", local database only |
| Stylesheet grows without limit | Byte budget from the measured size plus about 20%, enforced in `npm run check` |
| Scope creep into public site or new features | The spec's exclusions stand; every task cites the review item it implements |

## Verification checkpoints

- After T1: the contract test is green, every admin page shows the header bar with role-correct links and the current page marked, and screenshots are approved by the owner.
- After T5: the enquiry page keeps every earlier form and rule (contract test) and the anonymise warning is last and owner-only.
- After T7: demo data loads and removes cleanly on a scratch database and cannot target a remote one.
- After T8: axe, reflow, CSP and budget checks are green on all admin pages.
