# Decisions log

Append-only. One entry per decision the owner makes or an implementation choice that changes the design. Never silently decide an OQ-/AD- item; record the owner's answer here and update the affected doc.

| Date | Decision | Resolves | Docs updated |
|---|---|---|---|
| 2026-10-18 | Backups are daily (D1 export + R2 replication), matching NFR-REL-01. | AD-06 frequency | ARCHITECTURE §12, §15 |
| 2026-10-18 | Owner notification email contains only the reference code and an admin link; no name, phone or notes. Destination channel still open (OQ-06). | FR-ENQ-08 / SEC-05 | ARCHITECTURE §7 |
| 2026-10-18 | Phase 1 spec approved: npm; try TypeScript 7 with fallback to newest version `astro check` supports; ESLint (astro plugin) + Prettier; try `@cloudflare/vitest-pool-workers`, else defer D1 tests to Phase 2; no CI until a remote exists. Astro 7.4.0 confirmed on npm. | AD-01 (versions), Phase 1 open questions | SPEC-phase-1.md |
