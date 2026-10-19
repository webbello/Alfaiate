# Spec: Phase 4 — Public site: homepage, directory, categories and tailor profiles

Status: Draft for owner approval · 2026-10-19 · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 4 · [PRD.md](PRD.md) §6-7, 9, 12-13 · [ARCHITECTURE.md](ARCHITECTURE.md) §3-5, 7, 11

**Requirements:** FR-PUB-01/02/03/04/05/06, FR-DIR-01-04, FR-PRO-01-08 (FR-PRO-07's structured data is Phase 7, see assumption 9), ANA-01/02, NFR-SEO-01, NFR-A11Y-01 (baseline), NFR-I18N-01, NFR-BRW-01, BR-01/04/05/06/07/11. **Acceptance:** AC-01, AC-02, AC-03, AC-04, AC-05, and the public-site part of AC-15.
**Answers already given** (see [DECISIONS.md](DECISIONS.md)): OQ-07 languages = **English and Tetum**; analytics = own contact counters only; no area pages.

**Scope check.** This phase bundles a language layer, the public pages, a contact counter, SEO files and browser tests. They all serve one journey (find a tailor and contact them), the data layer is shared, and each slice is independently testable, so one spec with ordered slices S1-S8 is enough. **No enquiry form** (Phase 5), **no customer data anywhere**.

## Assumptions

1. **Public data comes only from one module** (`src/modules/directory`) that selects explicit columns (never `SELECT *`) and returns view models. Private fields (private contact, permission notes, fee terms, internal notes, verification internals) are not even selected. A test asserts the view models contain only the allowed keys.
2. **What is public, and when:** a tailor appears only if `is_published = 1` (which the database already ties to approval and recorded permission). Phone/WhatsApp and the shop address show only if `contact_publish_consent = 1` and the value exists. Photos show only if permission is recorded, visible, and the tailor is published (the `/media` route already enforces this). Prices show only if the tailor has supplied them, always labelled "approximate", with the confirmed date when recorded.
3. **Verified labelling (BR-11, FR-PRO-05):** a fact carries a "Verified by Alfaiate TL" mark only if it is in `verified_fields` (or a price with `price_source = 'verified'`). Everything else is presented as "Information supplied by the tailor". There are no ratings, stars, awards or "best" claims anywhere.
4. **Two languages, English at `/` and Tetum under `/tet/`.** All interface text lives in two typed dictionaries (the Tetum one must have exactly the same keys, enforced by the compiler). Content typed by the admin (tailor descriptions, category and area names) is shown as entered in both languages (see Open Question 5). Every page links to its twin in the other language, with `hreflang` alternates.
5. **Tetum safeguard.** I can write Tetum text but cannot judge its quality. The Tetum pages are built and tested, but the production setting `PUBLIC_LANGUAGES` stays `en` until you confirm a native speaker reviewed the Tetum strings; then it is set to `en,tet`. While Tetum is off, `/tet/...` returns 404 and no language switch is shown. Local development and tests turn both on.
6. **The request CTA needs a destination.** FR-PUB-03 requires a "Request a tailor at home" call to action on the homepage, directory and every profile, but the form is Phase 5. This phase adds a `/request` **placeholder** page (and `/tet/request`) that says the form is not open yet and links to the directory so people can contact tailors directly. It collects nothing. Phase 5 replaces it.
7. **Static pages:** "How it works" and "About" are drafted by me from PRD facts only (an introducer, not the tailoring provider, no guarantees) and need your approval. "Privacy" and "Terms" are **placeholders**: legal text is yours to supply (OQ-08), so they say so, are `noindex`, and stay out of the sitemap until you provide the text. Each page has a `reviewed` flag in code that controls this.
8. **Canonical URLs and the sitemap need the real domain**, which is undecided (OQ-11/AD-08). A `SITE_URL` setting (placeholder now) drives canonical links, `hreflang`, the sitemap and `robots.txt`; it is set for real in Phase 8. Filtered directory URLs (`?category=...`) are `noindex,follow` with the plain `/tailors` as canonical.
9. **Structured data (JSON-LD)** is scheduled in Phase 7 by the implementation plan; this phase provides titles, descriptions and canonical links only.
10. **Directory order is alphabetical by name** (no ranking or paid placement, so it is fair), with no pagination: at pilot size the list is short. A hard cap of 200 cards protects the page; a note appears if it is ever reached.
11. **Contact taps** are counted per tailor, per channel (WhatsApp or phone), per UTC day in `contact_click_daily` (already in the schema). No cookie, no IP stored, no visitor identity. They are intent signals, not confirmed contacts (M6). A beacon failing never blocks the link. Inflation by repeated taps is accepted but limited by a per-address rate limit using the existing hashed counters.
12. **Home visits:** the filter shows tailors with `home_visits = 'yes'`; `unknown` is never displayed as "no".
13. **No new database migration is planned.** Image aspect ratios are handled in CSS (fixed-ratio boxes with `object-fit: cover`), not by storing sizes.
14. **Design:** mobile-first, system fonts, one accent colour, large tap targets, strong contrast, no decorative images. No inline styles or scripts (the CSP stays strict). I will use the design skill during the build and you review it on staging. Not a brand design: the logo and brand assets (OQ-11) are not available yet, so the header uses the name as text.

## Objective

A customer in Dili, on a phone, can open the site, understand in one screen what it is and that it only introduces independent tailors, browse and filter published tailors, open a profile, and tap WhatsApp or Call, in English or Tetum, with nothing shown that the tailor has not permitted or that we have not verified or labelled. Done when AC-01 to AC-05 pass, the pages pass automated accessibility checks in both languages, `npm run check` is green and the reviewers report no blockers.

## Tech stack (additions; ask first)

- `@playwright/test` and `@axe-core/playwright` as dev dependencies (listed as Proposed in ARCHITECTURE §2) plus one downloaded Chromium build for browser tests. Needed for the plan's "mobile viewport browse → profile → link check" and "a11y scan on key pages". See Open Question 2.
- No runtime dependencies. Everything else uses what exists.

## Commands (added)

```
E2E + a11y:   npm run test:e2e        # builds, starts the built Worker on a temp local database with fake published tailors, runs Playwright, stops
Browsers:     npx playwright install chromium    # once, after install
Check:        npm run check           # unchanged (e2e is separate because it needs the browser download)
```

## Project structure

```
src/layouts/PublicLayout.astro     header (name, nav, language switch), footer (disclaimer, links), skip link, canonical/hreflang/noindex
src/styles/site.css                mobile-first styles (external file; no inline CSS)
src/i18n/public/en.ts, tet.ts      public text dictionaries (tet must satisfy typeof en); src/i18n/lang.ts path <-> language helpers
src/modules/directory/             queries.ts (explicit columns), view.ts (view models), filters.ts (parse/validate query)
src/modules/contact-links/         tel.ts, whatsapp.ts (existing phone.ts stays)
src/modules/analytics/             contact-click.ts (record a tap), rate limit via auth/rate-limit
src/modules/seo/                   sitemap.ts, robots.ts, meta helpers
src/views/                         shared page bodies: Home, Directory, Category, Profile, Static, Request placeholder
src/pages/                         index, tailors/index, tailors/[slug], categories/[slug], request, how-it-works, about, privacy, terms,
                                   sitemap.xml, robots.txt, api/contact-click, 404  (+ the same set under tet/ as thin wrappers)
src/scripts/contact-click.ts       sendBeacon on contact links (external file)
tests/workers/, tests/integration/, e2e/    as before; e2e/ is new (Playwright)
```

## Page behaviour

- **Home (`/`)**: one-sentence explanation, the introducer-not-provider disclaimer (FR-PUB-02), the request CTA (FR-PUB-03) and a link to the directory, all in the first content block on a 375 px screen (AC-01); then "how it works" in three short steps and a few category links.
- **Directory (`/tailors`)**: filters for category, area and "offers home visits" as a plain GET form that works without JavaScript; cards with name, photo (if permitted), main specialties, area, home-visit flag, price indication if supplied (FR-DIR-03); empty state offers clearing filters and the request page (FR-DIR-04); request CTA present.
- **Category (`/categories/[slug]`)**: published tailors offering that category; 404 for unknown or inactive categories (FR-PUB-04).
- **Profile (`/tailors/[slug]`)**: only fields with data are rendered, no empty sections (FR-PRO-02); description, specialties and approximate prices, areas, home-visit flag, languages only if verified, address and contact only with consent, gallery of permitted photos with alt text; each fact labelled verified or tailor-supplied (FR-PRO-05); separate WhatsApp and Call buttons shown only when that number exists and may be shown, the WhatsApp link prefilled with a message naming the listing and no customer data (FR-PRO-04); request CTA; unpublished or unknown slug returns 404 (FR-PRO-06).
- **Static pages**, **404**, **request placeholder**, **sitemap.xml**, **robots.txt** as in the assumptions.

## Code style

Same as earlier phases. Link builders are small pure functions, so AC-04 is a unit test:

```ts
// src/modules/contact-links/whatsapp.ts
export const whatsappLink = (e164: string, text: string) => `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
export const telLink = (e164: string) => `tel:${e164}`;
```

All user-visible strings come from the dictionaries; no literal sentences in pages.

## Testing strategy

- **Unit (small):** link builders (AC-04: exact `https://wa.me/<digits>?text=…` and `tel:+670…` forms, text encoding); language helpers (path ↔ language, twin URL); filter parsing (unknown values ignored, no injection into SQL); price formatting ("approximate", range, cents → dollars); sitemap and robots builders; dictionary parity (Tetum has every English key, no empty values, no key left identical to English except names and numbers).
- **D1 (workers project):** the directory module returns only published tailors; contact and address only with consent; photos only when permitted and visible; each filter alone and all combined narrow results correctly (AC-02); inactive categories excluded; private columns absent from every view model.
- **Integration (built Worker, real HTTP):** AC-01 (explanation, disclaimer and CTA before any later section in the markup, in both languages), AC-02, AC-03 (profile with missing optional data has no empty sections; prices labelled approximate; an unpermitted photo is absent), AC-04 (links present only when the number exists and may be shown), AC-05 (unpublished slug is 404 and absent from the sitemap); a sweep asserting no public HTML, sitemap or beacon response contains seeded private values (private phone, permission note, fee terms, internal notes) (AC-15 public part); Tetum off returns 404 for `/tet/...`; canonical, `hreflang` and `noindex` rules; contact-click endpoint accepts only published tailors and real channels, rejects other origins, rate limits, stores no personal data; no inline script or style on any public page; CSP and security headers intact; the 404 page returns status 404.
- **Browser (Playwright, `npm run test:e2e`):** at a 375 px phone viewport: home shows explanation + disclaimer + CTA without scrolling (AC-01), browse → open a profile → WhatsApp and Call hrefs correct (AC-04); keyboard-only path through the directory filters; axe scan with zero violations on home, directory, category, profile, request, static pages, in English and Tetum (AC-17 baseline).
- **Mutation checks** (break the rule, see the test fail) for: published filter, consent gating of contacts and address, photo permission, verified label rule, approximate label, 404 for unpublished, Tetum gate, click endpoint origin check.
- **Manual:** one look at the pages on a real phone or the browser pane at phone size, recorded in DECISIONS.md.

## Boundaries

- **Always:** select explicit columns for public data; render only data that is published, permitted and consented; label every fact verified or tailor-supplied; keep text in the dictionaries; keep scripts and styles external; fake data in tests.
- **Ask first:** any dependency beyond the two in Open Question 2; any schema migration (none planned); showing any field not listed under "Profile"; changing the language gate; changing the contact-counting rules.
- **Never:** show ratings, reviews, awards or unverified claims; show a private field or a customer detail; add accounts, booking, chat, payments or an enquiry form (Phase 5); store visitor identity (cookies, IPs, fingerprints); use third-party scripts, fonts or trackers; publish placeholder legal text as if it were real; decide an OQ-/AD- item silently.

## Success criteria

1. `npm ci && npm run check` passes from a clean clone (output seen), and `npm run test:e2e` passes locally.
2. **AC-01 to AC-05** pass in integration and browser tests, in English and in Tetum.
3. Nothing private or unpermitted can appear publicly: the view-model, the HTML sweep and the sitemap tests all pass, and each guarding rule has a mutation that makes a test fail.
4. Axe reports no violations on the pages listed above in both languages; the filters are usable by keyboard; the directory and profile work with JavaScript disabled (links and filters are plain HTML).
5. With `PUBLIC_LANGUAGES=en`, `/tet/*` is 404 and no language switch is shown; with `en,tet` both work. Production configuration keeps `en` until the Tetum review is confirmed.
6. Tap counting works end to end (a WhatsApp or Call tap increments the right row once, only for a published tailor with that channel) and leaves no personal data; the link works when the beacon fails.
7. `sitemap.xml` lists only published tailors, active categories and approved static pages with `hreflang` alternates; `robots.txt` blocks `/admin` and `/api`; unpublished tailors are in neither.
8. Reviewers (`privacy-scope-reviewer`, `docs-sync`, `security-auditor`) report no unresolved blockers; fixes and deferrals are recorded.

## Open questions

1. **Tetum review gate** (assumption 5): I draft the Tetum text; production shows Tetum only after you confirm a native speaker reviewed it. OK, and who will review?
2. **New dev dependencies** (Tech stack): `@playwright/test` and `@axe-core/playwright`, plus a Chromium download for tests. OK?
3. **`/request` placeholder** until Phase 5 (assumption 6). OK?
4. **Static pages** (assumption 7): I draft "How it works" and "About"; "Privacy" and "Terms" stay marked placeholders, `noindex`, outside the sitemap, until you supply the text (OQ-08). OK?
5. **Category and area names in Tetum:** the database holds one name per category/area, shown as entered in both languages. If you want separate Tetum names, I add translated name columns in a migration now. Which do you prefer: single name as entered (default), or Tetum names too?
6. **Directory:** alphabetical order, no pagination, cap of 200 (assumption 10). OK?
7. **Domain:** `SITE_URL` stays a placeholder until you choose a domain (OQ-11/AD-08). Fine for now?
