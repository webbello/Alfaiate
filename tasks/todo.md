# Tasks: Phase 4

- [ ] **T1 Language helpers and site configuration**
  - Acceptance: `PUBLIC_LANGUAGES` (default `en`; `en,tet` enables Tetum) and `SITE_URL` (placeholder) are typed configuration (`wrangler.jsonc` vars, `config` module, test override); `parsePath('/tet/tailors/x')` gives `{lang:'tet', rest:'/tailors/x'}`; `pathFor(lang, rest)` and `twinUrl` build the other language's URL; unknown or disabled languages are rejected.
  - Verify: unit tests fail first, including hostile paths (`/tet/../admin`, `//tet`, `/TET`), missing config falling back to English only and a bad `SITE_URL` failing closed; regenerate Worker types.
  - Files: `src/i18n/lang.ts`, `src/modules/config/index.ts`, `wrangler.jsonc`, `worker-configuration.d.ts`, `tests/workers/lang.test.ts`

- [ ] **T2 Dictionaries, public layout, styles, 404 and the Tetum gate**
  - Acceptance: typed English and Tetum dictionaries for the shared text (navigation, footer, disclaimer, request CTA, language names, 404, empty states) where `tet` must satisfy the same keys; `PublicLayout.astro` with skip link, landmarks, language switch (only when Tetum is enabled), canonical and `hreflang`, optional `noindex`; `site.css` (external) mobile-first with focus styles and 44 px targets; `404.astro` returning status 404 in both languages; middleware answers 404 for `/tet/*` when Tetum is disabled.
  - Verify: dictionary parity test (same keys, no empty values), integration tests for gate on/off, 404 status, no inline script or style, CSP intact, contrast checked by the later axe run; design skill consulted for the base styles.
  - Files: `src/i18n/public/en.ts`, `src/i18n/public/tet.ts`, `src/layouts/PublicLayout.astro`, `src/styles/site.css`, `src/pages/404.astro`, `src/middleware.ts`

- [ ] **T3 Contact links, price formatting, filter parsing (pure code)**
  - Acceptance: `telLink`, `whatsappLink` exactly `tel:+670…` and `https://wa.me/<digits>?text=<encoded>`; WhatsApp message built from the dictionary and the listing name only; `formatPriceRange(cents, cents)` gives "$20-$35.50" style text and is always paired with an "approximate" label by the caller; `parseDirectoryFilters(searchParams)` accepts only known shapes (slug pattern, `home_visit=1`) and drops everything else.
  - Verify: unit tests for AC-04 forms, encoding of names with quotes/ampersands/non-ASCII, cents rounding, hostile filter values.
  - Files: `src/modules/contact-links/tel.ts`, `src/modules/contact-links/whatsapp.ts`, `src/modules/directory/format.ts`, `src/modules/directory/filters.ts`, `tests/workers/contact-links.test.ts`

- [ ] **T4 Directory data module (explicit columns, view models)**
  - Acceptance: `listPublished(filters)`, `getPublishedBySlug(slug)`, `listActiveCategories()`, `listActiveAreas()`, `listPublishedForCategory(slug)` select named columns only; contacts and address only when `contact_publish_consent = 1`; photos only when permitted, visible and the tailor is published; profile photo only if eligible; verified marks computed from `verified_fields` and `price_source`; alphabetical, cap 200; filters bind values, never build SQL from them.
  - Verify: D1 tests: published only; consent gating; photo permission; each filter alone and combined (AC-02); inactive categories excluded; view-model key whitelist test (no private, fee, permission or note fields anywhere); mutation checks on published, consent and photo rules.
  - Files: `src/modules/directory/queries.ts`, `src/modules/directory/view.ts`, `tests/workers/directory.test.ts`, `tests/workers/directory-privacy.test.ts`

- [ ] **T5 Home page and request placeholder**
  - Acceptance: `/` and `/tet/` show explanation, disclaimer and request CTA first, then three "how it works" steps and category links; `/request` and `/tet/request` placeholder (no form, no data collected, links to the directory); shared views and thin wrapper pages; CTA target is `/request`.
  - Verify: integration for AC-01 (explanation, disclaimer, CTA appear before any later section in the markup) in both languages; no form element on the placeholder; scope-guard test updated with the new public routes.
  - Files: `src/views/Home.astro`, `src/views/RequestPlaceholder.astro`, `src/pages/index.astro`, `src/pages/request.astro`, `src/pages/tet/index.astro` (+ `tet/request.astro`), `tests/workers/public-pages.test.ts`, `tests/integration/home.test.ts`

- [ ] **T6 Directory and category pages**
  - Acceptance: `/tailors` with a GET filter form (category, area, home visits) that works without JavaScript; cards per FR-DIR-03; empty state with clear-filters and request CTA; `/categories/[slug]` lists published tailors of an active category, 404 otherwise; request CTA on both; both languages.
  - Verify: integration for AC-02 over real HTTP with seeded fake tailors (published/draft/unpublished, with and without consent and photos); hostile filter values do not break or leak; filtered URLs carry `noindex,follow` and canonical `/tailors`; no inline script or style.
  - Files: `src/views/Directory.astro`, `src/views/Category.astro`, `src/pages/tailors/index.astro`, `src/pages/categories/[slug].astro`, `tests/integration/directory.test.ts` (+ `tet/` wrappers)

- [ ] **T7 Tailor profile page**
  - Acceptance: `/tailors/[slug]`: only fields with data, no empty sections; approximate prices with confirmed date; areas and home-visit flag; languages only if verified; address and contacts only with consent; gallery with alt text and `srcset` over `/media`; verified marks and the "supplied by the tailor" line; separate WhatsApp and Call buttons with prefilled text; request CTA; 404 for unpublished or unknown slugs; both languages.
  - Verify: integration for AC-03, AC-04, AC-05; HTML sweep proving seeded private values (private phone, permission note, fee terms, internal notes) never appear on any public page so far; mutation checks on the verified label, approximate label and 404 rules.
  - Files: `src/views/Profile.astro`, `src/pages/tailors/[slug].astro`, `src/pages/tet/tailors/[slug].astro`, `tests/integration/profile.test.ts`, `tests/integration/public-privacy.test.ts`

- [ ] **T8 Static pages**
  - Acceptance: How it works, About (drafted from PRD facts, flagged for owner approval), Privacy and Terms (placeholders saying the text is pending, `noindex`); a `reviewed` flag per page controls `noindex` and sitemap inclusion; both languages.
  - Verify: integration: all four pages render with status 200 and the right robots meta; placeholder pages contain no invented legal wording; content never claims availability, quality or timing guarantees (BR-04).
  - Files: `src/views/StaticPage.astro`, `src/modules/seo/pages.ts`, `src/pages/how-it-works.astro`, `src/pages/about.astro`, `src/pages/privacy.astro` (+ `terms.astro`, `tet/` wrappers), `tests/integration/static-pages.test.ts`

- [ ] **T9 Sitemap, robots and canonical rules**
  - Acceptance: `/sitemap.xml` lists home, directory, active categories, published tailors and reviewed static pages with `hreflang` alternates (Tetum only when enabled); `/robots.txt` disallows `/admin` and `/api` and names the sitemap; every public page has a canonical from `SITE_URL`.
  - Verify: unit tests for the builders; integration: unpublished tailor absent from sitemap (AC-05), placeholder pages absent, unknown values escaped in XML.
  - Files: `src/modules/seo/sitemap.ts`, `src/modules/seo/robots.ts`, `src/pages/sitemap.xml.ts`, `src/pages/robots.txt.ts`, `tests/workers/seo.test.ts`, `tests/integration/seo.test.ts`

- [ ] **T10 Contact tap counter**
  - Acceptance: `POST /api/contact-click` (JSON `{slug, channel}`) increments `contact_click_daily` for a published tailor that shows that channel; same-origin only; per-address hashed rate limit; answers 204, 400 or 429; stores nothing personal; `src/scripts/contact-click.ts` sends a beacon from links marked `data-contact-channel` and never blocks navigation.
  - Verify: unit/D1 tests for counting and refusals (unpublished, wrong channel, no consent, other origin, oversized body, rate limit); integration end to end; mutation checks on origin and published rules; script loads as an external file.
  - Files: `src/modules/analytics/contact-click.ts`, `src/pages/api/contact-click.ts`, `src/scripts/contact-click.ts`, `tests/workers/contact-click.test.ts`, `tests/integration/contact-click.test.ts`

- [ ] **T11 Playwright and axe**
  - Acceptance: after a feasibility spike, `npm run test:e2e` builds, starts the built Worker on a temporary seeded local database, runs Playwright and stops it; mobile 375 px journey (AC-01 above the fold, browse, profile, WhatsApp and Call hrefs), keyboard path through filters, axe zero violations on home, directory, category, profile, request and static pages in English and Tetum.
  - Verify: the suite passes; a deliberately broken page (missing label or low contrast) makes it fail once, then is reverted; any fallback to the Astro dev server is recorded.
  - Files: `package.json`, `playwright.config.ts`, `e2e/seed.sql`, `e2e/run.mjs`, `e2e/journey.spec.ts`, `e2e/a11y.spec.ts`

- [ ] **T12 Docs, reviewers, security audit, fresh clone, manual look**
  - Acceptance: README, STATUS, DECISIONS, ARCHITECTURE §5 and §7, SPEC deviations updated; `privacy-scope-reviewer`, `docs-sync` and `security-auditor` run with no unresolved blockers; one manual look at phone size recorded; Tetum review gate and launch checklist item written down.
  - Verify: `npm ci && npm run check` from a fresh clone and `npm run test:e2e`; `git ls-files` has no secrets, databases or photos.
  - Files: `README.md`, `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` (lessons)
