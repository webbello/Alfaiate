# Plan: Phase 4 — Public site (homepage, directory, categories, profiles)

Spec: [docs/SPEC-phase-4.md](../docs/SPEC-phase-4.md) (approved 2026-10-19). Tasks: [todo.md](todo.md). Earlier plans are in git history (Phase 3: `17c9b65`).

## Order and dependencies

```
T1 language helpers + site config ──> T2 dictionaries + layout + styles + 404 + Tetum gate
T2 ──> T3 link builders, price format, filter parsing (pure)
T2 ──> T4 directory data module (explicit columns, view models)
T3 + T4 ──> T5 home + request placeholder ──> T6 directory + category pages ──> T7 tailor profile
T2 ──> T8 static pages (how it works, about, privacy, terms)
T4 + T8 ──> T9 sitemap + robots + canonical/noindex rules
T4 + T7 ──> T10 contact tap counter (module, endpoint, script)
T7 + T8 ──> T11 Playwright + axe (mobile journey, accessibility, both languages)
all ──> T12 docs, reviewers, security audit, fresh clone, manual look
```

One task at a time, one commit each, commit only when `npm run check` exits 0 (e2e is run separately and must pass before T11 and T12 are ticked). Every public page is built in English and Tetum from the start through shared views, so the two languages cannot drift.

## Risks

| Risk | Mitigation |
|---|---|
| Tetum text is mine and unreviewed | Typed dictionaries guarantee every string exists; Tetum is off in production by default (`PUBLIC_LANGUAGES`); the launch checklist blocks on the owner's review |
| A public query leaks a private column | Explicit column lists only; view-model key test; HTML sweep for seeded private values; mutation checks |
| Playwright cannot drive the built Worker with a seeded database | T11 starts with a small spike (build, `wrangler dev` on a temp persisted DB, one Playwright request). If it fails, fall back to the Astro dev server (already proven to work with the local D1) and record it |
| Strict CSP (no inline styles/scripts) fights page features | Stylesheet is an external file, the beacon script is external, nothing needs inline code; an integration test scans every public page |
| Duplicate English and Tetum route files drift | Thin wrapper pages around shared views; a test lists the public routes in both languages and fails if one is missing |
| Public pages query D1 on every request (cost and speed) | Pilot-size lists and indexed queries now; edge caching and budgets belong to Phase 7 (measured, not assumed) |
| Contact counter inflated or abused | Per-address hashed rate limit, published tailors and real channels only, same-origin check, no personal data; counts documented as intent signals |
| Filters build SQL from user input | Query values are parsed against whitelists (slugs looked up, flags as booleans) and always bound; fuzz-style test with hostile values |
| `hreflang`/canonical wrong without a domain | `SITE_URL` placeholder from configuration; tests assert the structure, Phase 8 sets the real value |
| Layout work balloons | Simple mobile-first styles with system fonts; design skill used once at T2; polish waits for staging feedback |

## Verification checkpoints

- After T2: both languages render a shell page; `/tet/...` is 404 when Tetum is off.
- After T4: the "only published, only consented, only permitted" table test passes.
- After T5: AC-01 passes in integration (both languages).
- After T6: AC-02 passes (each filter alone and combined).
- After T7: AC-03, AC-04, AC-05 pass; the private-value HTML sweep passes for all public pages so far.
- After T10: tap counting works end to end and leaves no personal data.
- After T11: Playwright mobile journey and axe scans pass (English and Tetum).
- After T12: `npm ci && npm run check` from a fresh clone; `npm run test:e2e`; three reviewers report no blockers.

## Out of scope

Enquiry form and storage (Phase 5), referral tracking (Phase 6), structured data, performance budgets and edge caching (Phase 7), production domain, deploy and real content (Phase 8), area pages, search, reviews, accounts.
