# Plan: Phase 1 — Project setup

Spec: [docs/SPEC-phase-1.md](../docs/SPEC-phase-1.md) (approved 2026-10-18). Tasks: [todo.md](todo.md).

## Order and dependencies

Strictly sequential; each task leaves `git status` clean after commit.

```
T1 scaffold + pinned deps ──> T2 tooling (lint/format/typecheck) ──> T3 Workers config ──┐
                                                                                          ├─> T5 smoke test + check ──> T6 docs + status
T4 layout, tokens, i18n, module folders (needs T1) ──────────────────────────────────────┘
```

T3 and T4 are independent of each other but run one at a time (small, shared `package.json`).

## Risks

| Risk | Mitigation |
|---|---|
| TypeScript 7 breaks `astro check` | T2 tries it first; falls back to newest working TS; record in DECISIONS.md |
| `@cloudflare/vitest-pool-workers` incompatible with Vitest 5 | T5 tries it; else plain Vitest with a Node-side render test and defer D1 pool to Phase 2; record it |
| Astro scaffold pulls extra deps/files | T1 uses the minimal template and removes anything outside the spec |
| `astro dev` on Workers runtime needs a Cloudflare login | T3 checks local-only mode; if login is required, stop and ask |
| Stop hook starts running `check` mid-phase | Expected once the `check` script exists; fix failures rather than bypass |

## Verification checkpoints

- After T2: `npm run lint && npm run typecheck` pass.
- After T3: `npm run dev` serves `/` with 200 (curl).
- After T5: `npm ci && npm run check` pass on a fresh clone (temp dir).
- After T6: `docs-sync` and `privacy-scope-reviewer` agents report no blockers.

## Out of scope for this phase

Auth, schema, migrations contents, routes other than `/`, Zod, Playwright, CI, deploy, Cloudflare account setup.
