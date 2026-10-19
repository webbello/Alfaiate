# Tasks: Phase 7c

- [ ] **Carried over: Phase 7b T9 sign-off** (owner click-through with demo data, then tick T9 and move its entry to DECISIONS). Not a build task.

- [ ] **T1 Art direction, tokens and font**
  - Acceptance: `docs/ART_DIRECTION.md` (palette, type scale, spacing, motifs, motion rules, copy rules); new colour tokens in `site.css`; two OFL serif candidates shown to the owner with measured subset sizes, owner picks; the chosen WOFF2 and its licence committed under `public/fonts/`; display headings use it with `font-display: swap` and a metric-matched fallback; body stays on the system sans.
  - Verify: a test computes every text/background token pair (WCAG AA); integration test that the font is served from our own origin, has a licence file next to it and is under the size cap; CSP and no-third-party tests unchanged; specimen screenshots shown.
  - Files: `docs/ART_DIRECTION.md`, `src/styles/site.css`, `public/fonts/*`, tests

- [ ] **T2 Layout shell**
  - Acceptance: redesigned header and footer; sticky mobile bar with "Ask for a tailor" (and a WhatsApp link only when the owner has set the number); skip link and focus order kept; bar never covers form fields or focus.
  - Verify: integration tests for landmarks, one `<nav>` per purpose, bar absent on the request page, WhatsApp link absent without config; axe and 320 px reflow; screenshots.
  - Files: `src/layouts/PublicLayout.astro`, `src/styles/site.css`, `src/i18n/public/*`, tests

- [ ] **T3 Home hero with 3D swatch**
  - Acceptance: hero headline, subline, primary and secondary calls to action, CSS 3D folded swatch with a drawing stitch line; decorative parts `aria-hidden`; motion only under `prefers-reduced-motion: no-preference`.
  - Verify: integration test for one `<h1>` and both links; e2e with reduced motion (computed style shows no animation and no 3D transform); axe; perf measured; screenshots to the owner.
  - Files: `src/pages/index.astro`, `src/components/story/Swatch3D.astro`, `src/components/story/Stitch.astro`, `src/styles/story.css`, tests

- [ ] **T4 Story sections**
  - Acceptance: promise, how it works as pattern pieces, craft with the tape measure and five labelled points (focusable, one-line explanations, illustrative only, no measurement input), garments grid as tilting swatches, local story (REVIEW placeholder text), trust section with no invented numbers or proof, final call with the request's first step, "Are you a tailor?" banner.
  - Verify: tests that the page has no digits claiming counts or ratings, no `<input>` in the tape measure, every point reachable by keyboard; story CSS loaded only on pages that use it; axe, reflow, text spacing; screenshots to the owner.
  - Files: `src/pages/index.astro`, `src/components/story/*`, `src/styles/story.css`, `src/i18n/public/*`, tests

- [ ] **T5 Directory, category and profile**
  - Acceptance: editorial cards and profile layout; illustrated swatch when there is no permitted photo; photo slots use only permitted, visible images; "supplied by the tailor" labels kept (BR-11); filters and tap counter unchanged.
  - Verify: existing directory, profile, privacy and image-permission tests unchanged and green; new tests that no photo shows without permission and no stock image exists; axe both languages; screenshots.
  - Files: `src/pages/tailors/**`, `src/pages/categories/**`, `src/components/TailorCard.astro`, `src/styles/*.css`, tests

- [ ] **T6 Two-step request**
  - Acceptance: step 1 (what and where: category and area as large chips, optional detail), step 2 (name, number, channel, consent); one form, one submit, works without JavaScript; optional enhancement shows progress; server rules, honeypot, token, rate limit, consent text and stored fields unchanged; preselected tailor kept; thanks page keeps reference code.
  - Verify: all Phase 5 request tests unchanged and green; e2e no-JavaScript submit; keyboard path; error summary still focused and labelled; measured taps/fields noted; screenshots.
  - Files: `src/pages/request.astro`, `src/pages/request/thanks.astro`, `src/components/**`, `src/styles/site.css`, tests

- [ ] **T7 Tailor interest form `/join`**
  - Acceptance: PRD note (new FR-JOIN-*) and `DATA_MODEL.md` updated; migration `0003_tailor_interest.sql`; module `src/modules/interest/` with validation, honeypot, fill-time token, rate limit, Origin check, consent, anonymise; `/join` and `/tet/join` plus thanks; admin list `/admin/interest` (permission `tailor.edit`) added to `ADMIN_ROUTES`; creates no tailor, no profile, nothing public; no URL, sitemap or analytics exposure.
  - Verify: unit tests per rule (consent required, honeypot, rate limit, anonymise); test that submitting creates no `tailor` row; AC-09 matrix and route inventory updated; contract test baseline updated on purpose; public-pages scope guard updated; mutation checks on consent and the permission; axe; screenshots.
  - Files: `docs/PRD.md`, `docs/DATA_MODEL.md`, `migrations/0003_tailor_interest.sql`, `src/modules/interest/*`, `src/pages/join.astro`, `src/pages/tet/join.astro`, `src/pages/admin/interest.astro`, tests

- [ ] **T8 Static pages, 404 and Tetum parity**
  - Acceptance: about, how it works, privacy, terms and 404 restyled to the new type scale (text unchanged); every new public string in the dictionary with Tetum parity (Tetum text marked for review, language still gated).
  - Verify: dictionary parity tests; privacy/terms text byte-identical in the integration test; axe both languages.
  - Files: `src/pages/*.astro`, `src/pages/tet/**`, `src/i18n/public/*`, tests

- [ ] **T9 Motion, accessibility, performance and budgets**
  - Acceptance: reduced-motion removes all animation and flattens 3D; no-JavaScript run passes; new pages added to axe, CSP, reflow and text-spacing specs; `npm run perf` before and after recorded; byte budgets set from measurements plus about 20% and enforced (spec numbers are placeholders until measured).
  - Verify: `npm run check`, `npm run test:e2e`, `npm run perf`; a removed `aria-hidden` on a decorative piece and an added inline style were each seen failing and reverted.
  - Files: `e2e/*.spec.ts`, `tests/integration/budgets.test.ts`, `docs/IMPLEMENTATION_PLAN.md`

- [ ] **T10 Docs, reviewers, security audit, fresh clone, owner sign-off**
  - Acceptance: README, STATUS, DECISIONS, ARCHITECTURE, ART_DIRECTION, SPEC deviations and AGENTS lessons updated; privacy-scope, docs-sync and security reviewers run with no unresolved blockers; owner has seen screenshots at phone and desktop and signed off, with what was not checked (real devices, Safari, Firefox, screen readers) recorded.
  - Verify: `npm ci && npm run check` from a fresh clone, `npm run test:e2e`, `npm run perf`; `git ls-files` shows no secrets, databases or uploads.
  - Files: `docs/*`, `README.md`, `AGENTS.md`
