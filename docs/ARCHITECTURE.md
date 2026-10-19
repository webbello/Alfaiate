# Alfaiate TL — Architecture

Status: Draft v0.3 · 2026-10-18 · Requirements: [PRD.md](PRD.md) · Data: [DATA_MODEL.md](DATA_MODEL.md) · Plan: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)

**Owner-selected stack (confirmed 2026-10-16):** Astro 7.4, Cloudflare Workers, Cloudflare D1, Cloudflare R2 (or another image store), and a custom admin interface with role-based access control (RBAC). Everything else below is **proposed** unless marked confirmed. Phases 1–2 are implemented (project skeleton; database schema; admin sign-in, sessions and RBAC); all tailor, directory, enquiry and referral features are unimplemented.

## 1. Existing repository assessment

Inspected 2026-10-16 at `/Users/apple/Sites/AlfaiateTL`: empty directory, no conventions. **Phase 1 completed 2026-10-18** (verified on npm and by running `npm run check`): npm; Astro 7.4.0 with `@astrojs/cloudflare` 14.4.0 and Wrangler 4.151.1 (exact pins); TypeScript 6.0.3 (7.x unsupported by `@astrojs/check` and `typescript-eslint` peers); ESLint 10 + Prettier 3; Vitest 4.1.12 from Phase 2 (see DECISIONS.md) with three projects. Node >= 22.22.0. Toolchain decisions are in [DECISIONS.md](DECISIONS.md); the check command is `npm run check`.

## 2. Stack

| Concern | Choice | Status | Notes |
|---|---|---|---|
| Web framework | **Astro 7.4.0**, TypeScript 6.0.3 | Confirmed by owner; AD-01 resolved 2026-10-18 | Astro 7.4.0 + `@astrojs/cloudflare` 14.4.0 + Wrangler 4.151.1, exact pins. TypeScript 7 is unsupported by `@astrojs/check` and `typescript-eslint` peers (DECISIONS.md). |
| Runtime | **Cloudflare Workers** via the Astro Cloudflare adapter | Confirmed | One Worker serves public pages, form handlers, media delivery and the admin. Mostly server-rendered; static prerendering is used where content is stable and no per-request data is needed. |
| Database | **Cloudflare D1** | Confirmed | All structured data (see DATA_MODEL). SQL migrations via the Wrangler migration tooling. |
| Image storage | **Cloudflare R2** | Confirmed, "or another image store" kept open (AD-04) | Separate from the database; D1 stores only keys and metadata. |
| Admin | Custom, server-rendered Astro pages under `/admin` with RBAC | Confirmed | No third-party admin framework or CMS. |
| Bot protection | Cloudflare Turnstile | Proposed | Privacy-friendly, no puzzle for most users; see §10. |
| Validation | Zod (or equivalent) | Proposed | One schema per form/endpoint. |
| Styling | Plain CSS with tokens | Proposed | Small payloads. |
| Tests | Vitest 4.1.12 with three projects (`container`: Astro components; `workers`: workerd + local D1/R2 via `@cloudflare/vitest-plugin`; `integration`: the built Worker with real HTTP requests); Playwright + axe in Phase 4/7 | Implemented (Phase 2) | `npm test` runs the first two; `npm run test:integration` builds, then runs the third; `npm run check` runs everything. |

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
| Public pages | Home, directory, categories, areas, profiles, request form, static pages, sitemap, robots |
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

## 4. Request and data flows

**Public browse.** Request → Worker → D1 query restricted to published tailors and permitted images → HTML. Public pages may use edge caching (cache API/CDN) with short TTLs and purge/expiry on publish changes; cache only responses containing no customer data. No enquiry table is read on public paths.

**Doorstep request.** Form POST → CSRF + honeypot + Turnstile verification + rate limit → Zod validation → D1 insert (status New, consent version/time, reference code) → owner notification (best-effort via `waitUntil`; failure logged, enquiry kept) → redirect to acknowledgement. Customer data never appears in URLs.

**Referral.** Admin picks enquiry → picks tailor → consent and approval checks → insert referral; owner forwards details outside the system and records time/method, response, completion, fee. Status changes are manual and write a log row. Multi-row changes use D1 batch statements so they commit together.

**Contact tap.** Optional beacon increments a daily aggregate; the link works if the beacon fails.

**Image upload.** Admin browser → Worker (authorised, validated) → R2 (see §8) → metadata row in D1.

## 5. Routes

Unchanged in intent from v0.1; language prefix is a future extension.

**Public:** `/`, `/tailors` (filters `category`, `area`, `home_visit`), `/tailors/[slug]`, `/categories/[slug]`, `/areas/[slug]` (optional), `/request` (`?tailor=slug`), `/request/thanks`, `/how-it-works`, `/about`, `/privacy`, `/terms`, `/sitemap.xml`, `/robots.txt`, `/media/*`, `POST /api/contact-click`.

**Admin (`/admin`, authenticated, `noindex`, no-store):** `/admin/login`, `/admin/logout`, `/admin` (dashboard), `/admin/account` (own password), `/admin/users/actions` (POST handler), `/admin/tailors`, `/admin/tailors/new`, `/admin/tailors/[id]`, `/admin/categories`, `/admin/areas`, `/admin/enquiries`, `/admin/enquiries/[id]`, `/admin/users` (owner only).

Each admin route and each mutating handler declares the permission it needs (§6).

## 6. Authentication, authorisation and RBAC

- Two zones: anonymous (public routes) and authenticated admin. No customer or tailor logins (PRD §7.3).
- **Sessions (implemented):** random 256-bit token in the `__Host-alfaiate_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`); only its SHA-256 is stored in D1 (`session`); 30 min idle and 12 h absolute expiry; a new session on every sign-in (the previous one is revoked); revocation on logout, password change and deactivation. Our own D1 sessions are used, not Astro sessions (disabled). CSRF: a token derived from the session token is required on every authenticated POST, plus Astro's origin check.
- **Passwords (implemented, AD-03):** WebCrypto PBKDF2-HMAC-SHA-256, parameters stored with each hash and upgraded at sign-in. The default iteration count (600000) is provisional and depends on the Cloudflare plan (AD-02): see DECISIONS.md. Sign-in is rate limited (5 attempts per IP — IPv6 counted per /64 — and 50 per email per 15 minutes; attempts are counted atomically before the password is checked and refunded on success; D1 counters with hashed keys; changing your own password is limited the same way) and all failures look identical.
- **Optional extra layer:** Cloudflare Access in front of `/admin` can be added later without code changes to the app's own checks (defence in depth, not a substitute).
- **Account creation:** by an `owner` inside `/admin/users`, or by `npm run owner:create` for the first owner (local D1 by default; password typed without echo). `npm run owner:reset` recovers a forgotten password. No public sign-up.

### Roles and permissions (confirmed by owner 2026-10-18, OQ-15)

Permission-based checks (`can(role, 'tailor.publish')`), with roles as fixed bundles defined in code. Roles are stored per user; a user has exactly one role in the MVP. No custom role editor.

| Permission | owner | manager | editor | viewer |
|---|:-:|:-:|:-:|:-:|
| View dashboard counts | ✔ | ✔ | ✔ | ✔ |
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
| Owner notification | Adapter in `notify`. Options: an email-sending service reachable from Workers via HTTPS, or a Cloudflare email feature — to be chosen (OQ-06, AD-05). Optional; the app works without it. The message contains only the reference code and a link to the admin enquiry page — never the customer's name, phone or notes (SEC-05). |
| Turnstile | Server-side token verification call from the Worker. |
| Maps | None in MVP. |
| Analytics | Aggregate counts in D1 (contact taps, form funnel) and/or Cloudflare's cookieless web analytics; no personal data (PRV-05). |

## 8. Image storage and upload

- **Separation:** images live in R2; D1 holds `file_key`, alt text, order, permission and visibility only. Database size is unaffected by images.
- **Buckets:** one public-serving location for permitted portfolio variants (served via the Worker's `/media` route or an R2 custom domain — AD-04), and one **private** bucket for anything that must not be public (optional customer reference images, FR-ENQ-07), read only through an authorised admin handler.
- **Processing:** the Worker runtime has no native image library. Proposed approach: the admin browser resizes and re-encodes (canvas) into a small set of widths (e.g. thumbnail/medium/large) and uploads the variants; the Worker validates size, sniffed content type and dimensions, and writes with generated keys. Alternative: Cloudflare Images/image transformations (may add cost; verify plan) (AD-04). EXIF is stripped by the canvas re-encode; the Worker rejects files that still contain it **[verify in Phase 3]**.
- **Permission:** unpermitted images are not written to the public location; withdrawing permission deletes public variants.
- **Limits:** per-file size, count per tailor and allowed types are config values set in Phase 3.
- **Delivery:** long-lived immutable cache headers (keys are content-unique); responsive `srcset`.
- **Switching store:** all access goes through the `media` module, so moving off R2 touches one module.

## 9. Validation and error handling

- Server-side Zod validation for every form/endpoint; client checks are convenience only.
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
| Admin headers | `noindex`, `Cache-Control: no-store` | SEC-06 |
| Spam control | Honeypot, minimum-time check, Turnstile, rate limit (Cloudflare rate limiting rule or counter in D1) | SEC-07 |
| Security headers | CSP, nosniff, frame-ancestors, Referrer-Policy, HSTS, X-Frame-Options; applied by middleware to server-rendered responses (static `/_astro/*` assets get cache headers only, DECISIONS T11) | SEC-08 |
| Consent record | Version and timestamp on enquiry | PRV-03 |
| Retention/anonymisation | Owner-only action, scheduled purge optional (Cron Trigger) | PRV-04 |
| Audit | Phase 2 writes login, login_failed, logout, user_created, role_changed, user_deactivated, user_reactivated, password_changed; publishing and status changes arrive in Phases 3 and 5 | SEC-09 |

Cloudflare processes customer data in transit and at rest in D1/R2; the privacy notice must reflect this and data-location questions go to OQ-08.

## 11. SEO and performance

- Server-rendered or prerendered HTML; one `<h1>`; unique title/description/canonical per tailor and category; Open Graph image from the profile photo.
- Structured data: `Organization`/`WebSite` on home; `LocalBusiness` on profiles for published facts only; no rating/review markup (BR-11).
- Sitemap from published content only; `robots.txt` blocks `/admin` and `/api`; filter-parameter pages canonicalised or `noindex,follow`.
- Edge caching of public HTML and media; responsive images with explicit dimensions and lazy loading; system fonts or one self-hosted subset; minimal client JS (Astro islands only where needed).
- Budgets are set in Phase 7 from measurements on a throttled mobile profile, including a check of latency from Dili; none are asserted here.

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
| Single language first | Faster | Mitigated by NFR-I18N-01 |

## 14. Future extension points

Language routing and translated content; tailor notifications via WhatsApp Business API behind `notify`; tailor self-service (new identity type in `auth`); verified reviews tied to completed referrals; custom RBAC editor; Postgres or another store behind `db`; Cloudflare Queues for notifications if volume demands; CSV export; booking/payments only after demand is proven.

## 15. Decisions to resolve before implementation

| ID | Decision | Default if unanswered |
|---|---|---|
| AD-01 | Confirm Astro 7.4 availability and the adapter/Wrangler versions that support it | **Resolved 2026-10-18**, see DECISIONS.md |
| AD-02 | Cloudflare plan, budget, and a check of free-tier limits against expected use | **Owner chose Workers Paid (2026-10-19)**; measure on the deployed Worker in Phase 8 |
| AD-03 | Password-hashing method that fits Worker CPU limits | **Owner chose WebCrypto PBKDF2 (2026-10-18)**; iteration count benchmarked in Phase 2 |
| AD-04 | R2 vs another image store; public delivery via Worker route vs R2 custom domain; client-side resizing vs Cloudflare Images | R2, Worker route, client-side resizing |
| AD-05 | Owner notification channel and sender (OQ-06) | Email |
| AD-06 | Backup destination outside Cloudflare, frequency and retention | Daily D1 export + R2 replication, owner-approved destination (decided 2026-10-18, see DECISIONS.md) |
| AD-07 | Image count/size limits | Set in Phase 3 |
| AD-08 | Domain, DNS and email-sending setup | Owner to supply |
| AD-09 | Launch language(s) (OQ-07) | Single language, i18n-ready |
| AD-10 | Phone input rules for Timor-Leste | **Resolved 2026-10-19**: `+670` + 8 digits (mobile 7, landline 3); local and `+670` forms accepted, stored E.164 |
| AD-11 | Role set and who gets which role (OQ-15) | **Resolved 2026-10-18**: owner, manager, editor, viewer as in §6; one owner account at launch |
| AD-12 | Whether Cloudflare Access is added in front of `/admin` | No in MVP; revisit |
