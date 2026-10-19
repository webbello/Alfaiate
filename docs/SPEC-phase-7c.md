# Spec: Phase 7c — Public site art direction and conversion

Status: Approved 2026-10-19 (all seven open-question defaults accepted); built T1-T9, T10 in progress · Not in the original [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): requested by the owner; inserted as Phase 7c between 7b and Phase 8 · Related: PRD §5, §7.3, BR-01..BR-11, FR-PUB-*, FR-DIR-*, FR-PRO-*, FR-ENQ-*, NFR-A11Y-01, NFR-PERF-01, NFR-I18N-01

**Owner answers (2026-10-19):** "fast enrollment" means both a faster customer request and a small tailor "Join us" interest form; imagery is both illustrated CSS/SVG art now and photo slots for later; one self-hosted subset display serif; Phase 7c before Phase 8.

## Why

The public site works and is accessible and light, but it is a plain, system-font page set. The owner wants it to feel like a custom-designed fashion-editorial product: craftsmanship, personal style, trust, local culture, and to move a visitor to a real lead (a request, or a tailor's interest) with as little effort as possible, on a slow phone in Dili.

## Honest tensions (decisions needed, stated up front)

1. **PRD §7.3 excludes tailor self-registration.** A "Join us" form is only an interest form: it stores a name, number, area and craft and creates **no account, no profile, no publication**. The owner still onboards offline (J4). It needs a PRD change (new FR-JOIN-*) and a small migration. It stays exempt from "public pages never show customer data": it shows nothing back.
2. **BR-06 and BR-11 forbid stock photos and invented claims.** No stock photography, no invented testimonials, ratings, prices, counts ("200+ tailors") or credentials. Imagery is illustrated (CSS/SVG) by us; real photos appear only where permission is recorded.
3. **Weight.** "Premium" is usually heavy. Dili connections are slow, so the work is bounded by budgets (below). Motion is CSS only.
4. **Measurements are illustration, not data.** The 3D tape-measure and body diagram are **explanatory only**; the site never collects body measurements (they are sensitive and agreed with the tailor directly, BR-02).
5. **Tetum.** All new copy is English first; Tetum stays gated by native-speaker review (OQ-07). New strings go through the public dictionary, never inline.

## Assumptions (correct me now)

1. Plain CSS in the existing external stylesheet; **no new JavaScript beyond a tiny optional progressive enhancement** (sticky call-to-action visibility and request-form step), strict CSP unchanged, no inline style or script. Animation is CSS (`transform`, `opacity`, `animation-timeline: view()` where supported, otherwise static). `prefers-reduced-motion: reduce` removes all motion and 3D transforms are flattened.
2. **3D is CSS 3D transforms** (perspective, `rotateX/Y`, `translateZ`, `preserve-3d`) on a few set pieces: a folded cloth swatch with stitched edge, a tape measure unrolling, a garment pattern "exploded" into pieces on scroll, a spool and needle. All are decorative (`aria-hidden`, empty alt), no content depends on them.
3. **One display serif**, self-hosted, subset to Latin plus Tetum diacritics (about 20-30 KB WOFF2, an open licence such as OFL, licence file committed), `font-display: swap`, preloaded only on the home page; body text stays on the system sans. The font file is a build input I will pick and show before use.
4. **Palette**: keep the warm paper and maroon (contrast verified) and add ink-black, a stitch-thread gold and a deep indigo for depth; every pair re-computed for WCAG AA (4.5:1 text, 3:1 large and UI). No colour-only signals.
5. **Art direction**: editorial magazine layout (oversized numerals, asymmetric grids, pull quotes, captions, rules and marginalia like pattern notches and grainlines), from the visual language of a tailor's atelier (chalk lines, pattern paper, basting stitches, tape marks) and Timorese textile culture (tais motifs as abstract geometric borders, drawn by us, respectful and non-literal; **owner to confirm the motif choice, OQ new**).
6. Existing routes, data, permissions and tracking are unchanged. The tap counter, consent text version and form security (honeypot, token, rate limit, Origin check) are kept as they are.
7. Story copy is written by me as draft and **marked for owner review**; it makes no factual claim the owner has not verified (BR-11).

## Objective

A first-time visitor on a phone understands in five seconds what this is (a trusted way to find a local tailor and ask for a quote), feels a crafted, trustworthy brand, and can send a request in under a minute or, as a tailor, register interest in under a minute. Success is judged by: owner approval of the look, a request sent in at most about 6 taps/fields, no accessibility or performance regression, and unchanged behaviour.

## Experience design

### Story spine (home page, one scroll, each section a concept)

| # | Section | Visual concept | Purpose |
|---|---|---|---|
| 1 | Hero | Large serif headline over a CSS 3D folded swatch with a basting-stitch line that draws itself; one primary button "Ask for a tailor" and a secondary "See tailors"; WhatsApp-first | Five-second clarity, first conversion |
| 2 | "Made for you" promise | Editorial two-column with oversized numeral and a pull quote about bespoke versus off-the-rack, no claims | Why custom |
| 3 | How it works | Four steps laid out as pattern pieces that assemble on scroll (CSS 3D, static when reduced motion): Tell us what you need, We introduce a tailor, Measure and agree, Collect | Remove doubt; sets BR-01/02 expectations plainly |
| 4 | The craft | A tape measure that unrolls across the page with labelled points (shoulder, chest, waist, inseam, sleeve) that highlight on hover/focus with one-line explanations; illustrative only | Tailor measurements storytelling; education |
| 5 | Featured tailors | Magazine "cards" with a large name, specialties, area and home-visit flag; real photo if permitted else an illustrated swatch; honest "supplied by the tailor" labels | Browse to profile |
| 6 | Garments | Category grid as fabric swatches that tilt in 3D on hover/focus | Entry points to categories |
| 7 | Local story | Short editorial about Dili's tailoring culture with tais-inspired border; owner-supplied text placeholder clearly marked | Local culture and trust |
| 8 | Trust | What we do and do not do (introduce, do not guarantee, tailor agrees price directly), privacy line, no invented numbers | Trust without fabricated proof |
| 9 | Final call | Closing full-width call with the request form's first step inline | Last conversion |
| 10 | "Are you a tailor?" | Quiet banner to the Join us page | Supply side |

Sticky bottom bar on mobile with "Ask for a tailor" and WhatsApp link (WhatsApp number is the owner's, OQ-06; hidden until set).

### Conversion flows

- **Customer request (faster):** the same required fields (name, number, channel, consent) plus optional detail, reorganised as a **two-step single page** (step 1: what and where with category and area as large tappable chips; step 2: your name and number with consent). It works fully without JavaScript (one page, one submit) and is enhanced to show progress when JS is on. Preselection from a tailor profile is kept. Success page keeps reference code and next steps.
- **Tailor "Join us" (new):** `/join` (and `/tet/join`): fields name, business name, phone or WhatsApp, area, what they make, optional message, consent to be contacted; same honeypot, fill-time token, rate limit and Origin check; stored as `tailor_interest` (new table, admin-only, anonymisable, never public); admin page lists them (permission `tailor.edit`). **No profile is created**; success page says the owner will call. Needs owner OK of the consent wording (OQ-08).
- Every page has one clear primary action; no more than one competing button per viewport.

### Pages in scope

Home (rebuilt), directory, category, profile (editorial profile layout, photo slots, honest facts), request (two-step), request thanks, how it works / about / privacy / terms (restyled to the new type scale, text unchanged), 404, `/join` and its thanks. Header and footer redesigned. Tetum versions follow.

## Tech stack

No new runtime dependency. One WOFF2 font file (build asset, licence recorded in `docs/` and `public/fonts/`), one small `site.js` (or extend existing) only for progressive enhancement, one migration (`0003_tailor_interest.sql`). CSS stays in an external file, split into `site.css` plus `story.css` loaded only on the pages that need it, to keep other pages light.

## Commands

```
Look:    npm run preview          # builds and serves at http://localhost:4322 (restart after a rebuild)
Check:   npm run check            # lint + typecheck + repo check + workers + build + integration
Browser: npm run test:e2e         # axe, CSP, no-JavaScript, reflow, journeys
Perf:    npm run perf             # page weight and timings on a throttled phone profile
```

## Project structure

```
src/styles/site.css, story.css         tokens, type scale, layout, 3D set pieces, motion
src/components/story/                  Swatch3D, TapeMeasure, PatternSteps, Stitch, PullQuote, TailorFeature (Astro, no JS)
src/pages/index.astro, join.astro, tet/**   rebuilt and new pages
src/modules/interest/                  validate and store tailor interest (mirrors the enquiry module)
migrations/0003_tailor_interest.sql    new table
src/pages/admin/interest.astro         admin list (tailor.edit)
public/fonts/                          the subset serif and its licence
docs/ART_DIRECTION.md                  palette, type scale, motifs, motion rules, copy rules
```

## Code style

Small, boring Astro components with props and text from the dictionary; CSS using custom properties, logical properties and `@supports` for new features:

```css
@media (prefers-reduced-motion: no-preference) {
  .swatch { transform: rotateX(18deg) rotateY(-24deg); animation: drape 9s ease-in-out infinite alternate; }
}
.stitch { stroke-dasharray: 6 8; animation: draw 1.6s ease-out both; }
```

## Testing strategy

- **Unit (workers):** interest validation and storage (consent required, honeypot, token, rate limit, anonymise); new dictionary keys exist in English, and Tetum parity test stays green; colour-pair contrast test over the new tokens.
- **Integration (built Worker):** every public page keeps its `<h1>`, landmarks, canonical, hreflang, JSON-LD and noindex rules; no customer data on any new page; `/join` posts and rejects as the request form does; no inline script or style; byte budgets (below); admin interest list is permission-gated and in the route inventory and AC-09 matrix; public-pages scope-guard list updated on purpose (lesson).
- **Playwright and axe:** WCAG 2.2 AA on every new or changed page in both languages, 320 px reflow and text-spacing, `prefers-reduced-motion` run (no animation, no 3D), no-JavaScript run (request and join still submit), keyboard path through the two-step form and the tape-measure points, CSP watcher clean.
- **Perf:** `npm run perf` before and after; LCP and weight recorded.
- **Manual (recorded):** owner reviews screenshots at phone and desktop after the hero, the story sections, the request flow and the profile; real Safari, Firefox and a low-end Android are listed as not checked unless the owner tests them.
- **Mutation checks:** consent required on `/join`, honeypot on `/join`, reduced-motion rule, budget test, permission on the interest list.

## Budgets (proposed, set from measurements plus about 20% as before; owner confirms)

Home HTML ≤ 9 KB, other pages ≤ their current budgets plus 25%, shared CSS ≤ 14 KB and story CSS ≤ 10 KB (uncompressed), font ≤ 30 KB, JS ≤ 1.5 KB, no image requests required for the first screen, LCP on the perf profile not worse than 2.5 s. Numbers are placeholders until the first build is measured; the spec is updated with the measured values before they are enforced.

## Boundaries

- **Always:** keep contrast AA and 44 px targets, visible focus, reduced-motion support, no-JS fallback; escape all text; keep every consent, privacy and tap-counter rule; show the owner screenshots before calling a slice done; write copy as draft for owner review.
- **Ask first:** any new dependency (including an animation or 3D library), any change to the data model beyond `tailor_interest`, any real photograph, any named motif from Timorese culture, any testimonial or number on the site, Tetum text.
- **Never:** stock photos, invented ratings, testimonials, prices, counts or credentials (BR-11); collect body measurements; create tailor accounts, profiles or publication from `/join`; autoplay sound or video; rely on 3D or animation to convey content; use colour as the only signal; weaken the CSP.

## Success criteria

1. Home tells the full story in the ten sections above, each with its visual concept, and passes axe, reflow and reduced-motion runs.
2. A request can be sent from the home page's final call or the request page in two steps without JavaScript, with unchanged server rules and the same stored data.
3. `/join` stores an interest record only; no account, profile or publication is created; the admin list is permission-gated and anonymisable.
4. No stock photos or unverifiable claims appear; real photos show only where permission is recorded (existing tests).
5. Budgets are met and the page remains fast on the throttled phone profile; the font is self-hosted with its licence recorded.
6. Motion and 3D are decorative: removing them (reduced motion, no CSS 3D support) leaves a complete, readable page.
7. All earlier tests pass (behaviour unchanged except the added join flow); `npm run check`, `npm run test:e2e` and `npm run perf` pass; reviewers (privacy-scope, docs-sync, security) report no unresolved blockers; docs updated; owner signs off after viewing it.

## Proposed task breakdown (finalised in the plan step after approval)

T1 art direction doc, tokens, type scale, font and palette contrast tests · T2 layout shell: header, footer, sticky bar · T3 home hero and swatch · T4 story sections (promise, how it works, craft/tape measure, local story, trust, final call) · T5 directory, category and profile restyle with photo slots · T6 two-step request and thanks · T7 `/join`, migration, module, admin list, RBAC tests · T8 static pages, 404, Tetum parity · T9 motion/reduced-motion/no-JS/axe/reflow/perf and budgets · T10 docs, reviewers, fresh clone, owner sign-off. Screenshots to the owner after T3, T4, T6 and T7.

## Deviations recorded during the build

- The request form's optional JavaScript progress indicator is not built: the two steps are static fieldsets in one form (works without JavaScript, nothing to enhance). Category and area are radio pills, "Not sure yet" included.
- No font preload: the font swaps in after first paint on every page, and the measured LCP did not move; preloading would add a request on the critical path.
- The "how it works" pieces use three steps (the existing copy), tilt-on-hover for garment swatches and static pattern pieces; scroll-driven assembly was not built (CSS-only motion is limited to the swatch drift, the running stitch and the hover tilt).
- The tape measure is native `<details>` (keyboard-operable, no script) rather than hover points on a drawn tape.
- The tailor invitation banner lives on the home page; the final-call section links to the request page rather than embedding its first step (the request page itself is two steps).
- Sticky bar is hidden on request and legal pages; WhatsApp in it needs `SITE_WHATSAPP` (OQ-06).
- Budgets are set from measurements after the build, as the spec said they would be. Budgets as enforced: see IMPLEMENTATION_PLAN.md Phase 7c (home HTML 7800, CSS 11000, home CSS 17600 including the story sheet, JS 400, join HTML 4600); the figures in this spec were placeholders.
- `/join` ships off by default (`JOIN_ENABLED` exactly `true` turns it on) because the consent wording and Privacy text are the owner's (OQ-08); the home invitation is hidden with it. `/admin/interest` needs `enquiry.view` (owner and manager), not `tailor.edit`, so editors do not see tailors' details.
- The spec names no callback promise: `/join` says "we will contact you" and promises no timing (OQ-05).

## Open questions

1. **Tais-inspired motifs:** is abstract geometric border work acceptable, and are there patterns or regional meanings to avoid or favour? Default: abstract geometry only, nothing named, you review before use.
2. **WhatsApp number for the sticky bar and hero (OQ-06).** Default: hidden until you supply it.
3. **Join-us consent wording and who calls back, and how fast (OQ-05/OQ-08).** Default: placeholder wording marked for your review, no timing promised.
4. **Local-story and "made for you" copy:** I draft, you rewrite or supply. Default: draft marked REVIEW; nothing launches unreviewed.
5. **Font choice:** I will propose two OFL serifs with a specimen and the measured size before committing. Default: you choose.
6. **Budgets** above are placeholders until measured; confirm the principle (budget = measured + ~20%, hard cap shown above).
7. **Where it fits:** insert as Phase 7c before Phase 8 (your answer). Default: yes.
