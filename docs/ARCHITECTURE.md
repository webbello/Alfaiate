# Alfaiate TL — Architecture

Status: Draft v0.3 · 2026-10-18 · Requirements: [PRD.md](PRD.md) · Data: [DATA_MODEL.md](DATA_MODEL.md) · Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

**Owner-selected stack (confirmed 2026-10-16):** Astro 7.4, Cloudflare Workers, Cloudflare D1, Cloudflare R2 (or another image store), and a custom admin interface with role-based access control (RBAC). Everything else below is **proposed** unless marked confirmed. Phases 1–6 are implemented (project skeleton; database schema; admin sign-in, sessions and RBAC; tailor profiles, categories, areas, photos and publishing; the public bilingual site; the request form and admin inbox; referral tracking and the dashboard). Phase 7 added hardening, SEO and accessibility checks and the speed budgets; only deployment and the pilot (Phase 8) remain.

## 1. Existing repository assessment

Inspected 2026-10-16 at `/Users/apple/Sites/AlfaiateTL`: empty directory, no conventions. **Phase 1 completed 2026-10-18** (verified on npm and by running `npm run check`): npm; Astro 7.4.0 with `@astrojs/cloudflare` 14.4.0 and Wrangler 4.151.1 (exact pins); TypeScript 6.0.3 (7.x unsupported by `@astrojs/check` and `typescript-eslint` peers); ESLint 10 + Prettier 3; Vitest 4.1.12 from Phase 2 (see DECISIONS.md) with three projects. Node >= 22.22.0. Toolchain decisions are in [DECISIONS.md](DECISIONS.md); the check command is `npm run check`.

## 2. Stack

| Concern | Choice | Status | Notes |
|---|---|---|---|
| Web framework | **Astro 7.4.0**, TypeScript 6.0.3 | Confirmed by owner; AD-01 resolved 2026-10-18 | Astro 7.4.0 + `@astrojs/cloudflare` 14.4.0 + Wrangler 4.151.1, exact pins. TypeScript 7 is unsupported by `@astrojs/check` and `typescript-eslint` peers (DECISIONS.md). |
| Runtime | **Cloudflare Workers** via the Astro Cloudflare adapter | Confirmed | One Worker serves public pages, form handlers, media delivery and the admin. Mostly server-rendered; static prerendering is used where content is stable and no per-request data is needed. |
| Database | **Cloudflare D1** | Confirmed | All structured data (see DATA_MODEL). SQL migrations via the Wrangler migration tooling. |
| Image storage | **Cloudflare R2** | Confirmed; AD-04 resolved 2026-10-19 (R2, `/media` route, browser resize) | Separate from the database; D1 stores only keys and metadata. |
| Admin | Custom, server-rendered Astro pages under `/admin` with RBAC | Confirmed | No third-party admin framework or CMS. |
| Bot protection | Honeypot, signed fill-time token and per-address limit; no Turnstile in Phase 5 | Implemented (Phase 5); Turnstile declined by owner, revisit before launch | See §10 (SEC-07). |
| Validation | Hand-written per-form validators returning message keys (Zod 4.6.7 is installed but unused for enquiries) | Implemented (Phase 5) | `src/modules/enquiry/schema.ts` |
| Styling | Plain CSS with tokens | Proposed | Small payloads. |
| Tests | Vitest 4.1.12 with four projects (`workers`: workerd + local D1/R2 via `@cloudflare/vitest-plugin`; `integration`: the built Worker with real HTTP requests, English+Tetum, indexable; `integration-en`: Tetum off; `integration-staging`: Tetum on, indexing off); Playwright + axe (`e2e/`, WCAG 2.2 AA, CSP watcher, no-JavaScript, reflow) | Implemented (Phase 2; browser tests Phase 4) | `npm test` runs `workers`; `npm run test:integration` builds, then runs the other three; `npm run perf` measures page weight and timings; `npm run check:repo` refuses tracked secrets, databases, uploads and photos; `npm run check` runs all of these; `npm run test:e2e` (separate) builds and runs Playwright and axe on a throwaway database. |

Exact versions are in `package.json`.

## 3. Application architecture

A single Worker (modular monolith) with bindings to D1 and R2. No queues, Durable Objects, microservices or search service in the MVP.

```
Browser ──> Cloudflare edge ──> Worker (Astro SSR)
                                 ├─ public pages (read queries)
                                 ├─ POST /request  (enquiry intake)
                                 ├─ /media/*       (public images from R2)
                                 ├─ /admin/*       (auth + RBAC)
                                 ├─ D1  (structured data)
                                 └─ R2  (public bucket prefix + private bucket)
```

| Component | Responsibility |
|---|---|
| Public pages | Home, directory, categories, profiles, request form, tailor interest form (`/join`, off until `JOIN_ENABLED=true`), static pages, sitemap, robots |
| `enquiry` module | Validate, bot-check, persist enquiry; acknowledgement; owner notification |
| `referral` module | Referral rules (consent/approval checks), outcome and fee recording |
| `admin` pages | Tailors, images, categories, areas, enquiries, referrals, dashboard, user management |
| `auth` module | Login, sessions, CSRF, password hashing, RBAC guard |
| `media` module | Upload validation, R2 read/write, public/private separation |
| `db` layer | Typed D1 queries, migrations, batch/transaction helpers |
| `contact-links` | Builds `tel:` and `wa.me` URLs |
| `config` | Typed bindings/secrets validated on startup |
| `notify` | Single function for owner notification (channel per OQ-06) |

Pages call modules; modules call `db`/`media`. Modules do not query each other's tables directly.

**Reference design (Phase 7d).** Visual hierarchy pass 2026-10-23: the hero is one headline, two equal filled buttons (`hero.find`, `hero.request`), the `hero.reassure` line and the trust row, with no photo overlays (the `hero.script` and `hero.badge` keys are kept but not rendered); a `TailorCard` shows a decorative "View Profile" button and the title link covers the whole card; the profile puts its contact section in a sticky side column on wide screens. The home page is `src/views/Home.astro` composed from `src/components/home/` (HeroSection, ServiceCategories and ServiceCard, FeaturedTailors and TailorCard, CraftsmanshipSection, HowItWorks and ProcessStep, PromotionalBanners, TestimonialsSection and TestimonialCard, FinalCallToAction) with `src/components/layout/` (SiteHeader with the phone-menu script, SiteFooter) and `src/components/ui/` (Icon from the `public/icons.svg` sprite, SectionHeading, Logo). Scene photos are listed once in `src/components/home/images.ts`; service cards in `services.ts`; owner-approved quotes in `testimonials.ts`. Styles: tokens in `site.css`, home sections in `home.css`. New public routes: `/contact`, `/business` (request workflow with `kind = 'business'`), `/newsletter` and `/newsletter/thanks` (404 unless `NEWSLETTER_ENABLED`); admin `/admin/newsletter` and POST `/admin/newsletter/[id]/remove` (`enquiry.delete`, owner).

**Public art direction (Phase 7c).** Palette and type live in `src/styles/site.css` (tokens tested for contrast), story pieces in `src/styles/story.css` (loaded only by the home page), decorative components in `src/components/story/` (aria-hidden, no text or links, CSS 3D, motion only under `prefers-reduced-motion: no-preference`). The display serif is one self-hosted WOFF2 under `public/fonts/` with its OFL licence. `/join` (module `src/modules/interest/`, table `tailor_interest`) is an interest form that creates no tailor, account or listing; `/admin/interest` lists it for `tailor.edit` and only the owner removes details. `/join` runs the request form's protections (Origin check, hidden field, signed fill-time token, own `interest:` rate-limit bucket of 5 an hour, size cap, consent version recorded) and redirects with a JN reference to `/join/thanks`; the form is off unless `JOIN_ENABLED` is exactly `true` (OQ-08). The request form is now two fieldsets in one form with radio pills for category and area (same fields, same server rules). See [ART_DIRECTION.md](ART_DIRECTION.md).

**Admin layout (Phase 7b).** Every admin page uses `src/layouts/AdminLayout.astro` (the sign-in page passes no `auth` and gets a centred card instead; otherwise a header bar, links from `navLinks(role)`, current page marked, signed-in user, Sign out) and one external stylesheet, `src/styles/admin.css` (byte budget enforced in `tests/integration/budgets.test.ts`). Small components in `src/components/admin/` (Flash, StatusChip, Card, EmptyState, StatCard) and pure helpers in `src/modules/admin-ui/` (nav, message classification, tone, next-step hint, publish checklist built from `publishBlockers`) hold the presentation; routes, forms, permissions and server rules are unchanged, guarded by `tests/integration/admin-contract.test.ts`. Admin pages ship no inline script; the only external script is the existing photo upload tool on a tailor page. Demo data (`seeds/demo.sql`, `npm run db:demo`) is local-only and not a migration.

## 4. Request and data flows

**Public browse.** Request → Worker → D1 query restricted to published tailors and permitted images → HTML. Public pages may use edge caching (cache API/CDN) with short TTLs and purge/expiry on publish changes; cache only responses containing no customer data. No enquiry table is read on public paths.

**Doorstep request.** Built in Phase 5. Form POST → same-origin check → body size limit → per-address rate limit (every attempt counts) → honeypot (silent: looks like success, stores nothing) → signed fill-time token (minimum 3 s, maximum 24 h; `FORM_TOKEN_SECRET`) → hand-written validation → active category/area and published-tailor checks → one D1 batch (enquiry with status New, consent text version per language and time, plus its first status-log row) → owner notification (best effort through `waitUntil`; failure logged without details, enquiry kept) → 303 to `/request/thanks?ref=<code>`. The code is random (`AT-` plus 8 characters) and the only thing in the URL; a database failure shows an error page, never the acknowledgement. Turnstile is not used (owner decision, Phase 5).

**Referral.** Built in Phase 6. On the enquiry page a manager or owner picks an approved tailor (`referral.edit`) → the module refuses an enquiry with no sharing consent or already anonymised, an unapproved tailor, and a second referral while another is pending or accepted (the last check is inside the INSERT; database triggers back up consent and approval) → insert referral and an id-only audit row in one batch. The owner or manager then records forwarded date and method, what was shared, the tailor's response and the reported completion by hand; only the owner can record a completion as owner-confirmed or touch fees (`fee.view`). Fee amounts are typed in dollars (stored as cents), never calculated; `due` or `paid` needs the tailor's agreed-terms date (BR-09) and an amount needs a reported completion (BR-10). Nothing is sent and no enquiry status changes automatically; reassignment after a decline or no response adds a new referral and keeps the old one. The `/admin` dashboard (`enquiry.view`) shows M1–M6 and M8, and fee figures (M7, M9, due, disputed) only to the owner, queried only for the owner.

**Anonymise.** Built in Phase 7. On the enquiry page the owner (`enquiry.delete`) types the reference code to confirm; one batch clears the six personal columns and sets `anonymised_at`, clears `fields_shared_note`, `closed_reason`, `order_value_note` and `fee_basis_note` on its referrals, deletes its internal notes and the notes on its referrals, and writes an `enquiry_anonymised` audit row (ids only). Status, status log, category, area, dates, source, referral rows and fee amounts stay, so reporting is unchanged. Afterwards no free text can be added to the enquiry, its notes or its referrals. Nothing is automatic and nothing is hard-deleted; `enquiry_attachment` is unused (FR-ENQ-07 not built), so if attachments are ever added this routine must delete them and their private files too.
**Contact tap.** Optional beacon increments a daily aggregate; the link works if the beacon fails.

**Image upload.** Admin browser → Worker (authorised, validated) → R2 (see §8) → metadata row in D1.

## 5. Routes

Unchanged in intent from v0.1. Phase 4 added the Tetum language prefix: every page below exists in English at the path shown and in Tetum under `/tet/` (e.g. `/tet/tailors`); Tetum returns 404 unless `PUBLIC_LANGUAGES` includes `tet`. `/areas/[slug]` (and `/tet/areas/[slug]`) were added 2026-10-21 for search discovery and listed in the sitemap; an area with no published tailor is `noindex`. `/services` and `/craft` (own pages for the Services and Our Craft menu items, in both languages, listed in the sitemap) were added 2026-10-21. `/request` (GET and POST) and `/request/thanks` were built in Phase 5. Privacy and Terms are placeholders (noindex, outside the sitemap) until the owner supplies text. `POST /api/contact-click` is language-neutral.

**Public:** `/`, `/tailors` (filters `category`, `area`, `home_visit`), `/tailors/[slug]`, `/categories/[slug]`, `/request` (`?tailor=slug`), `/request/thanks`, `/join` and `/join/thanks` (Phase 7c: noindex, not in the sitemap, 404 unless `JOIN_ENABLED` is exactly `true`), `/how-it-works`, `/about`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt` (disallow-all unless `SITE_INDEXABLE` is `true`), `/sitemap-<n>.xml` (child files, only when the sitemap is split past 5,000 entries and the site is indexable; `/sitemap.xml` then becomes an index), `/media/*`, `POST /api/contact-click`. `/request` handles both GET and POST (`/tet/request` in Tetum); `/request/thanks` shows only a well-formed reference code.

**Admin (`/admin`, authenticated, `noindex`, no-store):** `/admin/login`, `/admin/logout`, `/admin` (dashboard), `/admin/account` (own password), `/admin/users/actions` (POST handler), `/admin/tailors`, `/admin/tailors/new`, `/admin/tailors/[id]` (with POST handlers `/actions`, `/publish`, `/fees`, `/images`, `/images/actions`), `/admin/media/[...key]` (private photo preview), `/admin/categories`, `/admin/areas`, `/admin/enquiries` (`enquiry.view`; filters `status`, `q`, `spam`), `/admin/enquiries/[id]` (`enquiry.view`; POST `/anonymise` needs `enquiry.delete`, owner only; POST handler `/actions` needs `enquiry.update`; referral POST handlers `/referrals` and `/referrals/[rid]` need `referral.edit`, `/referrals/[rid]/fee` needs `fee.view`), `/admin/traffic` (`enquiry.view`; visit counts), `/admin/interest/[id]/approve` and `/decline` and `/admin/tailors/[id]/invite` (`tailor.publish`; POST), `/admin/interest` (`enquiry.view`: owner and manager; lists tailor interest details; POST `/admin/interest/[id]/anonymise` needs `enquiry.delete`, owner only), `/admin/users` (owner only).

Each admin route and each mutating handler declares the permission it needs (§6).

## 6. Authentication, authorisation and RBAC

- Three zones: anonymous (public routes), authenticated admin (staff), and the **tailor portal** `/portal` (owner-approved tailors, added 2026-10-21, FR-TPO-*). No customer logins (PRD §7.3). The tailor sign-in is separate from staff: `tailor_account`, `tailor_session` (cookie `__Host-alfaiate_tailor`, 2 h idle, 24 h absolute) and `tailor_invite` (single-use link, hashed, 7 days), guard `requireTailor` in `src/modules/portal/require.ts`; the staff permission table has no tailor role, so a tailor can never hold a staff permission and a tailor cookie is simply 'not signed in' on `/admin` (and a staff cookie on `/portal`). Rebuilding `admin_user` to add a role was tested and rejected: it wipes staff sessions and audit actors. The tailor id comes only from the session; the shared services (`updateProfile`, `setCategories`, `setAreas`, `storeImage`, `updateDetails`, `removePhoto`) take an `Actor` (staff id or tailor account) for the audit log, and the portal wrappers decide what may change (allow-listed fields, tick-only categories and areas, photos hidden until staff show them). `/portal` pages are `no-store` and `noindex`; every file is listed in `PORTAL_ROUTES` and checked by `portal-route-inventory.test.ts`; `portal-isolation.test.ts` runs the matrix.
- **Sessions (implemented):** random 256-bit token in the `__Host-alfaiate_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`); only its SHA-256 is stored in D1 (`session`); 30 min idle and 12 h absolute expiry; a new session on every sign-in (the previous one is revoked); revocation on logout, password change and deactivation. Our own D1 sessions are used, not Astro sessions (disabled). CSRF: a token derived from the session token is required on every authenticated POST, plus Astro's origin check.
- **Passwords (implemented, AD-03):** WebCrypto PBKDF2-HMAC-SHA-256, parameters stored with each hash and upgraded at sign-in. The default iteration count (600000) is provisional and depends on the Cloudflare plan (AD-02): see DECISIONS.md. Sign-in is rate limited (5 attempts per IP — IPv6 counted per /64 — and 50 per email per 15 minutes; attempts are counted atomically before the password is checked and refunded on success; D1 counters with hashed keys; changing your own password is limited the same way) and all failures look identical.
- **Optional extra layer:** Cloudflare Access in front of `/admin` can be added later without code changes to the app's own checks (defence in depth, not a substitute).
- **Account creation:** by an `owner` inside `/admin/users`, or by `npm run owner:create` for the first owner (local D1 by default; password typed without echo). `npm run owner:reset` recovers a forgotten password. No public sign-up.

### Roles and permissions (confirmed by owner 2026-10-18, OQ-15)

Permission-based checks (`can(role, 'tailor.publish')`), with roles as fixed bundles defined in code. Roles are stored per user; a user has exactly one role in the MVP. No custom role editor.

| Permission | owner | manager | editor | viewer |
|---|:-:|:-:|:-:|:-:|
| View dashboard figures (needs `enquiry.view`; fee figures owner only) | ✔ | ✔ | | |
| Create/edit tailor profiles, images, categories, areas (draft) | ✔ | ✔ | ✔ | |
| Publish / unpublish tailors; record permission and verification | ✔ | ✔ | | |
| View enquiries (contains customer data) | ✔ | ✔ | | |
| Update enquiry status, notes; create/edit referrals | ✔ | ✔ | | |
| View/edit tailor fee terms and referral fee/payment data | ✔ | | | |
| Delete or anonymise enquiries | ✔ | | | |
| Manage admin users and roles | ✔ | | | |

Rules: least privilege by default; denied by default when a permission is unmapped; the last active owner cannot be demoted or deactivated; role changes and sign-ins are logged; `editor` and `viewer` never see customer data (BR-07, SEC-05). If the owner is the only operator at launch, a single `owner` account is enough and the other roles stay unused but tested.

## 7. Integration points

| Integration | Approach |
|---|---|
| WhatsApp | `https://wa.me/<digits>?text=<encoded>` links only; no API in MVP. Prefilled text names the listing, never customer data. |
| Telephone | `tel:+670…`; numbers stored E.164 (Timor-Leste +670). |
| Forwarding to tailors | Manual by the owner from a "copy details" admin view. |
| Owner notification | Adapter in `notify`. Implemented as a webhook: `src/modules/notify/webhook.ts` POSTs plain text to `NOTIFY_WEBHOOK_URL` (https only, no credentials in the address, 5 s timeout) for new requests, business enquiries and tailor interest; unset means nothing is sent. Works with ntfy, Slack or Discord; the owner still confirms the channel (OQ-06, AD-05). The message contains only the reference code and a link to the admin enquiry page — never the customer's name, phone or notes (SEC-05). Failures are logged without details and never block the form. |
| Turnstile | Not used in Phase 5 (owner decision); revisit before launch if spam appears. |
| Maps | None in MVP. |
| Analytics | Decided 2026-10-19: own counters only. `POST /api/contact-click` (same-origin, 1 KB body, rate limited per address bucket) adds one to a per-tailor, per-channel, per-UTC-day count in `contact_click_daily`; no visitor data is stored. Page visits (ANA-01): middleware writes `page_view_daily` (Dili day, path, referrer group) via `waitUntil`; known bots, Do Not Track and Global Privacy Control are skipped, the referrer is reduced to search, social, internal, direct or other, and `/admin/traffic` (`enquiry.view`) reads it (PRV-05). Env: `NOTIFY_WEBHOOK_URL`, `RESPONSE_WINDOW_EN`/`_TET` (FR-ENQ-04, OQ-05), `GOOGLE_SITE_VERIFICATION`, `SOCIAL_*`. |

## 8. Image storage and upload

Implemented in Phase 3 (decisions AD-04 and AD-07 resolved 2026-10-19).

- **Separation:** images live in R2; D1 (`portfolio_image`) holds only a random `file_key`, alt text, caption, order, permission and visibility. No image bytes in the database.
- **Keys:** `tailor/<tailorId>/<32 hex>/<thumb|medium|large>.jpg`. Keys are parsed strictly (`src/modules/media/keys.ts`); anything else, including traversal, is rejected.
- **Buckets:** every upload lands in the **private** bucket (`MEDIA_PRIVATE`). A copy exists in the **public** bucket (`MEDIA_PUBLIC`) only while the photo has recorded permission **and** is visible **and** its tailor is published (BR-06). `reconcileImages(tailorId)` recomputes that set from D1 and copies or deletes accordingly; it is idempotent and runs after every change that can affect it (permission, visibility, publish, unpublish, withdraw, delete). It removes before it adds.
- **Delivery:** `GET /media/<key>` serves the public bucket only, after also confirming in D1 that the photo may be shown right now (a second line of defence if a cleanup ever fails). `Cache-Control: public, max-age=3600`: a withdrawn photo is deleted at once but a cache may keep a copy for up to one hour. Admins preview any photo, including private ones, through `GET /admin/media/<key>` (`tailor.edit`, `no-store`).
- **Processing:** the admin's browser redraws the chosen photo on a canvas into three JPEGs (320, 800 and 1600 px wide, heights capped at 4000), which drops EXIF, GPS and other metadata (`src/scripts/image-upload.ts`). Originals up to 8 MB; JPEG, PNG or WebP accepted for selection; only JPEG is stored.
- **Server validation (SEC-04):** the server never trusts the browser. `validateVariant` walks the JPEG marker structure and accepts only a baseline/progressive JPEG whose JFIF header is exactly the standard 16 bytes (first segment), whose only other application segment is an optional ICC colour profile (signature checked, at most 8 KB, before the picture), whose quantisation/Huffman/restart/frame/scan headers have exactly the sizes their contents declare, with at most 12 scans and nothing after the end marker. EXIF/XMP (APP1), IPTC (APP13), every other APPn, comments, truncated files, wrong width, over-size files are rejected. Nothing is stored unless all three variants pass. This stops metadata containers; hiding data inside the pixel data itself is not something any server-side check can prevent.
- **Limits:** 10 photos per tailor, enforced by the same SQL statement that inserts the row (parallel uploads cannot exceed it); thumb 150 KB, medium 600 KB, large 2 MB; request bodies are read with a size limit (64 KB for ordinary forms, about 3 MB for an upload) instead of being buffered whole.
- **Permission rules:** uploads and edits follow the profile edit lock (editors only on unpublished tailors); recording or withdrawing a photo's permission is a manager/owner action. The profile-photo pointer needs permission and visibility, and is cleared when either is lost or the photo is deleted.
- **Failure behaviour:** files are deleted before the database row, and a failed storage write cleans up after itself, so a failure leaves something retryable and never an orphaned public file. If syncing fails after an unpublish, the request errors and can be retried; consider a scheduled sync (Cron Trigger) in Phase 8.
- **Deployment requirement (Phase 8):** the public bucket must not be exposed through `r2.dev` or an R2 custom domain; it is read only by the Worker, which checks D1 first.
- **Switching store:** all access goes through the `media` module, so moving off R2 touches one module.

## 9. Validation and error handling

- Server-side validation for every form/endpoint (hand-written in `src/modules/enquiry/schema.ts` for the request form); client checks are convenience only.
- Phones normalised to E.164 (accept local formats and +670).
- Inline field errors, input preserved; unexpected errors show a friendly page with direct-contact fallback; no success page when the write failed.
- Logging uses a request ID and excludes customer data and request bodies.
- Bindings and secrets are validated at startup of each request path that needs them; missing config fails closed.

## 10. Security and privacy controls

| Control | Detail | Req |
|---|---|---|
| Auth, sessions, RBAC | §6; server-side check on every admin request and mutation | SEC-01, SEC-09 |
| CSRF, escaping, parameterised D1 statements | Prepared statements with bound parameters only | SEC-02 |
| HTTPS | Cloudflare edge; HSTS | SEC-03 |
| Secrets | Worker secrets and `.dev.vars` (git-ignored); `.dev.vars.example` with placeholders | SEC-03 |
| Upload hardening | §8 | SEC-04 |
| Customer data isolation | Only `can(role, 'enquiry.view')` routes read enquiry tables; edge cache never stores them | SEC-05 |
| Admin headers | `noindex`, `Cache-Control: no-store`; when `SITE_INDEXABLE` is not `true` every response also sends `X-Robots-Tag: noindex, nofollow` | SEC-06 |
| Spam control | Honeypot, signed minimum-fill-time token (`FORM_TOKEN_SECRET`, Worker secret, fails closed), per-address limit of 5 per hour in the D1 counter, same-origin check; no Turnstile in Phase 5 | SEC-07 |
| Security headers | CSP, nosniff, frame-ancestors, Referrer-Policy, HSTS, X-Frame-Options, Permissions-Policy (camera, microphone, geolocation, payment off), no `data:` images; applied by middleware to server-rendered responses (static `/_astro/*` assets get cache headers only, DECISIONS T11) | SEC-08 |
| Consent record | Version and timestamp on enquiry | PRV-03 |
| Retention/anonymisation | Built (Phase 7): owner-only anonymise action, reference code typed to confirm; clears the personal columns, referral free text and notes in one batch, locks free text afterwards, audited with ids only. Retention period still open (OQ-09); no automatic purge, no hard delete; earlier backups are not rewritten | PRV-04 |
| Audit | Phase 2 writes login, login_failed, logout, user_created, role_changed, user_deactivated, user_reactivated, password_changed; tailor, image, catalog and fee actions (Phase 3), enquiry status and spam changes (Phase 5), referral created, updated and fee updated (Phase 6), enquiry anonymised (Phase 7), interest anonymised (Phase 7c); ids only | SEC-09 |

Cloudflare processes customer data in transit and at rest in D1/R2; the privacy notice must reflect this and data-location questions go to OQ-08.

## 11. SEO and performance

- Server-rendered HTML; one `<h1>`; unique title, description and canonical per page; `hreflang` alternates for the enabled languages.
- Built in Phase 7: Open Graph tags (title, description, URL, type, site name and, for a permitted profile photo, the image) and JSON-LD on **indexable** public pages only: `WebSite` and `Organization` on the home page, `LocalBusiness` on a profile with name, URL, description, address text, telephone (only with recorded contact consent) and image (only a permitted photo). Never ratings, reviews, prices, hours or claims (BR-11). The JSON block is serialised with `<`, `>`, `&` escaped and is a data block, so the strict CSP is unchanged.
- `SITE_INDEXABLE` (Wrangler var; only the exact string `true` enables indexing): when off (local, staging) `robots.txt` is `Disallow: /`, the sitemap is empty and every response sends `X-Robots-Tag: noindex, nofollow` and a noindex meta tag. Production sets it to `true`.
- Sitemap from published, permitted content only (one entry per page and language); it becomes a sitemap index with `/sitemap-<n>.xml` child files past 5,000 entries. `robots.txt` blocks `/admin` and `/api`; filtered directory pages are `noindex,follow` with the plain list as canonical.
- Responsive images (320, 800, 1600 px widths) with `srcset`, `sizes` and alt text, lazy except the profile hero; system fonts; JavaScript only for the tap counter and the admin upload tool; no third-party requests.
- **Budgets are measured, not assumed:** `npm run perf` and the recorded numbers and limits are in IMPLEMENTATION_PLAN.md Phase 7; byte budgets (measured + about 20%) are enforced by `tests/integration/budgets.test.ts`. A check from Dili and with real photos belongs in Phase 8.

## 12. Deployment, configuration and backup

- **Environments:** local (Wrangler dev with local D1/R2), staging Worker with separate D1/R2, production. Wrangler configuration (`wrangler.jsonc`/`toml`) is committed; secrets are not.
- **Deploy:** build with Astro → deploy with Wrangler; D1 migrations applied explicitly before the code that needs them (backward-compatible migrations to allow rollback). Rollback = redeploy previous version; database changes are forward-fixed or restored.
- **Backups:**
  - D1: rely on D1 Time Travel for point-in-time recovery (retention depends on the Cloudflare plan — verify) **plus** a daily scheduled export (Wrangler/API export via Cron Trigger or an external job) copied to storage outside the production D1 database (AD-06).
  - R2: no automatic versioned backup is assumed; keep originals of tailor photos from the onboarding process, or replicate to a second bucket/provider on a schedule (AD-06).
  - Backups contain customer data; access-controlled and covered by the retention policy. **Restore must be drilled before launch** (AC-16).
- **Monitoring:** Cloudflare analytics/logs, an uptime check on the home page, error alerts for Worker exceptions.
- **Cost:** domain plus Cloudflare usage; whether the free or paid plans suffice depends on traffic, D1/R2 limits and backup choices, which must be checked against current Cloudflare pricing at decision time (AD-02). No figures are asserted here.

## 13. Trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Workers + D1 + R2 | No servers to patch; global edge; small bill at low scale; one vendor | Vendor lock-in; Workers CPU/memory limits; no native image processing; Node-only libraries may not run |
| D1 (SQLite-based) | Simple relational model, managed | Limited size/throughput vs managed Postgres; backup/export needs deliberate setup |
| Client-side image resizing | No image service cost | Depends on admin's browser; less control than server-side |
| RBAC with fixed roles | Least privilege for helpers; small code | More to build/test than one admin; roles may need adjusting |
| Manual forwarding/status | Fits tailor reality, no integrations | Admin effort grows with volume |
| WhatsApp links only | Free, works for any tailor | No delivery tracking; direct contacts not attributable |
| Tetum gated until reviewed | Production launches English-only until a native speaker has reviewed the Tetum text | `PUBLIC_LANGUAGES` switch (NFR-I18N-01) |

## 14. Future extension points

Language routing and translated content; tailor notifications via WhatsApp Business API behind `notify`; tailor self-service (new identity type in `auth`); verified reviews tied to completed referrals; custom RBAC editor; Postgres or another store behind `db`; Cloudflare Queues for notifications if volume demands; CSV export; booking/payments only after demand is proven.

## 15. Decisions to resolve before implementation

| ID | Decision | Default if unanswered |
|---|---|---|
| AD-01 | Confirm Astro 7.4 availability and the adapter/Wrangler versions that support it | **Resolved 2026-10-18**, see DECISIONS.md |
| AD-02 | Cloudflare plan, budget, and a check of free-tier limits against expected use | **Owner chose Workers Paid (2026-10-19)**; measure on the deployed Worker in Phase 8 |
| AD-03 | Password-hashing method that fits Worker CPU limits | **Owner chose WebCrypto PBKDF2 (2026-10-18)**; iteration count benchmarked in Phase 2 |
| AD-04 | R2 vs another image store; public delivery via Worker route vs R2 custom domain; client-side resizing vs Cloudflare Images | **Resolved 2026-10-19**: R2, Worker `/media` route, client-side resizing |
| AD-05 | Owner notification channel and sender (OQ-06) | Webhook (ntfy, Slack or Discord), pending owner confirmation |
| AD-06 | Backup destination outside Cloudflare, frequency and retention | Daily D1 export + R2 replication, owner-approved destination (decided 2026-10-18, see DECISIONS.md) |
| AD-07 | Image count/size limits | **Resolved 2026-10-19**: 10 photos per tailor, 8 MB per original |
| AD-08 | Domain, DNS and email-sending setup | Owner to supply |
| AD-09 | Launch language(s) (OQ-07) | **Resolved 2026-10-19**: English and Tetum; Tetum gated by `PUBLIC_LANGUAGES` until native-speaker review |
| AD-10 | Phone input rules for Timor-Leste | **Resolved 2026-10-19**: `+670` + 8 digits (mobile 7, landline 3); local and `+670` forms accepted, stored E.164 |
| AD-11 | Role set and who gets which role (OQ-15) | **Resolved 2026-10-18**: owner, manager, editor, viewer as in §6; one owner account at launch |
| AD-12 | Whether Cloudflare Access is added in front of `/admin` | No in MVP; revisit |
