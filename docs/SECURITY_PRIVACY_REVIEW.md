# Security and privacy review (Phase 7, 2026-10-19)

Written review required by [SPEC-phase-7.md](SPEC-phase-7.md) (assumptions 10 and 12). Each line names the test or check that covers it, or says **manual** or **not checked**. This is a review of the code as built; it is not a penetration test, and nothing here has been tried against a deployed site.

## Security checklist (SEC-01 to SEC-09)

| Area | What was checked | Covered by | Status |
|---|---|---|---|
| Response headers (SEC-08) | CSP (no `unsafe-inline`/`unsafe-eval`, `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`), nosniff, frame denial, referrer policy, HSTS, permissions policy on public pages, files, API outcomes, errors, admin pages and redirects | `tests/integration/security-matrix.test.ts`, `tests/workers/headers.test.ts` | Pass. HSTS has no `includeSubDomains` or preload yet (needs the real domain, Phase 8) |
| Inline script and style | No inline script or style; JSON-LD is a data block, not executed; CSP header identical with and without it | `tests/integration/jsonld.test.ts`, `e2e/csp.spec.ts` (16 public pages) | Pass |
| Cookies (SEC-01, SEC-05) | One cookie only, after sign-in: `__Host-alfaiate_session`, HttpOnly, Secure, SameSite=Lax; none on any public page, file or API response | `tests/integration/security-matrix.test.ts`, `tests/integration/admin.test.ts` | Pass |
| Sessions (SEC-01) | 30 min idle, 12 h absolute, hashed token in D1, logout ends it, role read from D1 on every request | `tests/workers/login.test.ts`, `tests/workers/session.test.ts`, `tests/integration/admin.test.ts` | Pass |
| Passwords (SEC-01) | PBKDF2-SHA-256, 600,000 iterations, per-hash salt, dummy hash for unknown users, 12-character minimum | `tests/workers/password.test.ts`, `login.test.ts` | Pass. Real sign-in CPU time must be re-measured on the deployed Worker (Phase 8) |
| Authorisation (SEC-09, AC-09) | Every admin route is listed with a named permission, checked server-side; every role against every route and method; owner-only routes (fees, users, anonymise) refuse managers | `tests/workers/admin-route-inventory.test.ts`, `tests/integration/ac09-matrix.test.ts` | Pass |
| CSRF (SEC-02) | Every admin POST needs a session-derived token; public POSTs need a matching Origin (Astro's cross-site check plus our own on `/request` and `/api/contact-click`) | per-route integration tests (missing or wrong token gives 403), `request.test.ts`, `contact-click.test.ts` | Pass |
| Rate limits | Login 5 per address (IPv6 per /64) and 50 per email per 15 minutes; request form 5 per hour per address; tap counter 60 per hour | `rate-limit.test.ts`, `enquiry-spam.test.ts`, `contact-click.test.ts` | Pass. With no client address header all callers share one bucket: confirm production sends `cf-connecting-ip` (Phase 8) |
| Injection and XSS (SEC-02) | Every query uses bound parameters; the only interpolated SQL is fixed column lists and constants; Astro escapes all output; the single `set:html` is the JSON-LD block, serialised with `<`, `>`, `&` escaped | reviewer audits Phases 2 to 6, `tests/workers/jsonld.test.ts`, hostile-input tests in `tests/integration/profile.test.ts`, `request.test.ts`, `admin-enquiries.test.ts` and `jsonld.test.ts` | Pass |
| Uploads (SEC-04) | JPEG-only strict validator, three fixed sizes, size and photo-count caps, private bucket first, public copy only with permission and on a published tailor, route re-checks D1 | `media-validate.test.ts`, `media-service.test.ts`, `media-route.test.ts`, `public-permission.test.ts` | Pass. Tried in Chromium only; Safari and Firefox not tried |
| Public visibility (BR-06) | Published, permission recorded and consent: database CHECK plus every public query repeats the permission clause | `tests/workers/public-permission.test.ts` | Pass |
| Customer data exposure (SEC-05, AC-15) | Name, number, notes, referral text and fees absent from every public page, API response, header, sitemap and robots; enquiry and notification code logs only constant text | `tests/integration/public-privacy.test.ts`, `tests/workers/console-constants.test.ts` | Pass |
| Spam controls (SEC-07) | Honeypot, signed fill-time token, per-address limit; genuine users never silently lose a request | `enquiry-spam.test.ts`, `request.test.ts` | Pass. The token can be reused for 24 hours; the limit is the guard (add a Cloudflare rate-limit rule in Phase 8) |
| Secrets (SEC-03) | `.dev.vars` and `.env` ignored; example files hold placeholders; the public example value is refused as a secret; no tracked key, token, database, upload or photo | `npm run check:repo`, `tests/workers/check-repo.test.ts`, `enquiry-spam.test.ts` | Pass. Real secrets are set with `wrangler secret put` in Phase 8 |
| Dependencies | `npm audit --omit=dev` and `npm audit` on 2026-10-19: 0 vulnerabilities. No new runtime dependency in Phases 4 to 7 | manual run | Pass at this date; re-run before launch |
| Staging indexing (AC-05) | `SITE_INDEXABLE` must be exactly `true`: robots disallow-all, noindex header and meta, empty sitemap otherwise | `tests/workers/indexable.test.ts`, `tests/integration-staging/` | Pass. Staging and production values must be confirmed after deploy (Phase 8) |
| Manual accessibility pass | Keyboard focus visibility at 320 px, contrast of the colour tokens (computed), reduced motion; see DECISIONS.md | manual + `e2e/reflow.spec.ts` | Screen readers, real phones, Safari and Firefox **not tested** |
| Error pages | 404, 403 and form-error pages show plain messages; no stack traces in any tested path | `tests/integration/security-matrix.test.ts` (24 response kinds), `tests/integration/hardening.test.ts` | **Not checked:** the body of an unexpected 500 in production mode (Astro's default page) |
| Browser coverage | Chromium only (Playwright) | e2e suite | Safari, Firefox and real phones **not tested** |

### Carried-over findings from the Phase 3 to 6 audits

Fixed in Phase 7: public queries require recorded permission; a malformed stored number no longer breaks a profile; a request post without Origin gets a plain page; the sitemap becomes an index past 5,000 entries; the e2e runner cleans up on all signals.
Moved to Phase 8 (owner-visible in [STATUS.md](STATUS.md)): a Cloudflare rate-limiting rule on `POST /request`, `/api/contact-click` and the sitemap routes; disable `workers.dev` and preview URLs for production (otherwise the production Worker would answer "indexable" on a second host); change `SITE_URL` and `SITE_INDEXABLE` together when the domain is chosen (production is `true` while `SITE_URL` is still a placeholder); confirm `cf-connecting-ip` in production; HSTS `includeSubDomains`/preload; secrets with `wrangler secret put`; PBKDF2 timing on the deployed Worker; keep the public R2 bucket off `r2.dev` and custom domains; staging noindex check.
Accepted: the admin search term appears in the admin URL (`?q=`; admin only, no-store, origin-only referrer); free text on referrals can hold customer details (admin only, cleared by anonymising); dates have no future-date checks.

## Privacy review (PRV-01 to PRV-05, AC-15)

| Area | Finding |
|---|---|
| What is collected | Request form: name, number and channel, optional category, area, preferred time, notes (PRV-01). Referral records the owner types: dates, method, what was shared, response, completion, fee. Aggregate tap counts per tailor per day (no visitor data). Admin accounts: email and password hash |
| Where it is shown | Customer data only on authenticated admin pages. Owner and manager: enquiries, referrals, the dashboard figures. Owner only: fees, users, anonymise. Editor and viewer: no enquiry data (403). Never on public pages, URLs (except the random reference code), sitemap, robots, API responses or notifications |
| Logs | The only `console` call in the application logs the constant "owner notification failed". Cloudflare keeps its own request logs (URLs, addresses) as a platform default; no log export or Workers observability is configured here. Admin URLs carry only numeric ids, `?period=`, `?status=`, `?q=` and message codes |
| Analytics (PRV-05) | Own counters only (`contact_click_daily`: tailor, channel, UTC day, count; `page_view_daily`: Dili day, path, referrer group, count). No cookies, no scripts from other sites, no fonts or maps (tested). Cloudflare's web analytics are not used |
| Cookies | None on public pages (tested). One session cookie for admin users after sign-in |
| Third parties | None at runtime. Cloudflare hosts the site, database and images and therefore processes customer data (to be stated in the privacy notice, OQ-08) |
| Consent (PRV-03) | Each enquiry stores the consent text version (per language) and time; a test fingerprints the wording so it cannot change without a new version |
| Retention and deletion (PRV-04) | Mechanism built: the owner can anonymise an enquiry on request (clears the personal columns, referral free text (including the fee basis note), the enquiry's notes and the notes on its referrals, and refuses any free text afterwards; keeps status, dates, category, area, referral and fee fields so figures do not change; audited with ids only). `enquiry_attachment` is not handled because no attachment can be created yet (FR-ENQ-07 not built); it must be added to the routine if that ever ships. **The retention period is not decided (OQ-09)** and nothing is deleted automatically. No hard delete exists |
| Backups | Not built yet (Phase 8). A D1 export and R2 copy will contain customer data: access limited to the owner's Cloudflare account, covered by the retention decision, and **anonymising does not rewrite backups already taken**; the privacy notice should say so |
| Data subject request procedure | Owner finds the enquiry by reference, name or number in the inbox, opens it, types the reference code in the anonymise form; the audit log records who and when (no personal data) |
| Open for the owner | Privacy and terms text (OQ-08), retention period (OQ-09), statement about Cloudflare processing and data location, Tetum privacy text review |

Not checked: legal applicability of any Timor-Leste data-protection rule (PRD notes this is unassessed); real Cloudflare log settings in the owner's account.

## Tailor portal (2026-10-21)

- **New principal:** tailors sign in at `/portal` with their own tables, cookie and guard. A tailor session cannot be accepted by any admin route and a staff session cannot open the portal (tested for every admin and portal route in `tests/integration/portal-isolation.test.ts`). The staff permission table has no tailor role.
- **Scope of a tailor:** one tailor id, taken from the session only. Allow-listed profile fields; tick-only work types and areas that cannot mark anything verified; own photos only. No customers, enquiries, referrals, fees, notes or private contact fields are reachable or rendered (tested with planted secrets).
- **Invite links:** 32 random bytes, stored hashed, single use, 7 days, shown once to staff; never logged or kept in the audit log (tested). Re-issuing replaces the old link.
- **Uploads:** same validation and limits as staff, plus 20 per hour per tailor; stored in the private bucket, hidden until staff show them, with the tailor's confirmation recorded.
- **Notification:** "ready for review" sends a reference (`TP-<id>`) and an admin link only.
- **Open for the owner:** privacy text for tailor accounts (OQ-08); consider an extra rate limit or Cloudflare rule for `/portal/login` and `/portal/accept` in Phase 8.

