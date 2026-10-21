# Tasks: Tailor portal

Order and reasons are in [plan-tailor-portal.md](plan-tailor-portal.md). Requirement IDs FR-TPO-01..08 are proposed in the spec and added to the PRD in S9 (and §7.3 amended there).

- [x] **S1 Migration and tailor sign-in tables**
  - Acceptance: `migrations/0007_tailor_accounts.sql` adds `tailor_account`, `tailor_session`, `tailor_invite`, interest decision columns and `audit_log.tailor_account_id`, without touching `admin_user` (a rebuild was tested and wipes staff sessions and audit actors). `src/modules/portal/session.ts` and `require.ts` give the tailor session and the `requireTailor` guard with its own cookie.
  - Verify: workers tests (session lifecycle, idle and inactive refusal, sessions kept apart from staff both ways, staff permission table refuses any tailor role, schema constraints and cascades); mutations seen failing.
  - Files: `migrations/0007_tailor_accounts.sql`, `src/modules/portal/session.ts`, `src/modules/portal/require.ts`, `src/modules/auth/audit.ts`, `tests/workers/portal-session.test.ts`

- [x] **S3 Invite and approval (admin side)**  _(permission is `tailor.publish`, owner and manager, not `tailor.edit`: it creates a sign-in)_
  - Acceptance: on `/admin/interest` an admin with `tailor.edit` can Approve (creates a draft tailor from the interest, a tailor login without a password, an invite, an audit row; shows the one-time link once) or Decline; re-issue a link; approving twice or approving a declined or anonymised interest is refused; the interest's personal data rules (PRV-04) are unchanged. `src/modules/auth/invite.ts`: issue, hash, verify, consume.
  - Verify: workers tests (single use, expiry, hashed at rest, re-issue invalidates, idempotent approval, one tailor and one account per approval); integration test for the admin routes with CSRF, permission and the AC-09 matrix entries; mutation checks (reuse allowed, expiry ignored, plain token stored) seen failing.
  - Files: `src/modules/auth/invite.ts`, `src/modules/portal/approve.ts`, `src/pages/admin/interest.astro`, `src/pages/admin/interest/[id]/approve.ts`, `decline.ts`, `reissue.ts`, `src/modules/auth/admin-routes.ts`, tests

- [x] **S2 Sign-in, accept page and portal shell**  _(a staff cookie or tailor cookie on the other side's pages redirects to that side's sign-in instead of a 403: the two sessions are different tables)_
  - Acceptance: `/portal/accept?token=` sets email and password (existing rules and lockout), records the permission-to-publish consent (wording version, time) and signs the tailor in; the shared login sends tailors to `/portal` and staff to `/admin`; `/portal` shows a shell with account menu and sign out; `/admin/*` returns 403 to a tailor and `/portal/*` returns 403 to staff; portal pages are `noindex`, `no-store`, CSP unchanged.
  - Verify: integration tests (accept flow, bad or used token, redirects by role, both 403 directions, headers); e2e keyboard path and axe on the accept page and shell; mutation check on the role redirect and the 403s.
  - Files: `src/pages/portal/accept.astro`, `src/pages/portal/index.astro`, `src/layouts/PortalLayout.astro`, `src/modules/portal/consent.ts`, `src/pages/admin/login.astro`, `src/middleware.ts` (headers only), tests

- [x] **S4 Profile edit**
  - Acceptance: `/portal/profile` edits display name, description, shop address, languages, home visits, price note (labelled tailor-supplied) and, before publish only, WhatsApp and phone; the tailor id comes from the session; extra fields (`slug`, `status`, `is_published`, `permission_recorded`, `verified_fields`, fee fields, `tailor_id`) are ignored; edits are audited with the tailor as actor; existing `profileFromForm` validation and error messages are reused.
  - Verify: workers tests for the allow-list and scoping; integration tests (own record only, tampered ids ignored, published tailor cannot change numbers); axe and keyboard e2e; mutation checks on scoping and on the allow-list.
  - Files: `src/modules/portal/profile.ts`, `src/pages/portal/profile.astro`, `src/pages/portal/profile/save.ts`, tests

- [x] **S5 Work categories and areas**
  - Acceptance: `/portal/work` (or a section of the profile) lets the tailor tick active categories and active areas (shop location and "I travel to"), reusing the catalog tick logic; only active catalog entries are accepted; prices stay out of the portal in this slice (price note only).
  - Verify: workers tests (inactive or unknown ids refused, other tailors' links untouched); integration and e2e as S4.
  - Files: `src/modules/portal/work.ts`, `src/pages/portal/work.astro`, handler, tests

- [x] **S6 Photos**
  - Acceptance: `/portal/photos` uploads, describes (alt text required), orders, hides and deletes the tailor's own photos through the existing media service with its validation, variants and limit; each upload records the tailor's confirmation that the photo may be shown (per-image permission); new photos are `is_visible = 0` and are never served from the public path until an admin shows them in `/admin/tailors/[id]/images`; rate limit per tailor.
  - Verify: workers tests (hidden by default, own photos only, limit, bad type or size refused); integration tests (hidden photo returns 404 publicly, 200 after an admin shows it; tailor cannot touch another tailor's image id); e2e upload with a fake image and axe; mutation checks on hidden-by-default and ownership.
  - Files: `src/modules/portal/photos.ts`, `src/pages/portal/photos.astro`, handlers, tests

- [x] **S7 Checklist and submit for review**
  - Acceptance: `/portal` shows the existing publish checklist in the tailor's words (what is missing, what the owner will check), the current status (draft, waiting for review, live, paused), and a "Ready for review" action that needs the permission consent and notifies the owner through the existing webhook (reference and link only); publishing stays admin-only.
  - Verify: unit test for the tailor-facing checklist copy; integration test that submitting without consent or required fields is refused and that no tailor action changes `status` or `is_published`; webhook test (no personal data in the body); e2e of the full local journey.
  - Files: `src/modules/portal/checklist.ts`, `src/pages/portal/index.astro`, `src/pages/portal/submit.ts`, `src/modules/notify/index.ts` (kind `'tailor-ready'`), tests

- [ ] **S8 Isolation matrix**
  - Acceptance: `ADMIN_ROUTES` and a new `PORTAL_ROUTES` inventory list every route with its permission; the AC-09 matrix runs every admin route as `tailor` (refused) and every portal route as staff and anonymous (refused); a two-tailor suite proves A cannot read or change B through URL, form or hidden fields.
  - Verify: the suites pass and each guard's mutation is seen failing; privacy-scope-reviewer clean.
  - Files: `src/modules/auth/portal-routes.ts`, `tests/integration/ac09-matrix.test.ts`, `tests/integration/portal-isolation.test.ts`, `tests/workers/portal-route-inventory.test.ts`

- [ ] **S9 Docs, review and wrap-up**
  - Acceptance: PRD gets FR-TPO-01..08 and an amended §7.3 (owner-approved reversal) and AC rows; ARCHITECTURE, DATA_MODEL, DECISIONS, STATUS, SECURITY_PRIVACY_REVIEW, README and `docs/DRAFT-privacy-and-terms.md` (tailor accounts) updated; LAUNCH_CHECKLIST gets the tailor-portal items (invite process, who sends links); `npm run check`, `npm run test:e2e`, then privacy-scope-reviewer, docs-sync and security-auditor, findings fixed.
  - Verify: all checks green; reviewers' findings resolved or flagged to the owner.
  - Files: docs only, plus review fixes
