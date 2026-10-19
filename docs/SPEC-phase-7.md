# Spec: Phase 7 — SEO, accessibility, security, privacy and testing

Status: Approved 2026-10-19 (all six open-question defaults accepted) · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 7 · [PRD.md](PRD.md) NFR-PERF-01, NFR-A11Y-01, NFR-SEO-01, NFR-BRW-01, SEC-01–08, PRV-04/05, FR-PRO-07, FR-ADM-09, AC-15, AC-17 · [ARCHITECTURE.md](ARCHITECTURE.md) §10, §11 · open items carried from the Phase 3–6 audits in [DECISIONS.md](DECISIONS.md)

**Requirements:** NFR-PERF-01, NFR-A11Y-01, NFR-SEO-01, NFR-BRW-01, SEC-01–08, PRV-04, PRV-05, FR-PRO-07, FR-ADM-09 (anonymise only). **Acceptance:** AC-15 (full sweep), AC-17, AC-09 (re-run), AC-05 (staging rule); no unresolved high-severity security finding; performance numbers recorded.
**Owner answers for this phase** (2026-10-19, logged in DECISIONS.md): speed is measured with **Playwright and the DevTools protocol, no new dependency**; the **anonymise action is built now** and the **retention period stays open** (OQ-09); staging is kept out of search engines with a **`SITE_INDEXABLE` flag**.

**Scope check.** Six independent slices share one goal (verify and harden what exists): (A) search visibility (structured data, social tags, staging flag), (B) speed budgets, (C) accessibility, (D) security review and fixes, (E) privacy review and the enquiry anonymise action, (F) test expansion (no-JavaScript runs, repo checks). They can each be built, tested and committed alone. **Not in this phase:** deployment, real domain, backups or restore drills (Phase 8), a real notification sender, Turnstile, hard deletion of enquiries, automatic retention purge, new features of any kind.

## Assumptions

1. **No schema change.** Anonymising uses columns that already exist (`anonymised_at`, the CHECK that requires the personal columns to be NULL). `enquiry.delete` is the existing owner-only permission.
2. **Structured data (FR-PRO-07)** is JSON-LD in a `<script type="application/ld+json">` block. A data block is not executed, so the strict `script-src 'self'` policy stays unchanged; a test proves the CSP header is identical and the browser reports no violation. All values are JSON-encoded with `<`, `>` and `&` escaped so a tailor's text can never close the block.
3. **What the structured data contains:** the home page gets `WebSite` and `Organization` (name and URL only). A profile gets `LocalBusiness` with only what the page already shows publicly: name, canonical URL, description (the tailor's own words), address text and telephone **only when contact consent is recorded**, and the profile photo **only when permitted**. **Never** ratings, reviews, price ranges, opening hours, awards, credentials or any claim (BR-11); unpublished and unverified-claim content never appears. Unreviewed static pages and the request pages get no structured data.
4. **Social tags:** Open Graph `og:title`, `og:description`, `og:url`, `og:type`, `og:site_name` and, when a permitted profile photo exists, `og:image` (absolute URL under `SITE_URL`). No tracking pixels, no third-party scripts.
5. **`SITE_INDEXABLE`** is a Wrangler var: `"true"` allows indexing; anything else, including missing, means not indexable. Not indexable: `robots.txt` is `Disallow: /`, every page sends `noindex, nofollow` (header and meta), the sitemap is an empty `urlset`. Local default and staging: off; production: on. `SITE_URL` stays a placeholder until the domain is chosen (OQ-11/AD-08).
6. **Speed measurement (NFR-PERF-01):** one script, `npm run perf`, builds, starts the built Worker on a throwaway seeded database (the same runner as `test:e2e`), then drives Chromium through the DevTools protocol with a mid-range mobile profile (375 px wide, 4× CPU slowdown, slow-4G network: 1.6 Mbps down, 750 ms round trip), and records for the home page, directory, a category page, a profile and the request page: transfer bytes by type (HTML, CSS, JS, images, fonts), request count, DOMContentLoaded, load and Largest Contentful Paint, each as the median of five runs. The numbers are written into IMPLEMENTATION_PLAN.md Phase 7 and **budgets are set from them with about 20% headroom**; a test (`npm run check` side: byte budgets only, since they are stable; timing budgets are only in `npm run perf`) fails when HTML+CSS+JS bytes exceed the budget. Measurements are from a local machine, not from Dili: a check from Dili belongs in Phase 8 (stated in the plan).
7. **Image budgets** are checked from the rules that already exist (three widths 320/800/1600, a JPEG-only strict validator and size caps), plus a test that profile and card images use `loading="lazy"`, explicit `srcset`/`sizes`, and an `alt`. Real photos are not in the test data, so image bytes come from the caps, not from measurement.
8. **Accessibility target is WCAG 2.2 AA (NFR-A11Y-01).** Automated: axe with `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` tags on every public page type in both languages, the request form (clean and error states), and the admin pages (every list and detail page, as the throwaway owner). Manual, done by me in a real browser and **recorded in DECISIONS.md with what was and was not checked**: keyboard-only path through browse, profile, request and the admin referral form; visible focus; 200% zoom and 320 CSS px reflow without sideways scrolling; text-spacing override; contrast spot checks of the colour tokens (the CSS file already states expected ratios); reduced-motion; target sizes. Screen readers (VoiceOver/NVDA) and real devices are **not** tested by me and are listed as not done.
9. **No-JavaScript run (NFR-BRW-01):** Playwright with JavaScript disabled completes browse → profile (links present), and the full request form submission (the form's only dependency is plain POST).
10. **Security review** follows a written checklist: headers on every response class (public HTML, API, media, admin, errors, redirects), cookie attributes, session lifetime and logout, CSRF on every state change, origin checks on public POSTs, rate limits (login, form, tap counter), upload hardening, error pages leaking nothing, dependency audit (`npm audit`, high and critical must be zero or justified in writing), secret hygiene (a repo check). The carried-over audit items are triaged one by one: **fixed in this phase** — public queries also require `permission_recorded = 1` (defence in depth for BR-06), a malformed stored phone number must not break a profile page (the button is left out), the missing-Origin 403 on `/request` gets a friendly page, the sitemap gets an index when it passes 5,000 URLs, the e2e runner's temp-file cleanup is verified; **left for Phase 8 with an owner-visible note** — a Cloudflare rate-limiting rule on `POST /request` and `/api/contact-click`, confirming `cf-connecting-ip` in production, HSTS `includeSubDomains`/preload once the domain exists, real secrets with `wrangler secret put`.
11. **Repo check:** `npm run check:repo` (added to `npm run check`) uses `git ls-files` and fails if a tracked file looks like a secret, environment file, database, upload or photo (`.env*`, `.dev.vars`, `*.sqlite`, `*.db`, `uploads/`, image files outside an allow-list). It also scans tracked text for private key blocks and obvious token shapes.
12. **Privacy review (PRV-05, AC-15):** a written review in DECISIONS.md covering logs (every `console.*` in `src` must have constant arguments, enforced by a test over the whole tree, not just the enquiry code), analytics (cookieless aggregate counters only), cookies (no public page sets one), backups (what they contain, who can read them, that anonymising does not rewrite old backups: stated plainly for the privacy notice), third parties (none), and the data each admin role can see. The AC-15 sweep is extended to every public route, the 404 page, `/api/contact-click` responses, `robots.txt` and the sitemap, with a seeded customer, referral and fee record.
13. **Anonymise enquiry (PRV-04, FR-ADM-09, owner only):** a form on the enquiry page, visible to `enquiry.delete` (owner), that needs the reference code typed to confirm (irreversible). It runs in one batch: set the six personal columns to NULL (`customer_name`, `contact_number_e164`, `notes`, `service_description`, `area_text`, `preferred_datetime_text`) and `anonymised_at`; clear `fields_shared_note` and `closed_reason` on its referrals; delete its internal notes (they may quote the customer); write an `enquiry_anonymised` audit row with ids only. It keeps what reporting needs: status and status log, category, area, dates, referral rows and fee fields, source. It is not automatic, there is no retention timer, and no hard delete. An anonymised enquiry shows as such in the inbox, cannot be given a new referral (existing triggers), and its forwarding text is empty. The retention period (OQ-09) is **not decided here**; the privacy placeholder keeps saying so.
14. **Tests expanded** where Phases 2–6 left gaps: a no-JS suite, a CSP-violation watcher in e2e (fails on any console CSP error across all public pages), a header matrix test (every public route class), a cookie test (no `Set-Cookie` on any public page or API response), the whole-tree `console.*` constant check, and the AC-09 matrix (already covers new routes) re-run with the anonymise route added.
15. **Design:** no visual redesign; accessibility fixes change CSS or markup only where a check fails. Admin text stays English.

## Objective

A person finds the right tailor pages in a search engine with accurate titles, descriptions and structured data, the site loads quickly on a mid-range phone on slow mobile data with budgets that are measured and enforced, every public page and the admin pages meet WCAG 2.2 AA by automated and recorded manual checks, browsing and the request form work with JavaScript off, staging never gets indexed, nothing in the code, logs, cookies, caches or repository exposes customer data or secrets, and the owner can anonymise an enquiry on request. Done when AC-15 and AC-17 pass, the performance numbers and budgets are recorded, no high or critical dependency or security finding is open, and `npm run check` and `npm run test:e2e` pass.

## Tech stack

No new dependencies. Existing: Astro, D1, Playwright with `@axe-core/playwright` (axe 4.14 supports the 2.2 tags; confirmed before use), Wrangler, Vitest. One new Wrangler var, `SITE_INDEXABLE`, and two new npm scripts (`perf`, `check:repo`).

## Commands

```
Check:      npm run check          # lint + typecheck + repo check + workers tests + build + integration tests
Browser:    npm run test:e2e       # public and admin pages with axe (2.2 AA), CSP watcher, no-JavaScript runs
Speed:      npm run perf           # builds, serves on a throwaway database, measures on a throttled mobile profile and prints a table (the byte budgets are enforced by `tests/integration/budgets.test.ts` in `npm run check`)
Repo:       npm run check:repo     # tracked files must not include secrets, environments, databases, uploads or photos
Audit:      npm audit --omit=dev   # high and critical must be zero or justified in DECISIONS.md
```

## Project structure

```
src/modules/seo/jsonld.ts          builders for WebSite, Organization and LocalBusiness (public facts only, escaped)
src/modules/seo/head.ts            + Open Graph fields; src/layouts/PublicLayout.astro renders them and the JSON-LD block
src/modules/seo/indexable.ts       reads SITE_INDEXABLE; used by robots, sitemap, layout and headers
src/modules/enquiry/anonymise.ts   the anonymise batch and its rules
src/pages/admin/enquiries/[id]/anonymise.ts   POST, permission enquiry.delete
scripts/check-repo.mjs             the repository check
scripts/perf.mjs                   the measurement run (reuses e2e/run.mjs setup helpers)
e2e/                               + no-javascript.spec.ts, csp.spec.ts, wider axe lists, 200% zoom and reflow checks
tests/workers/, tests/integration/ + jsonld, indexable, anonymise, console-constants, header, cookie and cache matrix (`security-matrix.test.ts`), hardening tests
docs/IMPLEMENTATION_PLAN.md        measured numbers and budgets recorded under Phase 7
```

## Code style

As in earlier phases: explicit columns, bound parameters, discriminated-union results, tests that fail first, mutations seen failing before claiming them. Example of the shape:

```ts
export function localBusiness(profile: ProfileView, siteUrl: string): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: profile.name,
    url: `${siteUrl}/tailors/${profile.slug}`,
    ...(profile.contacts.phone && { telephone: profile.contacts.phone.value }), // only present when consent was recorded
  }; // no ratings, reviews, prices or claims (BR-11)
}
```

## Testing strategy

- **Workers/unit:** JSON-LD builders (only allowed keys; hostile text escaped so `</script>` and `<!--` cannot break out; no telephone without consent; no image without permission; nothing for unpublished), `SITE_INDEXABLE` parsing (only exactly `true` enables), robots/sitemap/header behaviour when off, anonymise rules (each column cleared, referral free text cleared, notes deleted, reporting fields kept, audit ids only, refused unless the reference matches, refused for non-owners, idempotent on an already anonymised enquiry), the whole-tree `console.*` check, byte-budget check.
- **Integration (built Worker):** every public route class sends the full security header set and no `Set-Cookie`; JSON-LD present and valid JSON on home and profile, absent elsewhere, CSP header unchanged; Open Graph tags; staging mode (`SITE_INDEXABLE` off) gives disallow-all robots, noindex everywhere and an empty sitemap, production mode the current behaviour; public queries exclude a published row without recorded permission; a profile with a malformed phone renders without the button; the anonymise route through the real handler (owner only, CSRF, confirmation); the extended AC-15 sweep.
- **Playwright (large, few):** axe 2.2 AA over all public page types in both languages and every admin page; CSP-violation watcher; no-JavaScript browse and request; 320 px reflow and 200% zoom; keyboard path through the anonymise form; `perf` run recorded.
- **Manual (recorded, not automated):** the items in assumption 8, listing what was not covered.
- **Mutation checks** on: indexable flag, JSON-LD allowed keys and escaping, consent/permission gates in the structured data, the public-query permission clause, the anonymise clear list, owner-only and confirmation rules, the header matrix, the repo check patterns.

## Boundaries

- **Always:** keep customer data out of everything public; keep the CSP strict; record measured numbers rather than asserting them; say plainly what was not checked (screen readers, real devices, Dili latency); keep fixes inside the review findings; run `npm run check` before each commit.
- **Ask first:** a new dependency, a migration, any CSP loosening, a retention period or automatic deletion, third-party scripts or services, new public pages.
- **Never:** add ratings, reviews, prices, hours or claims to structured data; index staging; relax a security header to make a test pass; commit secrets or photos; hard-delete or auto-purge enquiries; claim a manual check that was not done.

## Success criteria

1. **FR-PRO-07/NFR-SEO-01:** home and every profile carry valid, escaped JSON-LD with only public, permitted, consented facts; Open Graph tags present; unpublished and noindex pages carry neither; the CSP header is unchanged.
2. **AC-05 for staging:** with `SITE_INDEXABLE` off, robots disallows all, every page is noindex, the sitemap is empty; production behaviour is unchanged.
3. **NFR-PERF-01:** measured numbers for five page types are recorded in IMPLEMENTATION_PLAN.md with the method and its limits; byte budgets set with headroom and enforced by a test; images lazy, sized and alt-texted.
4. **AC-17/NFR-A11Y-01:** axe reports no violations (WCAG 2.2 AA tags) on all public page types in both languages, the request form in clean and error states, and every admin page; the manual checks are recorded with their gaps; the request form is completable by keyboard alone.
5. **NFR-BRW-01:** browse and the request form work with JavaScript disabled (Playwright).
6. **SEC-01–08:** the checklist is completed and recorded; the header matrix and cookie tests pass; `npm audit --omit=dev` shows no high or critical issue (or each is justified); the carried-over items are fixed or explicitly moved to Phase 8; the repo check passes in a fresh clone.
7. **AC-15/PRV-05:** the extended sweep finds no customer name, number, note or fee in any public page, API response, header, sitemap or robots; every `console.*` call in `src` has constant arguments; no public response sets a cookie; the privacy review is written down.
8. **PRV-04:** an owner can anonymise an enquiry; the personal data and referral free text are gone, reporting figures are unchanged, the action is audited without data and is refused for everyone else; the retention period remains an open owner decision.
9. `npm run check` and `npm run test:e2e` pass; the privacy-scope, docs-sync and security reviewers report no unresolved blockers; docs and STATUS are updated.

## Open questions

1. **Budgets from measurements** (assumption 6): about 20% headroom over the median of five runs, bytes enforced in `npm run check`, timings only reported by `npm run perf`. Default: as written.
2. **Structured data scope** (assumption 3): name, URL, description, address text, telephone with consent, permitted photo; nothing else. Default: as written.
3. **Anonymise also deletes the enquiry's internal notes** (assumption 13), because notes can quote the customer. Default: yes.
4. **`check:repo` joins `npm run check`** (assumption 11), so every commit proves no secrets or photos are tracked. Default: yes.
5. **Dependency audit rule** (assumption 10): zero high or critical in production dependencies, or a written justification; development-only findings are listed but do not block. Default: as written.
6. **Retention period (OQ-09) and the privacy and terms text (OQ-08)** are still yours to decide before launch; this phase builds the mechanism, not the policy.

## Deviations recorded during the build (see DECISIONS.md)

- The written security and privacy reviews are in `docs/SECURITY_PRIVACY_REVIEW.md`, not inside DECISIONS.md (a table cell cannot hold a checklist); DECISIONS links to it.
- A request post from another site is still refused by Astro's own cross-site check with its plain-text 403; only a post with no Origin gets the friendly page.
- `order_value_note` on referrals is also cleared when an enquiry is anonymised (free text that can name the customer).
- The byte budgets are enforced on uncompressed sizes in `npm run check`; compressed transfer sizes and timings are reported by `npm run perf` only.
- A third integration project, `integration-staging` (Tetum on, indexing off), was added next to `integration` and `integration-en`.
- Admin controls got a minimum height (44 px) after axe reported the WCAG 2.2 target-size rule on the admin role select.

