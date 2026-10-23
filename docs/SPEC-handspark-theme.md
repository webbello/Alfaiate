# Spec: Handspark theme as the public face of Alfaiate TL

Status: **Decisions approved 2026-10-23. Steps 1 and 2 done; step 3 (home) next.** · Requested 2026-10-23 by the owner · Branch `handspark-theme` · Touches PRD §7.3 (see Decisions) and AGENTS.md "no out-of-scope features"

## Objective

Make the Handspark Astro theme (ThemeNcode, v1.0.0, bought by the owner) the public face of the site, keeping **every** page and section it ships (home, about, shop, categories, products, cart, journal, gallery, FAQ, gift cards, personalize, contact, privacy, style guide, utility pages, SEO, RSS), then map each section to an Alfaiate TL feature. Where an Alfaiate feature has no matching section, build it in the theme's style. The admin, tailor portal, D1 data, requests and every privacy rule stay as they are.

Signature features the owner named: the **hero image trail** (pictures appear and swap as the mouse moves) and the **tape-measure ruler** along the bottom of the hero, which fits tailoring.

## Step 1: done

- The theme is copied unchanged into [handspark/](../handspark/README-ALFAIATE.md), a separate app with its own `package.json`. `npm run theme:install`, `theme:dev` (port 4331), `theme:build` (48 pages, builds in 11 s), `theme:preview`.
- Verified in a browser: the hero image trail works with the mouse, the ruler shows under the hero, the cart badge and header render.
- Its Freepik demo photos and videos are **not tracked in git** (licence: Freepik stock, not redistributable; `npm run check:repo` also forbids tracked photos). Code only is committed.
- Root lint, typecheck, formatter, tests and `check:repo` skip the folder. `npm run check` is still green on the branch (771 and 670 tests).

## Step 2: done (the shared frame is inside the real site)

- Added `tailwindcss`, `@tailwindcss/vite`, `gsap`, `lenis` (exact versions), Tailwind in the Vite config, `imageService: 'compile'` (pictures on built pages are resized at build time).
- `src/theme/` holds the theme's header (with a new EN | TET switch), footer, cart drawer, icons, styles and scripts; `src/layouts/ThemeLayout.astro` is the frame: our canonical and hreflang links, robots rules, social tags only on indexable pages, no inline style or script.
- Fonts: the Astro fonts component writes an inline `<style>`, which our policy forbids, so the fonts are plain `@font-face` rules in `src/theme/styles/fonts.css` with files in `public/fonts/theme/`. The `js` class script is an external file (`public/js-flag.js`).
- Tailwind scans only `src/theme/` (`source(none)` plus `@source "../"`), so page templates live in `src/theme/views/` and `src/pages/` has thin route files, as with the existing `src/views/`.
- Test page `/theme-preview` and `/tet/theme-preview` (noindex, not in the sitemap, removed in step 8) prove the frame: security headers, no inline style or script, same-origin assets, head, language switch, axe clean, no text clipped, no CSP violation, reflow.
- Vendor rules: `src/theme/` is skipped by lint and the formatter, `src/theme/scripts` by the Workers typecheck (they are browser code); the one console call was made constant (SEC-05).
- Checks: `npm run check` 771 and 676 tests, e2e 146.

## What the theme contains (all of it is to be kept)

- **Stack:** Astro 7.3, Tailwind CSS 4, GSAP (ScrollTrigger, SplitText), Lenis smooth scroll, MDX, RSS, sitemap, sharp; Node 22.12+; fully static (48 pages); content from Markdown and JSON collections (products, posts, categories, reviews, FAQs, gallery, team) with loaders for Contentful, Sanity, Strapi, WordPress and Shopify.
- **Pages:** `/` home, `/about/`, `/shop/` (paged), `/product-categories/[slug]/`, `/products/[slug]/`, `/blog/` (paged), `/blog/[slug]/`, `/blog-categories/[slug]/`, `/photo-gallery/` (lightbox), `/faq/`, `/gift-and-gift-card/`, `/personalize-your-gift/`, `/contact/`, `/privacy-policy/`, `/style-guide/`, `/instructions/`, `/licenses/`, `/changelog/`, `/external-link/`, `/404`, `/rss.xml`, `/robots.txt`, sitemap.
- **Home sections:** hero with image trail and ruler, company ("about us"), best sellers, our works, process, featured-in logos, reviews, blog.
- **Components:** header with mega "Pages" menu and cart badge, cart drawer (basket in the browser's local storage, no payment), footer with newsletter, SEO component (canonical, Open Graph, Twitter, JSON-LD for organisation, articles, breadcrumbs), tabs, accordion, carousel, lightbox, forms handler (contact, newsletter, personalize; posts to any form endpoint, otherwise shows a thank-you), motion layer (cursor parallax, image trail, prism cards, staircase, gift-card badge, button that follows the cursor), `prefers-reduced-motion` respected.
- **Tokens:** `src/styles/theme.css` (colours, type, spacing) retheme the whole site; the demo palette is green and cream.

## How each section could serve Alfaiate TL (proposal)

| Theme section | Alfaiate use |
|---|---|
| Hero (image trail + ruler) | Home hero: trail of tailors' permitted work photos; ruler stays (tape measure). Two buttons: Find a Tailor, Request a Tailor |
| Company / About | Our story, how Alfaiate TL works, trust rules |
| Best sellers (product cards) | Featured tailors (card, WhatsApp, View profile) |
| Shop, categories, product page | Tailor directory, garment types, tailor profile (prices, work, contact). Open question: are products tailors or garment services (see Decisions) |
| Add to Cart / cart drawer | A **request list**: add tailors or services, then send one request (opens the request form). No payment |
| Our works / Photo gallery | Tailors' work photos (only photos with recorded permission) |
| Process | The three steps: you ask, we pass it on, the tailor contacts you |
| Featured-in logos | Partners and press (hidden until real) |
| Reviews | Owner-approved testimonials only (BR-06) |
| Blog / journal | Tailoring tips and news (new content; Markdown or from D1) |
| Gift cards | Group and business orders (uniforms, weddings) or a gift-a-tailoring idea; decide later |
| Personalize your gift | The request-a-tailor form (our request flow, spam controls, consent) |
| Contact, FAQ, Privacy | Same pages, our text |
| Style guide, instructions, licences, changelog | Kept, marked `noindex`, linked only from the footer in non-production |
| Language | New: Tetun twin of every page (the theme has none) |

## Constraints found (each needs a fix, none blocks)

1. **CSP.** Our site sends `script-src 'self'; style-src 'self'`. The theme has one inline script (adds the `js` class) and JSON-LD blocks (data only, allowed). The inline script moves to an external file. GSAP and Lenis set styles through the browser's style API, which the policy allows; to be proven by the CSP e2e test.
2. **Static versus our server.** The theme is fully prerendered; our directory, profiles, request and admin read D1 on each request. Theme pages that need live data (tailors, featured, directory) must render on the server or read from a build-time export; the rest can stay prerendered.
3. **Content source.** Replace Markdown products with D1-backed tailors through a loader (the theme already supports loaders). Journal articles can stay Markdown.
4. **Tests.** About 400 integration and browser tests read the current public markup, labels and fingerprints. They are rewritten page by page as each page moves; never deleted. Budgets (page weight) are re-set from measurements.
5. **Weight.** GSAP + Lenis + Tailwind add script and CSS; NFR-PERF budgets are re-measured, and motion stays off for reduced-motion and slow connections.
6. **Photos.** Demo images are placeholders only; real pages use permitted tailor photos or the owner's own photography.
7. **Licence.** The theme is licensed to the purchaser for their own project; keep the licence file; credit line in the footer is optional (set `credit: null`).
8. **PRD.** §7.3 excludes payments and carts. See Decisions.

## Plan (each step leaves the site working and tests green)

| Step | Work | Done when |
|---|---|---|
| 1 | Install beside the site (done) | `theme:build` passes, `npm run check` green |
| 2 | Shared shell: bring Tailwind, GSAP, Lenis, the layout, header (with language switch), footer, SEO component into the main app as `ThemeLayout`; external script for the `js` class; keep our security headers and hreflang | One test page renders in the theme with our CSP, axe clean |
| 3 | Home: hero (image trail, ruler), company, process, reviews, featured, blog sections on real content | Home replaced, home tests rewritten |
| 4 | Directory and profile as shop and product pages; the request list (cart) | `/tailors` and profiles replaced, request list sends one request |
| 5 | Request, join, contact, FAQ, about, privacy, terms pages | Forms keep every protection (consent, honeypot, token, rate limit) |
| 6 | Journal (blog, categories, RSS), gallery, gift-cards page, utility pages | All 48 theme routes exist in the site; sitemap merged |
| 7 | Tetun twins, SEO review, performance and accessibility audit, retheme to Alfaiate colours and photos | E2E, axe, CSP, reflow and budgets pass |
| 8 | Remove the old public components and CSS; docs | `handspark/` folder removed (its code lives in `src/`) |

## Decisions needed from the owner

1. **Cart.** Keep the theme's cart as a **request list with no payment** (fits PRD §7.3), or build a real checkout with a payment provider later (needs a PRD change and an account with the provider)? Recommended: request list now, checkout only if the owner opens that scope.
2. **Products.** In the shop, should a product be a **tailor** (one card per tailor) or a **service** (for example "Suit, from $120" belonging to a tailor)? Recommended: tailors as products at first, services as variations on the tailor page.
3. **Replace or run side by side.** Replace the current public pages step by step on this branch (recommended), or keep the old site live until the whole theme is ready?
4. **Demo content.** Keep the theme's handmade-shop demo text and photos as placeholders during the build (not published), then replace them page by page?

## Boundaries

- **Always:** keep security headers, CSP, consent and privacy rules, tailor permission rules (BR-06, BR-11), admin and portal untouched, tests rewritten with each page.
- **Ask first:** payments, accounts for shoppers, anything that stores customer data outside D1, new third-party services (CMS, form services, analytics).
- **Never:** commit the Freepik demo photos, remove the theme licence, show unverified prices or tailor content, publish demo text.
