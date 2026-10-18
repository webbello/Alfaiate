# Decisions log

Append-only. One entry per decision the owner makes or an implementation choice that changes the design. Never silently decide an OQ-/AD- item; record the owner's answer here and update the affected doc.

| Date | Decision | Resolves | Docs updated |
|---|---|---|---|
| 2026-10-18 | Backups are daily (D1 export + R2 replication), matching NFR-REL-01. | AD-06 frequency | ARCHITECTURE §12, §15 |
| 2026-10-18 | Owner notification email contains only the reference code and an admin link; no name, phone or notes. Destination channel still open (OQ-06). | FR-ENQ-08 / SEC-05 | ARCHITECTURE §7 |
| 2026-10-18 | Phase 1 spec approved: npm; try TypeScript 7 with fallback to newest version `astro check` supports; ESLint (astro plugin) + Prettier; try `@cloudflare/vitest-pool-workers`, else defer D1 tests to Phase 2; no CI until a remote exists. Astro 7.4.0 confirmed on npm. | AD-01 (versions), Phase 1 open questions | SPEC-phase-1.md |
| 2026-10-18 | TypeScript pinned to 6.0.3, not 7.0.2: `@astrojs/check` 0.9.10 peers `typescript ^5 \|\| ^6` and `typescript-eslint` 8.71.2 peers `<6.1.0`. Revisit when both support 7. | Phase 1 open question 1 | SPEC-phase-1.md |
| 2026-10-18 | Vitest 5.0.5 kept. `@cloudflare/vitest-pool-workers` 0.23.0 peers `vitest ^4.1.0`, so the Workers/D1 test pool is deferred to Phase 2 (revisit: Vitest 4.1.12 also passes the smoke test). Tests render components via Astro's container; `astro.config.mjs` skips the Cloudflare adapter when `VITEST` is set because the adapter's workerd server clashes with Vitest. | Phase 1 open question 3 | SPEC-phase-1.md |
| 2026-10-18 | Open for Phase 2 (not decided): the Cloudflare adapter logs that it auto-enables an `IMAGES` binding and a `SESSION` KV binding. ARCHITECTURE keeps sessions in D1 and images in R2 with client-side resizing (AD-04), so confirm these are disabled or unused before Phase 2/3. | AD-04 / auth design | — |
