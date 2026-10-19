# Spec: Phase 3 — Tailor profiles, images and publishing (admin side)

Status: Approved 2026-10-19 (all five open-question defaults accepted) · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 3 · [DATA_MODEL.md](DATA_MODEL.md) §3.1-3.6, 5 · [ARCHITECTURE.md](ARCHITECTURE.md) §6, §8

**Requirements:** FR-ADM-02/03/04/05/08, FR-REF-08, BR-05/06/11, SEC-04. **Acceptance:** AC-10, plus the Phase 3 lines of the plan: unpermitted images never reach the public directory, EXIF is stripped, no image bytes in D1.
**Answers already given:** AD-04 (R2, browser resize, `/media` route), AD-07 (10 photos, 8 MB originals), OQ-14 (US dollars) — see [DECISIONS.md](DECISIONS.md).

**Scope check.** Two capabilities share this phase: (a) tailor/category/area management and publishing, (b) image storage and permission-gated delivery. (b) is used by (a) only through the tailor page, so one spec with ordered slices S1-S7 is enough. **No public pages here** (Phase 4); the only public route added is the image route `/media/*`.

## Assumptions

1. Roles from [ARCHITECTURE §6](ARCHITECTURE.md): **editor** (`tailor.edit`) creates and edits drafts, images, categories, areas, notes; **manager** (`tailor.publish`) also approves, records permission and verification, publishes and unpublishes; **owner** (`fee.view`) alone sees and edits fee terms.
2. **A published tailor can only be edited by someone with `tailor.publish`.** Editors may edit drafts and unpublished tailors (the plan says "editor may edit drafts, only owner/manager may publish"; this is how I read it). Reason: a published change goes live at once and may invalidate a verified fact.
3. **Publishing needs three things:** `status = approved`, `permission_recorded = 1` (the database already enforces these, AC-10) **and** at least one contact method (WhatsApp or phone) with `contact_publish_consent = 1`. The third is the **[Proposed]** rule in DATA_MODEL §3.1, enforced in application code and explained in the refusal message.
4. **Image publicity rule.** A copy of an image exists in the public bucket only while `permission_granted = 1` **and** `is_visible = 1` **and** the tailor `is_published = 1`. Everything else lives only in the private bucket. One idempotent `reconcileImages(tailorId)` enforces this after every change that can affect it (including publish/unpublish).
5. **Takedown latency.** Public image responses use `Cache-Control: public, max-age=3600`, not "immutable forever" (ARCHITECTURE §8 said long-lived). After permission is withdrawn the file is deleted at once but a cached copy may live up to one hour. See Open Question 2.
6. Photos are resized in the admin's browser (canvas) to three JPEG widths (320, 800, 1600 px; the 1600 variant is also the "original" for display), which strips EXIF. The server never trusts this: it validates every file (type by bytes, no EXIF/XMP/IPTC, dimensions, size) and rejects anything else (SEC-04). The upload script needs JavaScript; the admin area is exempt from the no-JS goal (NFR-BRW-01 covers browsing and the request form).
7. **Prices:** whole US cents in `tailor_category.price_from/price_to`; the admin types dollars. Public labelling ("approximate", date confirmed) is Phase 4; here the admin form only records price, source and confirmation date.
8. Real photos are never used in tests or the repository; tests use tiny generated images.
9. R2 is simulated locally (Miniflare). The real buckets are created in Phase 8; nothing here touches a remote bucket.

## Objective

A manager can onboard a tailor from the J4 journey: create a draft, add categories, prices, areas and photos, record the tailor's permission and what was verified, then publish; and withdraw any of it again. After this phase the data a public directory needs exists and is safe to show: no unpermitted image, unverified claim or unconsented contact can be made public, by construction and by test. Done when the AC-10 and image-publicity tests pass, `npm run check` is green, and the three reviewers report no blockers.

## Tech stack (additions)

None planned. Image handling uses the browser canvas and hand-written byte checks (no library). **Ask first** before adding any dependency, e.g. an image-decoding library for stricter server validation.

## Commands (added)

None. Existing: `npm run check`, `npm test`, `npm run test:integration`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`.

## Project structure

```
src/modules/tailors/
  slug.ts               ASCII slug from a name; stable once published
  schemas.ts            Zod schemas: profile, category price, area link, note, fee terms, permission/verification
  repo.ts               D1 queries for tailor, categories, areas, notes (bound params only)
  publish.ts            canPublish(tailor) -> reasons; publish/unpublish/record permission; calls reconcileImages
src/modules/catalog/    categories and areas: create, rename, reorder, activate/deactivate
src/modules/media/
  validate.ts           magic bytes, EXIF/XMP/IPTC rejection, dimensions, size (JPEG, WebP)
  keys.ts               key scheme: tailor/<id>/<random>/<variant>.jpg
  store.ts              upload (private), delete, reconcileImages (private -> public copy / delete)
src/pages/admin/
  tailors.astro                          list + filters
  tailors/new.astro                      create draft
  tailors/[id].astro                     edit page (sections below)
  tailors/[id]/actions.ts                POST: profile, categories+prices, areas, notes        tailor.edit
  tailors/[id]/publish.ts                POST: approve, record permission/verification, publish, unpublish   tailor.publish
  tailors/[id]/fees.ts                   POST: fee terms                                       fee.view
  tailors/[id]/images.ts                 POST: upload one photo (three variants)               tailor.edit
  tailors/[id]/images/actions.ts         POST: alt/caption, order, permission, visibility, profile photo, delete   tailor.edit (permission flag needs tailor.publish)
  media/[...key].ts                      GET: private-bucket preview for admins                tailor.edit
  categories.astro, areas.astro          list + POST forms                                     tailor.edit
src/pages/media/[...key].ts             GET: public images from the public bucket only (no auth, no listing)
src/scripts/image-upload.ts             browser resize + upload (external file; CSP stays strict)
tests/workers/, tests/integration/      as in Phases 1-2
```

Every file under `src/pages/admin` is added to `ADMIN_ROUTES` (path templates `[id]`, `[...key]`), and the route-inventory and role-matrix tests are extended to substitute real ids.

## Tailor page sections

1. **Profile** (draft fields): display name, slug (editable only until first publish), description, shop address text, home visits (yes/no/unknown), languages, price note and date, WhatsApp, phone, private contact name and number (for forwarding; never public). Numbers go through `normalisePhone`.
2. **Categories and prices:** tick categories; optional price from/to (dollars), unit note, source (`tailor_supplied` default / `verified` only for managers), date confirmed.
3. **Areas:** shop location and "serves" areas.
4. **Photos:** upload, alt text (required), caption, order, "permission granted" + date (manager), hide/show, set profile photo, delete.
5. **Notes:** add internal notes, listed newest first (FR-ADM-08). Never rendered publicly.
6. **Publishing** (manager): approve, record permission (note, date), contact-publish consent, mark which public facts are verified, publish / unpublish, with the reasons a publish would be refused.
7. **Fee terms** (owner only): agreed terms text and date (FR-REF-08).

## Code style

Same as Phases 1-2. The publish check returns reasons rather than throwing, so the UI and tests share one source of truth:

```ts
// src/modules/tailors/publish.ts
export type PublishBlocker = 'not_approved' | 'no_permission_recorded' | 'no_consented_contact';
export function publishBlockers(t: TailorRow): PublishBlocker[] { /* [] means publishable */ }
```

## Testing strategy

- **Unit / D1 (workers project, real local D1 and R2):** slug generation and uniqueness; schema validation (bad phone, over-length, negative or inverted prices); `publishBlockers` for every combination; publish/unpublish refuse with reasons and succeed when allowed (AC-10); verification list only accepts known fields; category/area rules (rename, reorder, deactivate keeps links, inactive hidden from forms); image validation with generated fixtures: valid JPEG/WebP accepted, JPEG with EXIF/XMP/IPTC rejected, PNG/GIF/SVG/HTML renamed to `.jpg` rejected, truncated files rejected, oversize rejected, wrong variant width rejected, 11th image rejected; `reconcileImages` over every state transition (permission on/off, hide/show, publish/unpublish, delete, profile photo) asserting exactly which keys are in the public and private buckets; the profile photo is cleared when its image stops being public; no image bytes in D1 (column check); R2 delete failure leaves the database row so it can be retried.
- **Integration (built Worker, real HTTP):** the AC-09 role matrix for every new admin route, including: editor cannot reach publish/fees (403), manager cannot reach fees (403), editor cannot edit a published tailor (403), anonymous gets 302; CSRF required on every POST; `/media/*` serves a permitted image of a published tailor and returns 404 for private, unpermitted, hidden, unpublished or unknown keys, with no directory listing; admin preview needs a session; headers (`nosniff`, `Cache-Control`) on `/media`; no inline script on the new pages.
- **Mutation checks** (break the rule, see the test fail) for: publish permission rule, image publicity rule, EXIF rejection, per-tailor limit, editor lock on published tailors, `/media` bucket choice.
- **Manual (once, recorded in DECISIONS.md):** the browser resize script run in a real browser against `npm run dev` with a real photo kept outside the repo, checking the variants upload and carry no EXIF. Not part of `npm run check`; Playwright arrives in Phase 4/7.

## Boundaries

- **Always:** server-side permission check on every route and mutation; validate every upload on the server; call `reconcileImages` after any change that can affect publicity; audit changes by id only; fake data and generated images in tests.
- **Ask first:** any new dependency; changing a role/permission mapping; a schema change beyond DATA_MODEL (add a migration `0003` and update DATA_MODEL §9); serving images any other way than `/media`.
- **Never:** put image bytes in D1; write an unpermitted image to the public bucket; show or serve anything for an unpublished tailor; build public directory/profile pages (Phase 4); trust file names or browser-supplied content types; commit real photos or personal data; add reviews, ratings, accounts or automation (PRD §7.3); decide an OQ-/AD- item silently.

## Success criteria

1. `npm ci && npm run check` passes from a clean clone (output seen).
2. **AC-10:** publishing a tailor without approval, recorded permission or a consented contact method is refused with a plain explanation, in the UI handler and (for the first two) by the database; a fully qualified tailor publishes.
3. **Image publicity:** for every combination of permission, visibility and tailor publication, the public bucket contains exactly the permitted, visible images of published tailors, proven by the reconcile tests; `/media` serves nothing else.
4. **EXIF/SEC-04:** files with EXIF/XMP/IPTC, wrong type, wrong size or wrong dimensions are rejected and nothing is stored; the photo limit (10) is enforced.
5. **No image bytes in D1:** `portfolio_image` has only keys and metadata (schema test), and uploads write to R2 only.
6. **RBAC:** the role matrix passes for all new routes; editors cannot publish, record permission, see fees or edit a published tailor; managers cannot see fees; the inventory test fails if a new admin file is unlisted or unguarded.
7. **BR-11:** a fact is marked verified only by a manager and only from the known field list; prices default to `tailor_supplied`.
8. Categories and areas can be created, renamed, reordered and deactivated; deactivated ones stay linked to existing tailors; inactive ones are not offered for new links.
9. Fee terms and internal notes appear only on admin pages (no route outside `/admin` reads them), proven by a test over the public `/media` and existing public pages.
10. `privacy-scope-reviewer`, `docs-sync` and `security-auditor` report no blockers; every fix or deferral is in DECISIONS.md.

## Open questions

1. **Editor lock on published tailors** (assumption 2): editors cannot edit a published profile; a manager must. OK, or may editors edit published profiles too?
2. **Takedown latency** (assumption 5): up to 1 hour of cached public images after a permission is withdrawn. OK, or do you want a shorter cache (more image traffic) or a purge step?
3. **Contact rule for publishing** (assumption 3): at least one consented WhatsApp or phone number. OK?
4. **Image formats after resize:** JPEG only (smallest code, works in every browser). WebP would be smaller but adds a second encoder path. OK with JPEG only?
5. **Categories/areas delete:** the admin can deactivate but not delete (deleting is blocked in the database while in use, and deactivating is enough). OK?
