# Plan: Phase 7 — SEO, accessibility, security, privacy and testing

Spec: [docs/SPEC-phase-7.md](../docs/SPEC-phase-7.md) (approved 2026-10-19). Tasks: [todo.md](todo.md). Earlier plans are in git history (Phase 6: `02b6e86`).

## Order and dependencies

```
T1 SITE_INDEXABLE flag (robots, sitemap, meta, header)
T1 ──> T2 structured data + Open Graph in the shared layout
T3 carried-over security fixes (public permission clause, malformed phone, friendly 403, sitemap index)   (independent)
T4 anonymise enquiry (module, route, page form)                                                          (independent)
T3 + T4 ──> T5 security and privacy tests (repo check, whole-tree console check, header matrix, cookies, extended AC-15 sweep)
T2 + T4 ──> T6 accessibility (axe 2.2 on public and admin pages, CSP watcher, no-JavaScript, reflow and zoom)
T2 ──> T7 performance (perf script, measured numbers, budgets, byte-budget test)
T5 + T6 + T7 ──> T8 dependency audit and the written security and privacy reviews
all ──> T9 docs, reviewers, security audit, fresh clone, manual accessibility checks
```

One task at a time, one commit each, commit only when `npm run check` exits 0 (`npm run test:e2e` must pass before T6 and T9 are ticked). No migration and no new dependency.

## Risks

| Risk | Mitigation |
|---|---|
| Structured data leaks something unverified or unconsented | A builder with an explicit allow-list of keys; tests for consent, permission and publication gates; hostile text cannot close the block; mutation checks on each gate |
| JSON-LD interacts with the strict CSP | Data blocks are not executed; an integration test compares the CSP header before and after, and the e2e CSP watcher fails on any violation |
| `SITE_INDEXABLE` misread leaves staging indexable | Only the exact string `true` enables indexing; missing, empty or any other value means not indexable; tests for each; header, meta, robots and sitemap all read the same function |
| Performance numbers differ run to run | Median of five runs, same profile, local machine stated as a limit; budgets only on bytes in `npm run check`; timings reported, not enforced |
| Accessibility fixes change layout | Fix only what axe or a manual check reports; re-run the full e2e; keep tokens and spacing unless a ratio fails |
| Axe on admin pages finds many issues | Triage by severity; fix in the same task; anything not fixed is listed in DECISIONS.md with a reason, never silenced in the test |
| Anonymise destroys data by mistake | Owner only (`enquiry.delete`), reference code typed to confirm, one atomic batch, audit row, idempotent; tests prove the cleared and kept fields exactly |
| Anonymise leaves customer text behind | The clear list comes from the CHECK and the spec (six columns, referral free text, internal notes); a test seeds every one with a marker and searches the whole database for it afterwards |
| Repo check blocks legitimate files | An explicit allow-list for the few tracked image files (if any) and a clear message naming the file; tested with fake tracked names in a temporary repo |
| Whole-tree `console.*` check is too strict | It allows constant strings only, fails with file and line, and the few legitimate dynamic cases (none today) would need an explicit, commented allow-list entry |
| Dependency audit needs the network | Run once for the record; findings recorded in DECISIONS.md; not part of `npm run check` (so offline work still passes) |
| Scope creep into features | The spec's exclusions stand (no new pages, no retention timer, no deployment); every task cites the finding it fixes |

## Verification checkpoints

- After T1: staging mode gives disallow-all robots, noindex everywhere and an empty sitemap, production unchanged.
- After T4: the database search for seeded personal markers finds none after anonymising, and reporting figures are unchanged.
- After T6: axe (WCAG 2.2 AA) is clean on all public and admin pages, and browse and the request form work with JavaScript off.
- After T7: numbers and budgets are recorded in IMPLEMENTATION_PLAN.md and the byte-budget test passes.
