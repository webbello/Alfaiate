# Plan: Phase 2 — Data model and admin foundations

Spec: [docs/SPEC-phase-2.md](../docs/SPEC-phase-2.md) (approved 2026-10-18; AD-10 pending). Tasks: [todo.md](todo.md). Phase 1's plan is in git history (`0bf8b9d`).

## Order and dependencies

```
T1 test runtime ──> T2 bindings/config ──> T3 schema A ──> T4 schema B ──> T5 seed
                                    │
                                    ├──> T6 permissions + last-owner ──┐
                                    ├──> T7 password hashing + bench ──┤
                                    └──> T8 phone (BLOCKED on AD-10)   │ (nothing depends on T8 until Phase 5)
T3 + T6 + T7 ──> T9 sessions + CSRF + audit ──> T10 rate limit + login logic
T6 + T9 ──> T11 guard + middleware headers ──> T12 admin shell + route inventory ──> T13 user management
T3 + T7 ──> T14 owner scripts
all ──> T15 docs, reviewers, security audit
```

Strictly one task at a time, one commit each. T8 is skipped until the owner gives the phone rule; the phase can finish without it only if the owner agrees (phone is first used in Phase 5).

## Risks

| Risk | Mitigation |
|---|---|
| Downgrading to Vitest 4.1.12 breaks the Phase 1 container test or pool-workers cannot run Astro code | T1 proves both a container test and a D1 test pass before anything else; if not, stop and ask |
| `DB` binding access differs in Astro 7 + adapter 14 | T2 reads the installed adapter and records the verified pattern |
| Adapter auto-enables `IMAGES` and `SESSION` KV | T2 disables via adapter options or proves unused; decision recorded |
| PBKDF2 too slow for Worker CPU limit | T7 benchmarks; choose iteration count with margin; record the number |
| D1 CHECK constraints cannot express a rule (e.g. cross-table publish rule) | Use triggers for cross-column/cross-table rules, test them; flag if a rule must live in code instead |
| Admin route added without a guard | T12 route-inventory test fails the build |
| Scripts handle passwords | Prompt at run time, never echo or log, never write to files |

## Verification checkpoints

- After T1: container test and a trivial D1 test pass under `npm test`.
- After T4: every DATA_MODEL constraint has a failing-then-passing test.
- After T7: hash timing recorded in DECISIONS.md.
- After T12: AC-09 anonymous cases pass; route inventory complete.
- After T13: AC-09 full role matrix passes.
- After T15: `npm ci && npm run check` from a fresh clone; `privacy-scope-reviewer`, `docs-sync`, `security-auditor` report no blockers.

## Out of scope

Tailor/enquiry/referral admin screens, public pages, customer or tailor logins, email password reset, Cloudflare Access, deploy, remote D1.
