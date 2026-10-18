# Tasks: Phase 2

- [ ] **T1 Test runtime: Vitest 4.1.12 + Workers pool**
  - Acceptance: Vitest pinned 4.1.12, `@cloudflare/vitest-pool-workers` pinned 0.23.0; two Vitest projects (Astro container tests, Workers/D1 tests); Zod 4.6.7 installed; Phase 1 smoke test still passes.
  - Verify: `npm test` runs both projects green, including a trivial D1 `SELECT 1` test that failed first.
  - Files: `package.json`, `package-lock.json`, `vitest.config.ts`, `tests/d1-smoke.test.ts`, `docs/DECISIONS.md`

- [ ] **T2 Bindings access and config module**
  - Acceptance: verified way to read `DB`/R2 in Astro 7 + adapter 14 recorded; `IMAGES`/`SESSION` bindings disabled or proven unused (recorded); `config` module returns typed bindings and fails closed when missing.
  - Verify: unit test: missing `DB` throws, present returns; `npm run build` output has no `SESSION`/`IMAGES` binding (or decision recorded why).
  - Files: `src/modules/config/index.ts`, `astro.config.mjs`, `wrangler.jsonc`, `tests/config.test.ts`, `docs/DECISIONS.md`

- [ ] **T3 Schema A: admin and tailor-side tables**
  - Acceptance: `0001_schema.sql` creates `admin_user`, `session`, `audit_log`, `tailor`, `garment_category`, `tailor_category`, `service_area`, `tailor_area`, `portfolio_image`, `internal_note` with FKs, UNIQUEs, CHECK enums and the publish rule (published requires approved + permission recorded), indexes from DATA_MODEL §7.
  - Verify: migration applies to empty D1; one test per constraint, each seen failing before the constraint exists.
  - Files: `migrations/0001_schema.sql`, `tests/schema-admin-tailor.test.ts`, `package.json` (db:migrate)

- [ ] **T4 Schema B: enquiry, referral and operational tables**
  - Acceptance: `0002_enquiry_referral.sql` creates `enquiry`, `enquiry_status_log`, `referral`, `enquiry_attachment`, `contact_click_daily`, `rate_limit`; constraints: consent must be true, reference unique, `fee_status = paid` requires `fee_paid_at`, `fee_amount` only with completion reported, exactly one owner FK on `internal_note`, status enum.
  - Verify: constraint tests as in T3; DATA_MODEL updated if any field changes.
  - Files: `migrations/0002_enquiry_referral.sql`, `tests/schema-enquiry-referral.test.ts`, `docs/DATA_MODEL.md` (only if changed)

- [ ] **T5 Placeholder seed**
  - Acceptance: `0003_seed_placeholders.sql` inserts clearly marked placeholder categories and areas (OQ-10 pending); no personal data.
  - Verify: test counts rows and checks every name carries the placeholder marker; migrations apply in order on an empty DB.
  - Files: `migrations/0003_seed_placeholders.sql`, `tests/seed.test.ts`

- [ ] **T6 Permissions and last-owner rule**
  - Acceptance: `permissions.ts` with the nine named permissions and four role bundles from SPEC-phase-2; unmapped role/permission denied; last-owner demote/deactivate refused.
  - Verify: unit tests: full role x permission matrix, unknown role denied, last-owner rule (both paths).
  - Files: `src/modules/auth/permissions.ts`, `src/modules/auth/users.ts`, `tests/permissions.test.ts`, `tests/last-owner.test.ts`

- [ ] **T7 Password hashing and benchmark**
  - Acceptance: PBKDF2-SHA-256 via WebCrypto; hash string stores algorithm, iterations, salt; verify is constant-shape on bad input; `bench:hash` prints ms per iteration count; chosen count recorded in DECISIONS.md with margin under the Worker CPU limit.
  - Verify: unit tests (round trip, wrong password, tampered hash, params stored); benchmark output pasted into DECISIONS.md.
  - Files: `src/modules/auth/password.ts`, `scripts/bench-hash.mjs`, `tests/password.test.ts`, `package.json`, `docs/DECISIONS.md`

- [ ] **T8 Phone normalisation — BLOCKED on AD-10**
  - Acceptance: `phone.ts` normalises accepted local forms and `+670` to E.164 per the owner's confirmed rule; rejects the rest.
  - Verify: unit tests built from the owner's examples. Do not start until the owner gives the rule.
  - Files: `src/modules/contact-links/phone.ts`, `tests/phone.test.ts`, `docs/DECISIONS.md`

- [ ] **T9 Sessions, CSRF, audit**
  - Acceptance: random token, only its hash in D1; cookie `HttpOnly; Secure; SameSite=Lax`; 30 min idle and 12 h absolute expiry with injected clock; rotate on login; revoke on logout, password change, deactivation; per-session CSRF token check; `audit.ts` appends rows with no customer data.
  - Verify: tests: expiry both ways, rotation, revoked refused, CSRF mismatch rejected, token never stored raw.
  - Files: `src/modules/auth/session.ts`, `src/modules/auth/csrf.ts`, `src/modules/auth/audit.ts`, `tests/session.test.ts`, `tests/csrf.test.ts`

- [ ] **T10 Rate limit and login logic**
  - Acceptance: D1-backed counter; login function returns the same generic error for unknown user, wrong password, inactive user and rate-limited; success writes audit + new session.
  - Verify: tests: 6th failure limited, window reset, generic error identical in all failure cases, inactive user refused.
  - Files: `src/modules/auth/rate-limit.ts`, `src/modules/auth/login.ts`, `tests/rate-limit.test.ts`, `tests/login.test.ts`

- [ ] **T11 Guard and middleware**
  - Acceptance: `requirePermission` redirects anonymous, returns 403 for missing permission, denies by default; `src/middleware.ts` adds security headers on all responses and `noindex` + `no-store` on `/admin`.
  - Verify: tests: anonymous, each role allowed/denied for a sample permission, headers present on `/` and `/admin`.
  - Files: `src/modules/auth/guard.ts`, `src/middleware.ts`, `tests/guard.test.ts`, `tests/headers.test.ts`

- [ ] **T12 Admin shell and route inventory**
  - Acceptance: `/admin/login`, `/admin/logout`, `/admin` (shows email, role, permitted nav only); a route-inventory test fails if any file under `src/pages/admin` is not in the guarded list.
  - Verify: tests: anonymous redirected on every admin route; login/logout flow; inventory test fails when a stray route file is added (proved once, then removed).
  - Files: `src/pages/admin/login.astro`, `src/pages/admin/logout.ts`, `src/pages/admin/index.astro`, `src/i18n/en.ts`, `tests/admin-routes.test.ts`

- [ ] **T13 User management (owner only)**
  - Acceptance: `/admin/users` lists users; owner can create a user, set a role, deactivate/reactivate; any user can change their own password (revokes other sessions); all guarded by `user.manage` (own password change by session); audit rows written.
  - Verify: AC-09 role matrix across all admin routes and handlers (anonymous 302/401, owner ok, manager/editor/viewer 403 on `/admin/users`); last-owner protection through the UI handlers.
  - Files: `src/pages/admin/users.astro`, `src/pages/admin/users/actions.ts`, `src/pages/admin/account.astro`, `tests/admin-users.test.ts`, `tests/ac09-matrix.test.ts`

- [ ] **T14 Owner scripts**
  - Acceptance: `owner:create` and `owner:reset` prompt for credentials without echo, write to local D1 only unless an explicit flag is given, never print or store the password.
  - Verify: run against a throwaway local DB; user can log in via the login function in a test; grep shows no credential in repo or logs.
  - Files: `scripts/create-owner.mjs`, `scripts/reset-owner.mjs`, `package.json`, `README.md`

- [ ] **T15 Docs, reviewers, security audit**
  - Acceptance: README, STATUS (Phase 2 complete or noting T8), DECISIONS, DATA_MODEL/ARCHITECTURE in sync; `privacy-scope-reviewer`, `docs-sync` and `security-auditor` run with no blockers.
  - Verify: `npm ci && npm run check` from a fresh clone; `git ls-files` shows no secrets/DB.
  - Files: `README.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` (lessons)
