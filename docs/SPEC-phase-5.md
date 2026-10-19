# Spec: Phase 5 — Enquiry and doorstep request workflow

Status: Approved 2026-10-19 (all five open-question defaults accepted) · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 5 · [PRD.md](PRD.md) §7.2, FR-ENQ, FR-ADM-06/07/08, SEC-05/07, PRV-01/02/03 · [ARCHITECTURE.md](ARCHITECTURE.md) §4, 7, 10 · [DATA_MODEL.md](DATA_MODEL.md) §3.7, 3.9

**Requirements:** FR-ENQ-01–06, FR-ENQ-08 (adapter only, see decision 1), FR-ADM-06/07/08, SEC-05, SEC-07, PRV-01/02/03, BR-03/07/08, ANA-03. **Acceptance:** AC-06, AC-07, AC-08, AC-11, and the enquiry part of AC-15.
**Owner answers for this phase** (2026-10-19, to be logged in [DECISIONS.md](DECISIONS.md) on approval): notification = adapter built, no real sender yet; no Turnstile in Phase 5; no reference images (FR-ENQ-07 left out); neutral wording for response time (OQ-05) and retention (OQ-09).

**Scope check.** One journey (customer submits, owner sees and works it), one data table family that already exists (`enquiry`, `enquiry_status_log`, `internal_note`). Slices S1–S7 below, each testable alone. **No referral assignment** (Phase 6), **no tailor-facing view**, **no automation** of status or forwarding (manual workflow rule).

## Assumptions

1. **No new migration.** Tables `enquiry`, `enquiry_status_log`, `internal_note`, `audit_log` and `rate_limit` already exist. `enquiry_attachment` stays unused.
2. **Customer data lives only in `enquiry`.** It is never put in a URL, log line, analytics event, error message, sitemap, response header, or the notification. The acknowledgement page shows the **reference code only** (passed in the redirect URL as `?ref=CODE`, which is not personal data and is random, see 5).
3. **Fields (FR-ENQ-01, PRV-01), nothing more:** name (required), number (required, normalised by `normalisePhone`, AD-10) and which channel it is (`whatsapp`/`phone`/`either`), garment category (optional, from active list), service description (short, optional), area (optional, from active list, or free text "other"), preferred date/time as free text (optional, a preference not a booking), notes (optional), consent checkbox (required, unticked), and an optional preselected tailor from `?tailor=slug` (only a **published** tailor's slug is accepted; anything else is ignored). `source` is `form` or `profile:<slug>`.
4. **Consent text** lives in the two dictionaries with a version constant (`consent-2026-10-v1`). It states that the details will be shared with a suitable partner tailor and links to the privacy page. Each enquiry stores the version and the server time. Changing the wording requires a new version. Because the Tetum text is unreviewed, consent is recorded against the version for the language shown; the version id includes the language (`...-v1-en`, `...-v1-tet`).
5. **Reference code:** 8 characters from an unambiguous alphabet (no 0/O/1/I), prefix `AT-`, generated from `crypto.getRandomValues`, non-sequential, unique (retry on collision, maximum 5 tries, then an error page, never a duplicate).
6. **Spam controls (SEC-07, AC-08):** hidden honeypot field; minimum fill time (a signed timestamp token in the form, rejected if under 3 seconds or older than 24 hours); per-address rate limit using the existing hashed D1 counters (5 submissions per hour per address bucket, no address means a shared bucket); body size limit (64 KB via `readForm`); CSRF/same-origin check. A honeypot or time-trap hit **silently shows the normal acknowledgement but stores nothing** (bots learn nothing); a rate-limit hit shows a plain "too many requests, try again later" page and stores nothing. Failures never silently lose a genuine enquiry: a genuine user who types too fast sees a message asking them to submit again, with their input preserved (see 9). The `is_spam` flag exists for admin to mark an enquiry manually.
7. **No Turnstile, no CAPTCHA** in this phase (owner decision). Revisit before launch if spam appears.
8. **Notification (FR-ENQ-08):** `src/modules/notify` exposes `notifyNewEnquiry({reference, adminUrl})` with a no-op default and an adapter interface; the message text contains the reference code and an admin link only. Called through `waitUntil` after the insert; any failure is caught and logged without customer data and the enquiry stays. No email service is connected (OQ-06/AD-05 stay open for Phase 8). A test fixture adapter proves the message content.
9. **Errors and failure behaviour (FR-ENQ-05):** field-level, plain-language messages in English and Tetum, next to the field, with `aria-describedby` and an error summary at the top that receives focus; all typed input is preserved (not the consent tick: it must be re-ticked, so consent is always explicit). A database failure shows an error page and **never** the acknowledgement. The form works without JavaScript (plain POST and redirect).
10. **Pages:** replace the Phase 4 placeholder at `/request` and `/tet/request` with the form; add `POST /request` handling in the same files; add `/request/thanks` and `/tet/request/thanks` (the acknowledgement: reference code, "this is a request, not a confirmed appointment, the tailor must confirm availability directly" (BR-03, FR-ENQ-03), neutral next-step wording: "We will contact you using the number you gave. We cannot promise a time."). The disclaimer is also shown beside the submit button. These pages are `noindex` and not in the sitemap. The Phase 4 scope-guard list is updated deliberately.
11. **Privacy page:** stays a marked placeholder (OQ-08) but gains the consent-text link target and a clearly marked placeholder block listing what the form collects, who receives it and "retention: to be decided before launch (OQ-09)". The owner must supply real text before launch. This is recorded as a launch blocker, not decided here.
12. **Admin inbox (FR-ADM-06/07/08):** `/admin/enquiries` (list with status filter, search by reference, name or phone, newest first, spam hidden by default with a toggle, capped at 100 rows with a "narrow your search" note), `/admin/enquiries/[id]` (all fields, status history, internal notes, status form, spam toggle, a "copy details for forwarding" block that shows only the fields the customer consented to share: name, number and channel, category, area, preferred time and notes, as plain text in a `<textarea readonly>` — copying is manual, nothing is sent). Permissions: `enquiry.view` for viewing and the copy view; `enquiry.update` for status, notes and spam flag. Editors and viewers get 403. Every mutation re-checks the permission server-side and CSRF. Search terms are never written to logs.
13. **Status changes (FR-ADM-07, AC-11):** any of the seven values at any time (no enforced order, no automation), one transaction writes the status, `status_changed_at`, a row in `enquiry_status_log` and an `audit_log` entry (`enquiry_status_changed`, entity id only, no customer data).
14. **Analytics (ANA-03) is minimal:** the existing own-counter approach is not extended with a new table. Funnel counts (viewed, submitted, failed validation) are **not** built in Phase 5; the count of enquiries and spam is visible from the inbox. Flagged, not silently dropped (see Open Question 1).
15. **Deletion/anonymisation (FR-ADM-09, Should) is not built.** Enquiries are kept until the owner decides retention (OQ-09). Recorded as an open launch item.
16. **Design:** reuse `PublicLayout`, `site.css` and the dictionary pattern; labels above inputs, 16px+ text, 44px targets, native controls only, no inline script or style. Tetum strings are drafted by me and, like the rest of Tetum, are gated in production until reviewed.

## Objective

A customer on a phone, in English or Tetum, can request a tailor at home in under a minute: fill the short form, tick consent, submit, and see a reference code and a clear statement that it is a request, not a booking. The owner (or a manager) signs in, sees the new enquiry in an inbox, changes its status, adds internal notes, and copies the consented details to forward by hand. No customer data leaks anywhere else, bots and floods create nothing, and a failed notification or database error never produces a false success.

## Tech stack

No new dependencies. Zod 4.6.7 for validation, existing `normalisePhone`, `hit` rate limiter, `readForm`, `requirePermission`, CSRF helpers, dictionaries and layouts.

## Commands

```
Check:        npm run check          # lint + typecheck + workers tests + build + integration tests
Browser:      npm run test:e2e       # extended with the form journey (mobile, keyboard) and axe on the new pages
Dev:          npm run dev            # unstyled under the strict CSP, as before; use the built app to look at styling
```

## Project structure

```
src/modules/enquiry/       schema.ts (Zod + field errors), reference.ts (code), create.ts (insert + log), spam.ts (honeypot, time token, rate limit),
                           queries.ts (admin list/detail/search), status.ts (status change), forwarding.ts (consented-fields text)
src/modules/notify/        index.ts (adapter interface, no-op default, message builder)
src/views/Request.astro    the form and errors (replaces RequestPlaceholder.astro); src/views/RequestThanks.astro
src/pages/request.astro, request/thanks.astro, tet/request.astro, tet/request/thanks.astro   (thin wrappers; POST handled in the request pages)
src/pages/admin/enquiries.astro, admin/enquiries/[id].astro, admin/enquiries/[id]/actions.ts   (list, detail, POST handlers)
src/i18n/public/en.ts, tet.ts   form labels, errors, consent text and version, thanks page
tests/workers/, tests/integration/, e2e/   as before
```

## Code style

Same as Phase 4: typed view models, explicit columns, bound parameters, results as discriminated unions, English identifiers, comments only for the why. Example of the shape:

```ts
export type SubmitResult =
  | { kind: 'created'; reference: string }
  | { kind: 'invalid'; errors: FieldErrors; values: FormValues }
  | { kind: 'ignored' }        // honeypot / time trap: looks like success, stores nothing
  | { kind: 'limited' };       // rate limit: plain message, stores nothing
```

## Testing strategy

- **Workers/D1 unit tests (small):** schema (each field's valid and invalid cases, phone rule, lengths, unknown tailor slug ignored, inactive category refused), reference code (alphabet, length, uniqueness retry, no sequence), time token (too fast, too old, tampered), honeypot, rate limit (5 allowed, 6th refused, other address unaffected, normal submission after a blocked one still works, AC-08), `createEnquiry` (one row, status `new`, consent version and time, one status-log row, consent required by the database constraint), status change (all seven values, log row each time, audit row without customer data, AC-11), search (reference, name, phone), forwarding text (only consented fields), notification message (reference and link only, no name, number or notes) and that a throwing adapter does not lose the enquiry.
- **Integration tests (built Worker, medium):** valid submit gives 303 to `/request/thanks?ref=...` and one row; invalid submit gives 400-range page with field errors, preserved input and no row; missing consent refused; honeypot gives the normal-looking page with no row; rate limit gives the limited page with no row and a later valid submit from another address works; database failure shows the error page, never the acknowledgement; cross-origin POST refused; oversized body refused; no `Set-Cookie`, `Cache-Control: no-store` on the form and thanks pages; the thanks page contains the reference and the disclaimer and none of the customer's input; **privacy sweep extended** (AC-15): public pages, sitemap, `robots.txt`, redirect URLs and response headers never contain the seeded customer name, number or notes; admin routes: anonymous 302 to login, editor and viewer 403, manager and owner allowed, mutations need CSRF, the route inventory and role matrix include the new routes.
- **Playwright and axe (large, few):** complete the form on a 375 px phone viewport, by keyboard only, see the reference; axe on `/request`, the error state, `/request/thanks` and the admin inbox pages, both languages for the public ones.
- **Mutation checks** on: consent required, honeypot, time trap, rate limit, permission checks on each admin route, consented-fields-only forwarding text, no-customer-data notification, published-only preselected tailor. Each must be seen failing.
- A test that fails if a log call (`console.*`) in the enquiry or admin-enquiry code receives anything but constants.

## Boundaries

- **Always:** validate and bound every input on the server; check permission and CSRF on every admin route and mutation; keep customer data out of URLs, logs, analytics, errors, headers and notifications; use fake data in tests; run `npm run check` before each commit; log decisions in DECISIONS.md.
- **Ask first:** a new migration, a new dependency, adding Turnstile or any third-party script, wiring a real email or WhatsApp sender, adding reference images, changing consent wording after approval, adding funnel analytics.
- **Never:** show customer data publicly or to editor/viewer roles; auto-assign, auto-forward or auto-change status; promise a response time or appointment; store the notes or number in a log; send customer data to the notification; auto-delete enquiries without an owner decision; use cookies on the public form.

## Success criteria

1. AC-06: the form cannot be submitted without name, valid number, channel and consent; each error names its field; the not-a-booking disclaimer is next to the submit button.
2. AC-07: a valid submission stores exactly one enquiry with status `new`, consent version and timestamp, one status-log row, and shows the reference code.
3. AC-08: honeypot, too-fast and over-limit submissions store no normal enquiry, and a normal submission afterwards still works.
4. AC-11: an authorised admin can set each of the seven statuses; each change is logged with a timestamp.
5. AC-15 (enquiry paths): the extended sweep finds no customer name, number or notes in any public page, URL, header, sitemap, log call or notification.
6. Editors and viewers cannot see or change enquiries (403); owners and managers can.
7. A thrown notification or a database failure never loses a stored enquiry nor shows a false success.
8. The form works with JavaScript off, on a 375 px screen, and by keyboard; axe reports no violations on the new pages.
9. `npm run check` and `npm run test:e2e` pass; privacy-scope, docs-sync and security reviewers report no unresolved blockers; docs and STATUS are updated.

## Open questions

1. **Form funnel counts (ANA-03)** are left out (assumption 14). Do you want viewed, submitted and failed counts in this phase, or leave them for Phase 7? Default: leave out.
2. **Preselected tailor (OQ-12):** assumption 3 allows both a general request and one started from a profile. Confirm. Default: both.
3. **Privacy page and consent link:** the real privacy text (OQ-08) and retention period (OQ-09) are still yours to supply; they block **launch**, not this phase.
4. **Tetum strings** for the form and consent are drafted by me, gated until a native speaker reviews them, as in Phase 4. Default: same gate.
5. **Rate limit** of 5 submissions per hour per address and a 3-second minimum fill time are my proposals. Default: as stated.
