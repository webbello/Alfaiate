# Status

Update this file at the end of every working session. Keep it short.

- **Current phase:** Phase 3 built (2026-10-19), reviewers pending. Next after review: Phase 4 — see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); write its spec first (`/agent-skills:spec`).
- **Done:** docs, agent setup; Phase 1 skeleton; Phase 2 (schema, auth, RBAC, sessions, headers, user management, owner scripts); Phase 3 admin side (categories and areas, tailor profiles with edit lock, categories/prices/areas/notes, approval and publishing with reasons, verified facts, owner-only fee terms, photo upload with server validation, permission-gated public image route).
- **Check command:** `npm run check` = lint + typecheck + unit/D1 tests + build + integration tests.
- **Blocked on owner:** nothing blocks Phase 4. Later: OQ-10 (real categories and areas; placeholders until then), OQ-06 (notification channel, Phase 5), OQ-08/09 (privacy text, retention, Phases 5/8), OQ-03/04 (fee model, Phase 6).
- **Open:** Phase 3 reviewer findings (in progress). PBKDF2 stays at 600000 on Workers Paid; re-measure on the deployed Worker in Phase 8. Upload script verified in one browser engine only (Chromium); try Safari/Firefox when convenient. No owner account exists locally: run `npm run db:migrate` then `npm run owner:create` to sign in.
