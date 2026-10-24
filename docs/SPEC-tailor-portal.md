# Spec: Tailor portal (tailor role, admin approval, self-service profile and photos)

Status: **DRAFT, awaiting owner approval. No code written.** · Requested by the owner 2026-10-21 · Not in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (would sit before Phase 8, or after launch: see Open Question 1) · Related: PRD §7.3 and §7.4, BR-05, BR-06, BR-09, BR-11, FR-JOIN-01..03, FR-PRO-*, SEC-*, AC-09, AC-10, PRV-*

> 2026-10-24: the screens were redesigned as guided steps (contact, about, what you make, where you work, photos; progress, "Save and next", tap choices). Same routes, rules and permissions; see [SPEC-portal-revamp.md](SPEC-portal-revamp.md).

## Objective

Today a tailor who taps "Join us" only leaves a number (FR-JOIN-01); the owner phones them, then types the whole profile and uploads photos in the admin. The owner wants this to be self-service and easy:

1. A tailor joins from the website in under a minute.
2. The owner approves (or declines) in one click in the admin.
3. An approved tailor signs in to their own page, fills in their profile, picks their work categories and areas, and uploads photos of their work.
4. Nothing becomes public until the owner publishes it (BR-05); every public fact is still "supplied by the tailor" or "verified" (BR-11); every photo has recorded permission (BR-06).

Success: a real tailor, with only a phone, can go from "Join" to a complete draft profile in one sitting, and the owner can publish it with the existing publish checklist, without typing anything for them.

## Honest tensions (decisions needed up front)

1. **This reverses PRD §7.3**, which excludes "tailor self-service registration or dashboards"; §7.4 lists "tailor self-service profile updates" as a future enhancement. The owner has asked for it, so this spec proposes the PRD change (new FR-TPO-* requirements, §7.3 amended). Per AGENTS.md this needs the owner's explicit yes before any build.
2. **A new kind of signed-in person is a security-sensitive change.** Until now every account was staff. A tailor account must be able to touch exactly one tailor record and nothing else, and must never see customers, enquiries, referrals, fees, notes or other tailors (BR-07, BR-09, SEC-05).
3. **Tailors uploading images means unreviewed content.** Uploads reach the (public) bucket only after the owner makes them visible; until then they are private previews.
4. **No email sender exists** (OQ-06). The invite and any password reset must therefore travel by a link the owner copies and sends on WhatsApp, not by an automatic email or SMS.
5. **"Easy to enroll" competes with "safe".** Each extra step costs sign-ups; each missing check costs trust. The defaults below favour few fields at join and one step for the owner, with the hard checks kept at publish.

## Assumptions (correct me now)

1. **The tailor is a separate sign-in, not a fifth staff role** (changed 2026-10-21 during S1). Rebuilding `admin_user` to add a role was tested and deletes every staff session and blanks the audit trail's actor, so it was rejected. Instead `tailor_account` (one per tailor, unique), `tailor_session` and `tailor_invite` are new tables, with their own cookie (`__Host-alfaiate_tailor`) and guard (`requireTailor`). A tailor session cannot be accepted by any admin page and a staff session cannot open the portal; the staff permission table has no tailor role, so a tailor can never hold a staff permission. Same password rules, hashing, rate limits and CSRF design as staff. Audit rows record the tailor in `audit_log.tailor_account_id`.
2. **Tailors live under `/portal`** (not `/admin`): `/portal` (checklist and status), `/portal/profile`, `/portal/photos`, `/portal/account`, and (shop S4, see [SPEC-shop.md](SPEC-shop.md)) `/portal/products`, `/portal/products/[id]`, `/portal/products/[id]/photo` and `/photo-remove` for the tailor's own draft products and photos (`/portal/media` also previews product photos of that tailor only), in English only at first (Tetum copy follows the OQ-07 review). `/admin/*` stays staff-only: a tailor reaching it gets 403; staff reaching `/portal` get 403.
3. **Approval creates the account and the draft profile in one action.** On the existing "Join requests" list (was "Tailor interest") the owner clicks "Approve". The system creates a `draft` tailor from the interest record (name, business, phone, area, craft) and a tailor login for it, marks the interest as approved, writes an audit row, and shows the owner a **one-time invite link** to send by WhatsApp. "Decline" marks it declined with an optional note. No automatic message is sent.
4. **Invite link**: a random single-use token (stored hashed), valid 7 days, opens "Choose a password" and then signs the tailor in. The owner can issue a fresh link at any time (also the password-reset path). Sign-in uses an **email address** as everywhere else, collected on the set-password page, because accounts need a unique identifier and there is no SMS. See Open Question 3.
5. **Permission to publish (BR-06)**: on first sign-in the tailor ticks one clear consent ("You allow Alfaiate TL to show your business name, details and the photos you upload on this website, and you can ask us to remove them"). The time and wording version are stored; the owner still checks it and sets `permission_recorded` at publish. Per-image permission is recorded when the tailor uploads (they confirm the photos are theirs to show).
6. **What a tailor may edit**: display name, description, shop address text, languages, home visits (yes/no/unknown), work categories (tick from the active list), service areas (tick from the active list; shop location and "I travel to"), price notes **labelled "supplied by the tailor"**, and their photos (upload, alt text, caption, order, hide/delete their own).
7. **What a tailor may not touch**: slug, status, publish and unpublish, `permission_recorded`, verified fields, fee terms, private contact name and number, internal notes, the profile photo choice if it is not their own upload, and the public WhatsApp/phone numbers once published (changed by the owner on request, because a wrong number sends customers to the wrong person). Before publish the tailor may enter their numbers; after publish a change request goes to the owner.
8. **Moderation**: new photos start **hidden** (`is_visible = 0`) and appear only after the owner shows them in `/admin/tailors/[id]/images`. Text edits after publish go live at once, labelled as supplied by the tailor, and are recorded in the audit log with the tailor as actor. The owner can unpublish at any time.
9. **Reuse, do not rebuild**: the existing media pipeline (`uploadPhoto`, variants, MAX_IMAGES, private bucket until visible), publish checklist, `profileFromForm` validation, catalog ticks, audit log, rate limiting. A tailor-scoped wrapper passes the tailor's own `tailor_id` taken from the session, **never from the URL or form**.
10. **Join form stays tiny** (name, phone, optional business and area, consent) with the same spam controls; the extra detail is collected after approval, in the portal where it can be saved and resumed.
11. **Out of scope** (kept excluded): tailors seeing customers or enquiries (a tailor still receives a forwarded request from the owner by WhatsApp as today), referral or fee dashboards, ratings and reviews, chat, booking, payments, notifications beyond manual messages, tailor-chosen slugs, public self-publishing, and Tetum screens before OQ-07.

## Tech stack

Unchanged: Astro SSR on Cloudflare Workers, D1, R2, TypeScript, Vitest (`workers`, `integration*`), Playwright and axe e2e. No new dependency. New migration `0007_tailor_accounts.sql` (SQLite requires rebuilding `admin_user` to change its role CHECK; the migration copies rows, keeps ids so sessions survive, and is tested on a database with existing staff and sessions).

## Commands

```
Check (lint, typecheck, repo, unit, build, integration): npm run check
Browser, axe, CSP, reflow:                                 npm run test:e2e
Apply migrations locally:                                  npm run db:migrate
Demo data (local only):                                    npm run db:demo   /   npm run db:demo:remove
```

## Project structure (additions)

```
migrations/0007_tailor_accounts.sql      role 'tailor', admin_user.tailor_id, invite_token table, interest approval columns
src/modules/portal/                      tailor-scoped services: profile, catalog ticks, photos (wrap existing modules), invite, consent
src/modules/auth/permissions.ts          role 'tailor', permissions portal.profile, portal.photos (no staff permission)
src/modules/auth/invite.ts               issue, hash, verify, consume single-use token
src/pages/portal/                        index, profile, photos, account, accept (set password), handlers
src/pages/admin/interest.astro           Approve and Decline actions, invite link display
tests/workers/portal-*.test.ts           permissions, scoping, invite, consent
tests/integration/portal-*.test.ts       end to end flows, isolation matrix
e2e/portal.spec.ts                       join, approve, accept, edit, upload, keyboard, axe
docs/                                    PRD (FR-TPO-*, 7.3), ARCHITECTURE, DATA_MODEL, DECISIONS, STATUS, SECURITY_PRIVACY_REVIEW
```

## Code style

Same as the codebase: small modules with pure functions at the edges, every handler starts with `requirePermission`, bound SQL parameters only, the tailor id comes from the session.

```ts
// src/pages/portal/profile.astro (frontmatter)
const auth = await requirePermission(Astro, 'portal.profile');
if (auth instanceof Response) return auth;
const tailorId = auth.tailorId; // from the session row, never from the request
```

## Requirements (proposed new IDs; none existing are renumbered)

| ID | Requirement |
|---|---|
| FR-TPO-01 | Approve or decline a tailor interest in one action at `/admin/interest` (`tailor.publish`, owner and manager: it creates a sign-in); approval creates a draft tailor and a tailor login and returns a one-time invite link; both actions are audited. |
| FR-TPO-02 | The invite link is single-use, expires in 7 days, is stored only as a hash, and can be re-issued by an admin with `tailor.publish`. |
| FR-TPO-03 | A signed-in tailor reaches only `/portal/*` and only their own record. No staff page, no other tailor, no enquiry, referral, fee, note or customer data is reachable or rendered. |
| FR-TPO-04 | The tailor edits the fields in assumption 6 with the existing validation; fields in assumption 7 are not accepted from a tailor even if sent. |
| FR-TPO-05 | The tailor uploads, describes and removes their own photos (staff order them) with the existing validation and limits; new photos are hidden until an admin shows them. |
| FR-TPO-06 | The tailor sees a checklist of what is missing before the owner can publish, and the current status (waiting for review, live, paused), and can say the page is ready, which tells the owner through the notification channel (reference and link only). |
| FR-TPO-07 | The tailor's permission to publish is recorded (wording version, time) when they accept the invite; publishing remains admin-only (`tailor.publish`). |
| FR-TPO-08 | Tailor actions write audit rows with the tailor as actor; no customer data and no personal data beyond what exists today is logged. |

## Testing strategy

- **Workers (D1):** permissions matrix (tailor holds only `portal.*`; staff hold none of them); invite token (single use, expiry, hashed, reuse refused, re-issue invalidates the old one); approval creates exactly one tailor and one account, is idempotent, and refuses a declined or anonymised interest; the migration keeps existing users and sessions.
- **Isolation (the important one), integration:** with two tailors A and B, A cannot read or change B by changing ids in the URL, form or hidden fields; A cannot reach any `/admin/*` route; staff cannot reach `/portal/*`; extend the AC-09 matrix with the tailor role for every admin route (expect 403 or redirect) and add the portal routes to the route inventory.
- **Content safety:** a tailor sending `slug`, `status`, `is_published`, `permission_recorded`, `verified_fields`, fee fields or `tailor_id` has them ignored; uploaded photos are hidden and not served publicly until shown; the public pages never show unpublished tailors or hidden photos.
- **Mutation checks** for each guard (scoping, role refusal, invite single-use, hidden-by-default), seen failing before trusting the tests.
- **e2e:** join, approve, accept invite, complete profile, upload a photo, keyboard-only path, axe on every portal page, reflow, no-JavaScript path for the forms.
- Fake data only; never real names, numbers or photos in tests.

## Boundaries

- **Always:** server-side permission and ownership check on every portal page and handler; CSRF on every POST; rate limit on sign-in, invite acceptance and uploads; audit tailor changes; keep tailor-supplied facts labelled; run `npm run check` and `npm run test:e2e` before commit; update docs in the same change.
- **Ask first:** the PRD §7.3 change (this spec asks it); the `admin_user` rebuild migration; any change to what the public pages show; any notification channel; Tetum copy before the native-speaker review.
- **Never:** let a tailor publish, set `permission_recorded` for themselves as final, edit fees, see customers or enquiries, or reach another tailor's data; take the tailor id from anything but the session; send credentials by email or SMS automatically; store invite tokens or passwords in plain text; add tailor ratings, chat, booking or payments.

## Success criteria

1. A tailor can join with name, phone and consent only (under one minute), and sees a reference as today.
2. The owner approves from the Join requests list in one click and gets a copyable invite link; the new draft tailor already holds the name, business, phone, area and craft from the join.
3. The tailor opens the link, chooses a password and an email, accepts the permission wording, and lands on a checklist.
4. The tailor completes description, categories, areas and uploads photos; the checklist shows what is still missing.
5. Nothing the tailor does appears on a public page until the owner makes photos visible and publishes the profile; the public page labels tailor-supplied facts as today.
6. Tailor A can never read or change anything of tailor B or any staff or customer data (isolation tests and the extended AC-09 matrix pass; mutations seen failing).
7. `npm run check` and `npm run test:e2e` pass; axe finds no violations on the portal pages; page weight stays within budgets.

## Open questions (need the owner)

1. **Timing:** build this before Phase 8 (delays launch) or after launch (launch with the owner-entered profiles you already have)? Recommendation: after launch; the current join form and admin entry already work, and this feature adds a new sign-in surface that deserves its own review.
2. **Role design:** the tailor as a role inside the existing sign-in (recommended, matches "one more role") or a separate tailor account area?
3. **Sign-in identity:** email plus password (needs an email address from the tailor; reset via owner-sent link) or phone number plus password (no email needed, easier for tailors; the number is already verified by you on the first call)? Recommendation: phone number as the login name, because many tailors may not use email, with the owner as the reset path. This is a change to the sign-in rules and needs a decision.
4. **Online permission:** is the tailor ticking the permission wording in the portal enough for BR-06, or must the owner always record it after a call or message first?
5. **Edits after going live:** may text changes appear at once (default), or should a published profile's edits wait for the owner's approval?
6. **Phone numbers:** may a tailor change their public WhatsApp or phone themselves (risk: wrong number), or only through you (default)?
7. **Photo review:** show-on-approval for every new photo (default), or auto-show after the tailor's first photo has been approved once?
8. **Decline:** should a declined applicant be told anything, and who sends it (default: nobody automatically; you may message them yourself)?
9. **Language:** English-only portal first (default) or Tetum at the same time, which delays it until the OQ-07 review?
10. **Privacy text (OQ-08):** the Privacy notice must cover tailor accounts (what is stored, who sees it, how to close an account and delete a profile); who approves that wording?

## Next step

On your approval of this spec (and answers to Open Questions 1 to 3 at least), I will write `tasks/plan.md` and `tasks/todo.md` with small vertical slices (migration and role; invite and approval; portal shell and profile; categories and areas; photos; isolation matrix and docs) and stop again for your review of the plan before any code.
