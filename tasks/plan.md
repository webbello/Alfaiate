# Plan: Phase 3 — Tailor profiles, images and publishing (admin side)

Spec: [docs/SPEC-phase-3.md](../docs/SPEC-phase-3.md) (approved 2026-10-19). Tasks: [todo.md](todo.md). Earlier plans are in git history (Phase 2: `fb0d6a2`).

## Order and dependencies

```
T1 foundations ──> T2 catalog module ──> T3 catalog pages
      │
      └──> T4 tailor repo + schemas + edit lock ──> T5 categories/prices/areas/notes ──> T6 tailor pages
T7 media validation ──> T8 media store + reconcile
T6 + T8 ──> T9 publish workflow (AC-10) ──> T10 fee terms
T4 + T8 ──> T11 image upload + image actions (server)
T8 ──> T12 public /media route + admin preview
T11 + T12 ──> T13 upload script + photos section (manual browser check)
all ──> T14 docs, reviewers, security audit, fresh clone
```

T7-T8 are independent of T2-T6 and could be built first; I keep them in this order so each task leaves a usable admin feature. Strictly one task at a time, one commit each, commit only when `npm run check` exits 0.

## Risks

| Risk | Mitigation |
|---|---|
| Local R2 not usable from the Vitest Workers project | T7 starts with a put/get/list/delete R2 test; if it fails, stop and ask |
| D1 and R2 are not transactional (a failure between them leaves them out of step) | `reconcileImages` is idempotent and recomputes from D1; delete R2 before the D1 row; tests simulate a failure and a retry |
| Server validation of JPEG/WebP bytes is hand-written | Byte-level fixtures for every accept/reject case; mutation checks; no real photos |
| Canvas re-encode may not strip metadata or may add an ICC/APP segment in some browsers | Server rejects APP1/APP13; allows APP0/APP2 only; manual check in a real browser in T13 (Safari/Chrome noted); results recorded |
| Multipart uploads through Astro endpoints and the origin check | T11 proves a real multipart POST against the built Worker; CSRF token sent as a form field |
| Strict CSP blocks the upload script | Script is an external bundled file; integration test asserts no inline script and a `script src` on the page |
| New `[id]` and `[...key]` routes break the route-inventory and role-matrix tests | T1 extends the registry with path templates and the tests substitute real ids before any route is added |
| Cached public image outlives a withdrawn permission | 1-hour max-age (approved); deleted from the public bucket immediately; documented in the privacy notice work later (OQ-08) |
| Scope creep into public pages | Nothing under `src/pages` outside `admin/` and `media/`; reviewer checks it |
| A large integration suite becomes slow | Reuse sessions per file; measure after T9 and trim before T14 |

## Verification checkpoints

- After T1: existing 232 + 46 tests still pass with the extended registry.
- After T3: catalog role matrix passes.
- After T6: an editor can create a draft and edit it; cannot edit once it is published (stubbed row).
- After T8: public-bucket contents match the publicity rule for every state (table test).
- After T9: AC-10 passes at both layers (handler and database).
- After T12: `/media` serves only permitted, visible images of published tailors.
- After T13: one manual run in a real browser with a real photo kept outside the repo.
- After T14: `npm ci && npm run check` from a fresh clone; three reviewers report no blockers.

## Out of scope

Public pages (directory, profiles, categories), contact click counter, sitemap, SEO, enquiry and referral screens, CSV export, bulk import, image editing beyond resize, remote buckets and deploy.
