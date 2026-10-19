# Status

Update this file at the end of every working session. Keep it short.

- **Current phase:** Phase 2 built except T8 (phone normalisation, blocked on AD-10) — reviewed, fixes applied (2026-10-18). Next: Phase 3 — see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); write its spec first (`/agent-skills:spec`).
- **Done:** docs, agent setup, Phase 1 skeleton; Phase 2: full schema + constraint tests, PBKDF2 hashing, sessions, CSRF, login with rate limiting, deny-by-default RBAC, security headers, admin shell, user management, owner scripts, AC-09 role matrix on real requests.
- **Check command:** `npm run check` = lint + typecheck + unit/D1 tests + build + integration tests.
- **Blocked on owner:** OQ-06 (notification channel, Phase 5), OQ-08/09 (privacy, retention, Phase 5/8), OQ-03/04 (fee model, Phase 6), OQ-10 (areas/categories), AD-10 (phone format, blocks T8; the owner's message was cut off twice).
- **Open:** reviewers (privacy/scope, docs-sync, security) ran on Phase 2 and their fixes are applied; T8 phone normalisation waits for the AD-10 rule. PBKDF2 stays at 600000 on Workers Paid (AD-02 answered); re-measure on the deployed Worker in Phase 8. No owner account exists yet: create one with `npm run owner:create` (local) when you want to sign in.
