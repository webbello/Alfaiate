# Tasks: Phase 3

- [x] **T1 Foundations**
  - Acceptance: `AuditAction` gains `tailor_created`, `tailor_updated`, `tailor_published`, `tailor_unpublished`, `image_uploaded`, `image_changed`, `image_deleted`, `catalog_changed`, `fee_terms_changed` (ids only); `slugify()` makes unique-able ASCII slugs; `ADMIN_ROUTES` supports path templates (`[id]`, `[...key]`) and the inventory and role-matrix tests substitute real ids; the dashboard nav links are added with the pages they point to (T3, T6) so none is ever a dead link.
  - Verify: new slug unit tests fail first; the existing 232 + 46 tests still pass.
  - Files: `src/modules/auth/audit.ts`, `src/modules/tailors/slug.ts`, `src/modules/auth/admin-routes.ts`, `tests/workers/slug.test.ts`, `tests/integration/ac09-matrix.test.ts`

- [x] **T2 Catalog module (categories and areas)**
  - Acceptance: create, rename, reorder, activate/deactivate for both; slugs unique and stable after first use; deactivated entries stay linked to tailors and are excluded from "choices for new links"; no delete; every change audited by id.
  - Verify: D1 tests per rule (duplicate slug, empty name, deactivate keeps links, inactive not offered, reorder persists); mutation check on "inactive not offered".
  - Files: `src/modules/catalog/index.ts`, `src/modules/catalog/schemas.ts`, `tests/workers/catalog.test.ts`

- [x] **T3 Catalog admin pages**
  - Acceptance: `/admin/categories` and `/admin/areas` list and edit via POST on the same page, `tailor.edit`, CSRF on every POST, messages from a whitelist, all listed in `ADMIN_ROUTES`.
  - Verify: integration: anonymous 302, editor/manager/owner allowed, viewer 403 (matrix), CSRF refusal, a created category appears; mutation check removing the guard.
  - Files: `src/pages/admin/categories.astro`, `src/pages/admin/areas.astro`, `src/i18n/en.ts`, `src/modules/auth/admin-routes.ts`, `tests/integration/catalog.test.ts`

- [x] **T4 Tailor repository, schemas and edit lock**
  - Acceptance: create draft (unique slug with numeric suffix), update profile fields, list with status/published filter, `canEdit(role, tailor)` (editor may edit unless `is_published`; `tailor.publish` always may), phone numbers via `normalisePhone`, Zod limits (name 120, description 2000, address 300, languages 200), slug editable only before first publish, audit by id.
  - Verify: D1 tests: bad phone, long fields, duplicate names get distinct slugs, slug frozen after publish, edit-lock for each role x published state; mutation check on the lock.
  - Files: `src/modules/tailors/schemas.ts`, `src/modules/tailors/repo.ts`, `tests/workers/tailors-repo.test.ts`

- [ ] **T5 Tailor categories, prices, areas and notes**
  - Acceptance: set a tailor's categories with optional price from/to (dollars in, cents stored), unit note, source (`verified` only with `tailor.publish`), date confirmed; set shop-location and serves areas (active ones only for new links); add and list internal notes; all respect the edit lock.
  - Verify: D1 tests: dollars to cents, inverted range refused, `verified` refused for editors, inactive category refused for new link but kept for existing, notes ordering, lock applies.
  - Files: `src/modules/tailors/links.ts`, `src/modules/tailors/notes.ts`, `tests/workers/tailors-links.test.ts`, `tests/workers/tailors-notes.test.ts`

- [ ] **T6 Tailor admin pages (list, new, edit, actions)**
  - Acceptance: `/admin/tailors`, `/admin/tailors/new`, `/admin/tailors/[id]` (profile, categories and prices, areas, notes sections) and `/admin/tailors/[id]/actions` POST, all `tailor.edit`; editors get 403 when the tailor is published; CSRF everywhere; no inline script/style.
  - Verify: integration: role matrix with a real tailor id, editor creates a draft end to end, editor refused on a published tailor, CSRF refusal, escaped output (a name containing `<script>` renders inert), no `<script` without `src`.
  - Files: `src/pages/admin/tailors.astro`, `src/pages/admin/tailors/new.astro`, `src/pages/admin/tailors/[id].astro`, `src/pages/admin/tailors/[id]/actions.ts`, `tests/integration/tailors.test.ts`

- [ ] **T7 Media validation**
  - Acceptance: first an R2 put/get/list/delete test in the Workers project; `validateVariant(bytes, variant)` accepts JPEG and WebP only, by magic bytes, with width within the variant maximum (320/800/1600) and size caps, and rejects EXIF/XMP/IPTC (JPEG APP1/APP13; WebP EXIF/XMP chunks), non-images renamed, truncated files; allows JFIF and ICC; `keys.ts` builds and parses `tailor/<id>/<random>/<variant>.jpg` and rejects traversal.
  - Verify: byte-level fixtures for every accept/reject case, each seen failing first; mutation checks on EXIF rejection and the width cap.
  - Files: `src/modules/media/validate.ts`, `src/modules/media/keys.ts`, `tests/workers/media-validate.test.ts`, `tests/workers/media-keys.test.ts`, `tests/workers/fixtures/images.ts`

- [ ] **T8 Media store and reconcile**
  - Acceptance: `storeImage` writes the three variants to the private bucket and one `portfolio_image` row (key + metadata only), enforces 10 per tailor; `deleteImage` removes R2 objects (both buckets) before the row; `reconcileImages(tailorId)` makes the public bucket hold exactly the images with permission, visible, on a published tailor, and clears `profile_photo_id` when its image stops being public; idempotent.
  - Verify: table test over permission x visibility x published x delete x profile photo asserting exact keys in both buckets; failure simulation (R2 delete throws) leaves the row and a retry converges; schema check: no blob columns; 11th photo refused; mutation check on the publicity rule.
  - Files: `src/modules/media/store.ts`, `src/modules/media/reconcile.ts`, `tests/workers/media-store.test.ts`, `tests/workers/media-reconcile.test.ts`

- [ ] **T9 Publish workflow (AC-10)**
  - Acceptance: `publishBlockers(tailor)` returns `not_approved`, `no_permission_recorded`, `no_consented_contact`; manager actions: approve, record permission (note, date), set contact-publish consent, set verified fields (known list only), publish, unpublish; publish/unpublish call `reconcileImages`; refusal messages are plain; audit by id.
  - Verify: unit tests for every blocker combination; D1 test that the database CHECK also refuses; publish then unpublish moves images between buckets; editor refused; unknown verified field refused; mutation check on each blocker. Endpoint `/admin/tailors/[id]/publish` (`tailor.publish`) with integration role matrix and CSRF.
  - Files: `src/modules/tailors/publish.ts`, `src/pages/admin/tailors/[id]/publish.ts`, `src/pages/admin/tailors/[id].astro`, `tests/workers/publish.test.ts`, `tests/integration/publish.test.ts`

- [ ] **T10 Fee terms (owner only)**
  - Acceptance: fee terms text and agreed date editable at `/admin/tailors/[id]/fees` (`fee.view`); the section appears on the tailor page only for roles with `fee.view`; audited.
  - Verify: integration matrix: owner ok; manager, editor, viewer 403; page HTML for a manager contains no fee text; CSRF refusal.
  - Files: `src/pages/admin/tailors/[id]/fees.ts`, `src/pages/admin/tailors/[id].astro`, `src/modules/tailors/repo.ts`, `tests/integration/fees.test.ts`

- [ ] **T11 Image upload and image actions (server)**
  - Acceptance: `POST /admin/tailors/[id]/images` takes alt text (required), caption and three variant files as multipart plus CSRF, validates all, stores, audits; `POST /admin/tailors/[id]/images/actions` handles alt/caption, order, visibility, delete, set profile photo (`tailor.edit`) and permission granted/withdrawn with date (`tailor.publish`); the edit lock applies; each change ends with `reconcileImages`.
  - Verify: integration with a real multipart POST against the built Worker: valid upload succeeds; EXIF file, wrong type, oversize, missing variant, 11th image all refused with nothing stored; editor cannot set permission (403); permission withdrawal removes the public copy.
  - Files: `src/pages/admin/tailors/[id]/images.ts`, `src/pages/admin/tailors/[id]/images/actions.ts`, `src/modules/media/service.ts`, `tests/integration/images.test.ts`

- [ ] **T12 Public `/media` route and admin preview**
  - Acceptance: `GET /media/<key>` reads only the public bucket, strict key parsing, `Cache-Control: public, max-age=3600`, `nosniff`, `Content-Type: image/jpeg`, 404 for everything else, no listing; `GET /admin/media/<key>` reads the private bucket for `tailor.edit` with `no-store`.
  - Verify: integration: permitted+visible+published image served; private, unpermitted, hidden, unpublished, malformed, traversal (`..`, encoded) and unknown keys 404; anonymous 302 on the admin preview; headers asserted.
  - Files: `src/pages/media/[...key].ts`, `src/pages/admin/media/[...key].ts`, `src/modules/auth/admin-routes.ts`, `tests/integration/media-route.test.ts`

- [ ] **T13 Upload script and photos section**
  - Acceptance: `src/scripts/image-upload.ts` resizes with canvas to 320/800/1600 px JPEG, checks the 8 MB original limit and the 10 photo limit, posts the form; photos section lists thumbnails (admin preview URLs), alt/caption edit, order, visibility, permission (managers), profile photo, delete.
  - Verify: integration: page has `<script src>` and no inline script; build output contains the script file. **Manual run in a real browser** with a real photo kept outside the repo: variants upload, server accepts, downloaded variant has no EXIF (`exiftool`/`identify` if available; otherwise the server's own EXIF rejection is the evidence), result recorded in DECISIONS.md.
  - Files: `src/scripts/image-upload.ts`, `src/pages/admin/tailors/[id].astro`, `src/i18n/en.ts`, `tests/integration/photos-page.test.ts`

- [ ] **T14 Docs, reviewers, security audit, fresh clone**
  - Acceptance: README, STATUS, DECISIONS, ARCHITECTURE §8 and §15, DATA_MODEL (any change) in sync; `privacy-scope-reviewer`, `docs-sync` and `security-auditor` run with no unresolved blockers; fixes or deferrals recorded.
  - Verify: `npm ci && npm run check` from a fresh clone; `git ls-files` shows no secrets, databases or real photos.
  - Files: `README.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` (lessons)
