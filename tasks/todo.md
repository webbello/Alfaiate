# Tasks: Phase 5

- [x] **T1 Validation schema and reference code**
  - Acceptance: Zod schema for the form (name 1-100 chars, number via `normalisePhone`, channel `whatsapp|phone|either`, optional category and area ids that must be active, optional service text, area text, preferred time text, notes with length caps, consent required true); field-level errors keyed by field with message keys (not text); `?tailor=slug` resolved only to a published tailor, otherwise ignored; reference code `AT-` plus 8 characters from an unambiguous alphabet, random, non-sequential.
  - Verify: unit tests (each field valid/invalid, hostile strings kept as plain text, inactive category refused, unknown or unpublished tailor ignored, code alphabet and length, 10,000 codes without duplicates); fail first.
  - Files: `src/modules/enquiry/schema.ts`, `src/modules/enquiry/reference.ts`, `tests/workers/enquiry-schema.test.ts`, `tests/workers/enquiry-reference.test.ts`

- [x] **T2 Spam controls**
  - Acceptance: hidden honeypot field; signed time token (HMAC of the render time with `FORM_TOKEN_SECRET`; too fast under 3 s, older than 24 h or tampered is rejected as `too_fast`/`invalid`); per-address limit of 5 submissions per hour using the hashed `hit` counter, shared "unknown" bucket without an address; missing secret fails closed (form does not render); `.dev.vars.example` placeholder, typed binding, `npm run types`.
  - Verify: unit tests for each control, the sixth submission refused while another address and a later normal submission still work (AC-08); mutation checks on honeypot, time trap and limit.
  - Files: `src/modules/enquiry/spam.ts`, `src/modules/config/index.ts`, `.dev.vars.example`, `worker-configuration.d.ts`, `tests/workers/enquiry-spam.test.ts`

- [x] **T3 Create the enquiry and notify adapter**
  - Acceptance: `createEnquiry` inserts one `new` enquiry with consent version (language-specific) and server time plus one `enquiry_status_log` row in one batch, with bounded retry on reference collision; `source` is `form` or `profile:<slug>`; `notifyNewEnquiry({reference, adminUrl})` adapter with a no-op default, called through `waitUntil`, errors caught and logged without customer data; message text holds only the reference and admin link.
  - Verify: unit/D1 tests (one row, status log, consent constraint, forced collision, forced DB failure creates nothing and reports an error, throwing adapter keeps the enquiry, message contains no seeded name, number or notes); a test that `console.*` calls in `src/modules/enquiry` and `src/modules/notify` receive only constants.
  - Files: `src/modules/enquiry/create.ts`, `src/modules/notify/index.ts`, `tests/workers/enquiry-create.test.ts`, `tests/workers/notify.test.ts`

- [x] **T4 Form page, POST handler and acknowledgement (English and Tetum)**
  - Acceptance: `/request` and `/tet/request` show the form (labels above inputs, error summary with focus, field errors with `aria-describedby`, input preserved except the consent tick, not-a-booking disclaimer beside the submit button, consent text with version and privacy link, optional `?tailor=` preselection shown by name) and handle POST (same-origin check, `readForm` limit, validation, spam controls, create, 303 to `/request/thanks?ref=CODE`); `/request/thanks` and Tetum twin show the reference, the disclaimer and neutral next steps; honeypot hit shows the normal acknowledgement with no row; rate limit shows a plain limited page; database failure shows an error page; all `noindex`, `no-store`, no cookies; works without JavaScript; privacy page gains the marked placeholder block; scope-guard list updated; the Phase 4 placeholder view is removed.
  - Verify: dictionary parity test; integration tests for each outcome (valid, invalid, no consent, honeypot, too fast, limited, DB failure, cross-origin, oversized, preselected tailor valid/unknown), thanks page contains the reference and none of the input; fail first.
  - Files: `src/views/Request.astro`, `src/views/RequestThanks.astro`, `src/pages/request.astro`, `src/pages/request/thanks.astro`, `src/pages/tet/request.astro`, `src/pages/tet/request/thanks.astro`, `src/i18n/public/en.ts`, `src/i18n/public/tet.ts`, `tests/workers/public-pages.test.ts`, `tests/integration/request.test.ts`

- [x] **T5 Customer-data sweep and public-side checks**
  - Acceptance: the privacy sweep also seeds an enquiry with a recognisable fake name, number and notes and asserts none appears in any public page (both languages), sitemap, `robots.txt`, redirect URL, response headers or the notification message; honeypot and limited submissions leave `enquiry` unchanged; AC-06, AC-07, AC-08 each have a named integration test.
  - Verify: tests pass; mutation checks: remove the consent requirement, the honeypot, the time trap and the limit, and put the name in the redirect URL, each seen failing.
  - Files: `tests/integration/public-privacy.test.ts`, `tests/integration/request.test.ts`

- [x] **T6 Admin enquiry list**
  - Acceptance: `/admin/enquiries` requires `enquiry.view`; lists newest first (cap 100 with a "narrow your search" note), status filter, search by reference, name or phone (bound LIKE, never logged), spam hidden unless toggled; `AdminShell` nav entry only for permitted roles; route added to `ADMIN_ROUTES`; `no-store`, `noindex`.
  - Verify: tests for each role (owner and manager allowed, editor and viewer 403, anonymous 302), search and filters, spam hidden by default, the route inventory test, mutation check removing the permission check.
  - Files: `src/pages/admin/enquiries.astro`, `src/modules/enquiry/queries.ts`, `src/modules/auth/admin-routes.ts`, `tests/workers/enquiry-queries.test.ts`, `tests/integration/admin-enquiries.test.ts`

- [ ] **T7 Admin enquiry detail: status, notes, spam flag, forwarding text**
  - Acceptance: `/admin/enquiries/[id]` shows all fields, status history and internal notes; POST handlers (permission `enquiry.update`, CSRF) set any of the seven statuses with `status_changed_at`, a status-log row and an `audit_log` entry holding no customer data (AC-11), add internal notes, toggle spam; "copy details for forwarding" shows only consented fields (name, number and channel, category, area, preferred time, notes) in a read-only textarea, nothing is sent; viewers cannot update; ids must be plain digits.
  - Verify: tests for all seven statuses (log row each time), audit row content, notes never in public pages, forwarding text exact, 403 for editor/viewer/missing CSRF, route inventory; mutation checks on permission, the log write and the consented-fields list.
  - Files: `src/pages/admin/enquiries/[id].astro`, `src/pages/admin/enquiries/[id]/actions.ts`, `src/modules/enquiry/status.ts`, `src/modules/enquiry/forwarding.ts`, `src/modules/auth/admin-routes.ts`, `tests/workers/enquiry-status.test.ts`, `tests/integration/admin-enquiries.test.ts`

- [ ] **T8 Playwright and axe for the form and inbox**
  - Acceptance: e2e fills and submits the form on a 375 px viewport and by keyboard only, sees the reference; error state reachable and announced; axe zero violations on `/request` (clean and error state), `/request/thanks` in both languages and on the admin inbox and detail pages (signed in with a throwaway fake owner created in the e2e seed).
  - Verify: `npm run test:e2e` passes; a deliberately removed label fails it once, then is reverted.
  - Files: `e2e/request.spec.ts`, `e2e/a11y.spec.ts`, `e2e/seed.sql`, `e2e/run.mjs`

- [ ] **T9 Docs, reviewers, security audit, fresh clone, manual look**
  - Acceptance: README, STATUS, DECISIONS, ARCHITECTURE §4, §5, §7, §10, DATA_MODEL (if anything changed), SPEC deviations and AGENTS lessons updated; `privacy-scope-reviewer`, `docs-sync` and `agent-skills:security-auditor` run with no unresolved blockers; one manual look at phone size recorded; launch items written down (real sender OQ-06, privacy text OQ-08, retention OQ-09, `FORM_TOKEN_SECRET` set in Phase 8, Tetum review).
  - Verify: `npm ci && npm run check` from a fresh clone and `npm run test:e2e`; `git ls-files` has no secrets, databases or uploads.
