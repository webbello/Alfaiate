# Plan: Phase 5 — Enquiry and doorstep request workflow

Spec: [docs/SPEC-phase-5.md](../docs/SPEC-phase-5.md) (approved 2026-10-19). Tasks: [todo.md](todo.md). Earlier plans are in git history (Phase 4: `dec979c`).

## Order and dependencies

```
T1 validation schema + reference code (pure + lookups)
T1 ──> T2 spam controls (honeypot, signed time token, rate limit)
T1 + T2 ──> T3 createEnquiry (insert + status log) + notify adapter
T3 ──> T4 form page, POST handler, thanks page (English and Tetum)
T4 ──> T5 integration tests + customer-data sweep (public side complete)
T3 ──> T6 admin enquiry list (permission, search, filters, route inventory)
T6 ──> T7 admin detail: status changes, notes, spam flag, forwarding text
T5 + T7 ──> T8 Playwright + axe (form journey on a phone, keyboard, admin pages)
all ──> T9 docs, reviewers, security audit, fresh clone, manual look
```

One task at a time, one commit each, commit only when `npm run check` exits 0 (e2e is run separately and must pass before T8 and T9 are ticked). Every public page exists in English and Tetum from the start.

## Risks

| Risk | Mitigation |
|---|---|
| Customer data leaks into a URL, log, header, error or notification | Only the random reference code goes in the redirect URL; a test fails if a `console.*` call in enquiry code gets non-constants; extended sweep of every public page, sitemap, headers and notification text for seeded customer values; mutation checks |
| Honeypot or time trap silently loses a real enquiry | Too-fast submissions get a visible "please submit again" with input preserved (not silent); only the honeypot is silent; test that a normal submit after a blocked one works (AC-08) |
| The time token needs a signing secret | New secret `FORM_TOKEN_SECRET` (`.dev.vars.example` placeholder, typed binding, fails closed if missing); the real value is set with Wrangler in Phase 8 and recorded in STATUS. Without it the form refuses to render instead of skipping the check |
| Rate limiting by address when no address header exists | Shared "unknown" bucket (same as the tap counter), so absent headers never disable the limit |
| Database failure shows a false success | Insert and status-log row in one batch; the handler shows the acknowledgement only after the batch returns; a test forces a failure |
| Notification failure loses the enquiry | Notification runs after the insert through `waitUntil`, errors caught and logged without customer data; test with a throwing adapter |
| Editors or viewers reach customer data | Every admin enquiry route and POST calls `requirePermission`; routes added to `ADMIN_ROUTES`, covered by the inventory and role-matrix tests; mutation checks per route |
| Admin search or notes echo customer data into logs or URLs | Search is a POST-free GET parameter used only in a bound LIKE query and never logged; page shows it only inside the admin session (no-store); test that logs are constants |
| Consent wording drifts from what was stored | Version id constant per language; tests assert the stored version equals the dictionary's and that changing the text without the version fails a snapshot-style test |
| Reference code collisions | Unique column plus bounded retry; test forces a collision |
| Scope creep (referral assignment, deletion, funnel counts, images, Turnstile) | All listed as excluded in the spec; the public-pages scope guard and admin route inventory are updated deliberately |

## Verification checkpoints

- After T3: a valid submission creates exactly one `new` enquiry with consent version and time; failures create none.
- After T5: AC-06, AC-07, AC-08 pass against the built Worker in both languages and the customer-data sweep is clean.
- After T7: AC-11 passes and editor/viewer are refused on every enquiry route.
