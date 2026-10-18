# Spec: Phase 2 — Data model and administrative foundations

Status: Approved 2026-10-18 (AD-10 phone format pending) · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 2 · [DATA_MODEL.md](DATA_MODEL.md) · [ARCHITECTURE.md](ARCHITECTURE.md) §6, §9, §10

**Scope check.** Phase 2 covers two things that could ship separately: (a) the database schema and (b) admin auth/RBAC. They share the `admin_user`/`session`/`audit_log` tables, so one spec with ordered slices (S1–S6 below) is enough. No capability map needed.

**Requirements:** FR-ADM-01, SEC-01/02/03/06/08/09. **Acceptance:** AC-09 (including 403 per role). Answers already given: OQ-15 four roles; AD-03 PBKDF2 (see [DECISIONS.md](DECISIONS.md)).

## Assumptions

1. All MVP tables from DATA_MODEL are created now (the plan says so), but only the admin tables get code and tests in this phase. Tailor/enquiry/referral have schema and constraint tests only.
2. Timestamps are stored as UTC ISO-8601 text; enums are `TEXT` with `CHECK` constraints; foreign keys are on.
3. Migrations are forward-only `.sql` files in `migrations/` run by Wrangler; each is tested by applying it to an empty local D1.
4. The seed lists of categories and areas are **placeholders** and are marked as such in the file; the owner's real lists come later (OQ-10). The seed never runs against production without being asked.
5. The first owner is created by a script that reads the email and password from the owner's terminal at run time. No credential is stored in the repo, a fixture, or chat.
6. Phone rule AD-10: accept local formats and `+670`, store E.164. **[Confirm]** my understanding that Timor-Leste mobile numbers are 8 digits starting with 7 and landlines start with 3 after `+670`; I will encode only what the owner confirms and keep the rule in one function.
7. Password reset is out-of-band: a developer runs a script (PRD §11). No email reset flow.
8. Sessions are our own D1 `session` table, not Astro sessions. The Cloudflare adapter auto-enables an `IMAGES` and a `SESSION` KV binding (flagged in DECISIONS.md); S1 turns them off or proves them unused.
9. How to read `DB` inside Astro 7 with adapter 14 (the older `locals.runtime.env` may be gone) is **unverified**; S1 verifies from the installed adapter and records it.

## Objective

An owner can sign in to `/admin`, see an empty dashboard shell, and manage admin users, with every admin route and handler checking a named permission server-side, every denial tested per role, and the full schema migrated and constraint-tested. Done when AC-09 passes in tests and `npm run check` is green.

## Tech stack (additions; ask before anything else)

Zod 4.6.7 for validation (already approved in ARCHITECTURE §2). Everything else uses the platform: WebCrypto (PBKDF2, SHA-256, random tokens), D1 via bindings. Test runtime: see Open Question 1.

## Commands (added)

```
Migrate (local):  npm run db:migrate         # wrangler d1 migrations apply DB --local
Seed lists:       npm run db:seed            # placeholders only, local
Create owner:     npm run owner:create       # prompts for email/password; local by default
Reset password:   npm run owner:reset        # same prompt flow
Bench hashing:    npm run bench:hash         # prints ms per iteration count; result recorded in DECISIONS.md
Check:            npm run check              # unchanged contract
```

## Project structure

```
migrations/0001_schema.sql        all MVP tables, constraints, indexes (DATA_MODEL §3, §7)
migrations/0002_seed_placeholders.sql  categories/areas placeholders (OQ-10), clearly marked
src/modules/db/                   typed query helpers, batch helper
src/modules/config/               typed bindings validated per request path, fail closed
src/modules/auth/
  password.ts                     PBKDF2 hash/verify (params stored with the hash)
  session.ts                      create/validate/rotate/revoke; token hash only in D1
  csrf.ts                         per-session token check
  rate-limit.ts                   D1-backed counter (Workers memory is not shared)
  permissions.ts                  role -> permission map, can(), deny-by-default
  guard.ts                        requirePermission(...) used by every admin route/handler
  audit.ts                        append-only audit_log writes (no customer data)
  phone.ts                        normalisation to E.164 (AD-10)
src/middleware.ts                 security headers; noindex + no-store on /admin
src/pages/admin/                  login, logout, index (shell), users (owner only)
scripts/                          create-owner, reset-owner, bench-hash
tests/                            unit + integration (below)
```

## Permissions (from ARCHITECTURE §6, named for the code)

`dashboard.view`, `tailor.edit`, `tailor.publish`, `enquiry.view`, `enquiry.update`, `referral.edit`, `fee.view`, `enquiry.delete`, `user.manage`. Role bundles exactly as the §6 table: owner has all; manager has all except `fee.view`, `enquiry.delete`, `user.manage`; editor has `dashboard.view`, `tailor.edit`; viewer has `dashboard.view`. Anything unmapped is denied. A user has one role.

## Slices (each ends green and is committed)

1. **S1 Test runtime, config and bindings.** Settle the D1 test runtime (Open Question 1); verify how to reach `DB` in Astro 7 + adapter 14; disable or prove unused the auto-enabled `IMAGES`/`SESSION` bindings; typed `config` module that fails closed on missing bindings/secrets.
2. **S2 Schema.** `0001_schema.sql` for every DATA_MODEL entity including `rate_limit`, `contact_click_daily`, `enquiry_attachment` (optional, FR-ENQ-07 stays Should), with CHECK constraints for the rules in DATA_MODEL (publish requires approved + permission; consent must be true; fee/payment constraints; referral `fee_status = paid` requires `fee_paid_at`; one internal_note owner FK set). Placeholder seed migration.
3. **S3 Passwords, phone, permissions.** `password.ts` with the benchmarked iteration count; `phone.ts`; `permissions.ts` and last-owner rule.
4. **S4 Sessions, CSRF, rate limit, audit, guard.** Hashed-token sessions in `HttpOnly; Secure; SameSite=Lax` cookie, idle and absolute expiry, rotation on login, revocation on logout/password change/deactivation; CSRF token on every mutating form plus Astro's origin check left enabled; login rate limit with generic errors; audit rows for sign-in, role change, deactivation.
5. **S5 Admin shell and user management.** Login/logout, `/admin` shell (no data), `/admin/users` (create user, set role, deactivate/reactivate, change own password), each guarded by `requirePermission`. Middleware sets `noindex` and `Cache-Control: no-store` on `/admin` and the security headers (CSP, nosniff, frame-ancestors, Referrer-Policy; HSTS) on all responses.
6. **S6 Scripts and docs.** `owner:create`, `owner:reset`, `bench:hash`; README run steps; DATA_MODEL/ARCHITECTURE updated for any schema or design change; STATUS and DECISIONS updated; reviewers run.

## Code style

Same as Phase 1 (named exports, single quotes, Prettier). Permission checks are one call, so none can be skipped silently:

```ts
// src/pages/admin/users.astro (frontmatter)
const user = await requirePermission(Astro, 'user.manage'); // redirects if anonymous, 403 if role lacks it
```

All SQL uses prepared statements with bound parameters; no string-built SQL. Logs carry a request ID and never request bodies or customer fields.

## Testing strategy

- **Unit (small):** password hash/verify (wrong password, params round-trip, constant-shape errors); permission map (every role x every permission, unmapped denied); last-owner rule; phone normalisation (local forms, `+670`, junk); session expiry maths with an injected clock.
- **Schema (medium, real local D1):** migration applies to an empty DB; each CHECK/FK/UNIQUE constraint rejects the bad row and accepts the good one (publish-requires-permission, consent-true, paid-requires-date, single note owner, slug unique, and the last active owner cannot be removed).
- **Integration (medium):** for every admin route and every mutating handler: unauthenticated -> redirect/401; each of the four roles -> allowed or 403 per the map (AC-09); CSRF rejection; login/logout; session expiry; revoked session refused; 6th failed login rate limited; password never appears in D1 as plaintext; `/admin` responses carry `noindex` and `no-store`; security headers present everywhere.
- A route-inventory test fails if an `/admin` page or API file exists that is not in the guarded list, so a new unguarded route cannot slip in.
- Fake data only. No coverage threshold yet (Phase 7).

## Boundaries

- **Always:** server-side permission check on every admin route/mutation; deny by default; fake data in tests; run `npm run check`; log owner decisions in DECISIONS.md.
- **Ask first:** any dependency beyond Zod and the D1 test runtime; changing a role or permission; any schema change beyond DATA_MODEL; enabling Cloudflare Access (AD-12); running anything against a remote D1.
- **Never:** store or log plaintext passwords or tokens; commit credentials, `.dev.vars`, databases; add public sign-up, customer/tailor logins, password-reset emails, or any PRD §7.3 feature; build tailor/enquiry/referral admin screens (Phases 3, 5, 6); decide OQ-/AD- items silently.

## Success criteria

1. `npm ci && npm run check` passes from a clean clone (output seen).
2. `0001` applies cleanly to an empty local D1 and every constraint above is proven by a test that fails first.
3. AC-09: for every admin route/handler, anonymous gets redirect/401 and each role gets exactly what the §6 table allows (403 otherwise), proven by the route-inventory test plus the role matrix.
4. Passwords are stored only as PBKDF2 hashes with stored parameters; the benchmark result and chosen iteration count are in DECISIONS.md; hashing fits the Worker CPU limit with margin (number recorded, not assumed).
5. Sessions expire (idle and absolute), rotate on login, and are revoked on logout, password change and deactivation.
6. Login is rate limited with generic errors; failed and successful sign-ins write audit rows with no customer data.
7. The last active owner cannot be demoted or deactivated (unit and integration tests).
8. `/admin` sends `noindex` + `no-store`; all responses carry the security headers.
9. `IMAGES`/`SESSION` bindings are disabled or proven unused and the outcome is in DECISIONS.md.
10. `owner:create` works against local D1 without any credential in the repo or shell history of the transcript.
11. Reviewers (`privacy-scope-reviewer`, `docs-sync`, plus `security-auditor` as planned for Phase 2) report no blockers.

## Open questions

1. **Test runtime for D1 (needs your call).** `@cloudflare/vitest-pool-workers` 0.23.0 requires Vitest `^4.1`. Options: (a) **downgrade to Vitest 4.1.12**, which already passes the Phase 1 smoke test, and use the pool for real D1/Workers tests (recommended: tests run in the same runtime as production); (b) stay on Vitest 5.0.5 and test SQL with an in-memory SQLite stand-in, which is a different engine from D1 and weaker evidence for constraints. Proposed: (a).
2. **AD-10 phone rules:** please confirm the Timor-Leste number format (assumption 6) or give me the rule.
3. **Dashboard shell:** show only "Signed in as <email> (<role>)" and the nav for allowed pages. OK, since counts arrive in Phases 3–6?
4. **Session lifetimes:** proposed 30 min idle, 12 h absolute. Change if you want longer for convenience on a shared phone.

## Deviations recorded during the build (see DECISIONS.md)

- Schema is two migrations (`0001` admin/tailor tables, `0002` enquiry/referral/operational), not one; the placeholder seed is `seeds/placeholders.sql`, not a migration.
- Test runtime is `@cloudflare/vitest-plugin` (successor of the deprecated pool package) with Vitest 4.1.12, plus an `integration` project against the built Worker.
- No `src/modules/db/` helpers: auth modules query D1 directly through the typed binding. Deferred; revisit when Phase 3 adds more queries.
- One `scripts/owner.mjs` (create/reset) instead of two scripts. `phone.ts` is not built (T8, waiting on AD-10).
- Success criterion 4 ("fits the Worker CPU limit with margin") is **not demonstrated**: the 600000-iteration default depends on the Workers Paid plan (AD-02).
- Success criterion 8: security headers come from middleware, so static `/_astro/*` assets carry cache headers only.
