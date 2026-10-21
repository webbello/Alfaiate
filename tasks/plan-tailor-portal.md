# Plan: Tailor portal

Spec: [docs/SPEC-tailor-portal.md](../docs/SPEC-tailor-portal.md) (approved by the owner 2026-10-21). Separate from the older `tasks/plan.md` and `tasks/todo.md` (Phase 7c), which are kept as history.

## Defaults used for the open questions the owner has not answered (change any by saying so)

| # | Question | Default used in this plan |
|---|---|---|
| 1 | Timing | Built after the owner has finished the launch checklist items that do not depend on it; Phase 8 (deployment) is not blocked by it. If the owner wants it before launch, nothing in the plan changes except order. |
| 2 | Role design | `tailor` role inside the existing sign-in (`admin_user.role` + `tailor_id`) |
| 3 | Sign-in identity | **Email + password** (existing rules). Phone-number login is not built unless the owner asks, because it changes the sign-in rules. |
| 4 | Online permission | Tailor ticks the wording; the owner still records `permission_recorded` at publish |
| 5 | Edits after going live | Text goes live at once, labelled "supplied by the tailor"; audited |
| 6 | Phone numbers | Tailor may enter them before publish; after publish only the owner changes them |
| 7 | Photo review | Every new photo is hidden until an admin shows it |
| 8 | Decline | Nothing is sent automatically |
| 9 | Language | English first |
| 10 | Privacy text | Draft updated in `docs/DRAFT-privacy-and-terms.md`; the owner approves (OQ-08) |

## Dependency graph

```
migration + role (S1)
   ├─> sign-in redirect and portal shell (S2)
   │      ├─> profile edit (S4) ─> catalog ticks (S5) ─> checklist and submit (S7)
   │      └─> photos (S6) ───────────────────────────────┘
   └─> invite and approval (S3) ─> S2 (accept page uses the shell)
S8 isolation matrix and extended AC-09 after S2..S7 exist
S9 docs, privacy draft, security review, final checks
```

Build order: S1 → S3 → S2 → S4 → S5 → S6 → S7 → S8 → S9. Each slice ends with `npm run check` green and a commit; UI slices also run `npm run test:e2e` first.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Rebuilding `admin_user` to change its role CHECK loses users or sessions | Copy rows with their ids; test the migration on a database seeded with staff and sessions; keep a rollback note |
| A tailor reaches staff pages or another tailor's data | Tailor holds no staff permission (deny by default); tailor id only from the session; every portal query is `WHERE tailor_id = session.tailorId`; isolation tests with two tailors; mutation checks on each guard |
| Tailor uploads unreviewed or unsuitable photos | Hidden by default; private bucket until shown; existing validation and limits; rate limit |
| Invite link leaks or is reused | Random 32-byte token, stored hashed, single use, 7-day expiry, re-issue invalidates old link; link shown once to the owner, never logged |
| Tailor sends extra form fields (`status`, `is_published`, `slug`, `tailor_id`) | Allow-list parsing; tests assert they are ignored |
| Scope creep into dashboards, enquiries or fees | Out-of-scope list in the spec; privacy-scope-reviewer after every slice |
| Easy enrolment gets heavier over time | Join form unchanged (three required fields); detail collected after approval |

## Verification checkpoints

- After S1: migration test and permission matrix pass.
- After S3: owner can approve from the list and copy a working invite link (manual check with demo data).
- After S7: a full manual run, local only: join, approve, accept, fill, upload, owner shows photos and publishes, public page shows the tailor.
- After S8: isolation suite and extended AC-09 matrix pass; mutations seen failing.
- End: `npm run check`, `npm run test:e2e`, privacy-scope-reviewer, docs-sync, security-auditor.
