# Plan: Phase 7c — Public site art direction and conversion

Spec: [docs/SPEC-phase-7c.md](../docs/SPEC-phase-7c.md) (approved 2026-10-19, all open-question defaults accepted). Tasks: [todo.md](todo.md). Phase 7b plan is in git history (before this commit).

**Carried over:** Phase 7b T9 is not finished: the owner's click-through and sign-off are pending (reviews, fresh clone, e2e and perf already passed). Phase 7c does not start building until the owner says 7b is signed off or says to go ahead anyway.

## Order and dependencies

```
T1 art direction doc, tokens (palette, type scale), font choice shown to owner, contrast test, font self-hosted
T1 ──> T2 layout shell: header, footer, sticky mobile bar (WhatsApp hidden until the number is set)
T2 ──> T3 home hero: type, 3D swatch, stitch line, calls to action
T3 ──> T4 story sections: promise, how it works (pattern pieces), craft (tape measure), local story, trust, final call, tailor banner
T2 ──> T5 directory, category and profile restyle with illustrated swatch fallback and photo slots
T2 ──> T6 two-step request page and thanks (works without JavaScript)
T2 ──> T7 /join: migration 0003, module, form, admin list, RBAC tests, route inventory
T2 ──> T8 static pages, 404, Tetum parity
T3..T8 ──> T9 motion rules: reduced-motion, no-JS, axe, reflow, CSP, perf, budgets measured then enforced
all ──> T10 docs, reviewers, security audit, fresh clone, owner sign-off
```

One task at a time, one commit each, only when `npm run check` exits 0; `npm run test:e2e` must also pass before committing any task that changes a page (lesson 2026-10-19). Screenshots go to the owner after T3, T4, T6 and T7, and the font specimen after T1.

## Risks

| Risk | Mitigation |
|---|---|
| Heavy visuals slow the page on weak phones | Budgets measured then enforced (T9); CSS-only motion; story CSS only on pages that use it; `npm run perf` before and after |
| Decorative 3D hides or replaces content | Everything decorative is `aria-hidden`; reduced-motion and no-3D runs must leave a complete page |
| Invented proof (testimonials, counts, stock photos) | Forbidden by BR-11 in the spec; a copy review list in `docs/ART_DIRECTION.md`; every new string marked REVIEW until the owner approves |
| `/join` drifts into tailor accounts | Table `tailor_interest` only; no link to `tailor`; test that it creates no tailor row; PRD note added |
| New public page leaks into sitemap or analytics wrongly | Scope-guard list in `tests/workers/public-pages.test.ts` updated on purpose |
| Tetum copy shipped unreviewed | Tetum stays gated by `PUBLIC_LANGUAGES`; parity test |
| Cultural motifs misused | Abstract geometry only, owner reviews before use |
