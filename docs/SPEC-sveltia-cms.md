# Spec: Sveltia CMS for photos, journal posts, authors and site settings (owner request 2026-10-27)

Status: **Approved 2026-10-27 with the draft answers to OQ-C1 to C5. Plan: [tasks/plan-sveltia-cms.md](../tasks/plan-sveltia-cms.md). The image folder is `public/photos` (the spec first said `public/media`, which is the R2 image route).** · Source: the owner: "on the free plan image uploading is not active, there may be a hundred tailors, I can add all tailor and product photos by hand, so use Sveltia CMS ... same structure as the demo for posts, authors, site settings ... at least 10 related posts with stock images ... editing from Sveltia and /admin must not conflict ... later tailor images come from R2, keep that as it is." · Owner answers (2026-10-27): files live in a **private GitHub repo**; **Cloudflare deploys staging on every save**; photos are **files named by the tailor or product slug**. Requirement IDs continue the numbering (FR-CMS-*); none is renumbered.

## Objective

Staff add and change photos and journal articles in a friendly editor (Sveltia CMS at `/cms`) without paid image storage. The site shows what Sveltia saved. `/admin` stays the only place for tailors, products, prices, permissions, publishing and orders. When R2 is switched on later, photos a tailor uploads there take over and nothing else changes.

Success: the owner opens `/cms`, signs in with GitHub, uploads a photo for tailor `zeb-tailor`, saves; within about two minutes staging shows it on the tailor's page and in the directory; editing the same tailor in `/admin` still works and neither tool can overwrite the other's data.

## How the two tools share work (the no-conflict rule)

| What | Where it is edited | Where it is stored |
| --- | --- | --- |
| Tailor and product **text**, prices, availability, permission to publish, status | `/admin` only | D1 |
| Tailor and product **photos from Sveltia** | `/cms` only | `content/` files in git, images in `public/photos/` |
| Tailor photos uploaded to **R2** (later) | `/admin` and the portal | R2 + D1 `tailor_image` rows |
| Journal posts, authors, site settings | `/cms` only | `content/` files in git |

- Sveltia never writes to D1, and `/admin` never writes to git, so the two cannot overwrite each other. The only link is the **slug**: a Sveltia photo entry is matched to a tailor or product by its slug.
- A photo entry does **not** make a tailor or product public. Publishing, consent and BR-06/BR-11 stay in `/admin` (a photo of an unpublished or non-consenting tailor is never shown; the Sveltia photo is only a source of the picture).
- Order of sources for a tailor's picture: **R2 image with granted permission first**, then the Sveltia photo, then the existing stand-in. R2 code and tables stay unchanged ("keep that functionality as it is").
- `/admin` shows, on a tailor or product page, a read-only line "Photo from the CMS: yes/no" with a link to `/cms` so staff know where to go. It has no upload control for Sveltia photos.
- The slug of a tailor or product must stay stable. If staff change a slug in `/admin`, the Sveltia photo stops matching; `/admin` warns about it on the slug field (FR-CMS-08).

## Requirements

- **FR-CMS-01** `/cms` serves the Sveltia CMS (a static page, noindex, not in the sitemap, not linked from the public site). It signs in with GitHub (private repo). It is not behind the `/admin` session; access is the repo's own permissions.
- **FR-CMS-02** Collections modelled on the Sveltia demo (`demo.sveltiacms.app`): **Posts** (title, published date, draft, author relation, tags, cover image, description, body; English and Tetun side by side), **Authors** (name, role, avatar, bio, links), **Pages** (nested: title, cover, body) kept only if the owner wants it, and **Site settings** (a single file: site name, tagline, contact line, social links, default share image). Plus two alfaiate collections: **Tailor photos** and **Product photos** (see FR-CMS-04).
- **FR-CMS-03** The journal reads posts and authors from `content/` instead of the code constant in `src/modules/journal/posts.ts`. Posts with `draft: true`, and sample posts, are never public, never in the feed or sitemap (BR-11 unchanged). The owner approves each post by turning draft off.
- **FR-CMS-04** **Tailor photos**: one entry per tailor slug: a profile photo, optional gallery (max 6), alt texts. **Product photos**: one entry per product slug: main photo, optional gallery (max 6), alt text. The page reads the entry for its slug at request time from the built content; a missing entry means the stand-in as today.
- **FR-CMS-05** Site settings values replace the matching text in the header, footer and meta (only where they exist today; no new page sections). The default for each is today's text, so an empty settings file changes nothing.
- **FR-CMS-06** Ten sample posts with stock photographs, written to the journal's topics (tips on choosing, caring for and getting clothes made), all with `draft: true` and a visible "sample" mark until the owner approves them. Stock photos only from sources whose licence allows free use without credit or with credit we show (Unsplash or Pexels, licence recorded per image in the post's alt/credit field).
- **FR-CMS-07** Images in git are limited: Sveltia is configured to accept only JPG, PNG and WebP up to 1.5 MB each, and `check:repo`'s rule that forbids tracked images gets one exception: `public/photos/**`. Nothing else may be tracked as an image.
- **FR-CMS-08** `/admin` tailor and product pages show the read-only "Photo from the CMS" line, and warn on the slug field that a changed slug unlinks the photo.
- **FR-CMS-09** A save in Sveltia deploys staging by itself through Cloudflare's GitHub connection (Workers Builds on `alfaiate-tl-staging`, deploy command `npm run deploy:staging`, branch `handspark-theme`; docs/DEPLOY.md section J). Production deploys only by hand (`npm run deploy:production`). *Changed 2026-11-12:* one branch instead of a separate `staging-content` branch (OQ-C3), because the owner and the code share one staging and a second branch would need merging by hand; sign-in from a phone is a GitHub fine-grained access token (Contents read/write on this repository only) until a sign-in helper is set up.

## Data and migration notes

- No D1 table or column is added or changed. `tailor_image` and R2 handling stay as they are.
- New folders: `content/posts`, `content/authors`, `content/pages` (optional), `content/settings/site.yml`, `content/photos/tailors`, `content/photos/products`, `public/media`, `public/cms/` (the Sveltia page and `config.yml`).
- Content is read at build time (Astro content collections, files loaded from `content/`). Because it is built into the Worker, a change needs a deploy: that is why FR-CMS-09 matters.
- New dependency: none in the app (Sveltia is one script loaded from the CDN on `/cms`). The strict CSP gets one exception on `/cms` only (script from `unpkg.com`, connections to `api.github.com`, `github.com`, and the sign-in helper); the public site and `/admin` CSP are unchanged.
- The GitHub sign-in needs a small OAuth helper (a Cloudflare Worker the owner deploys once; the guide lists each click). That helper stores no content.

## Boundaries

- Always: Sveltia holds only photos, posts, authors, settings; `/admin` and D1 hold everything else; the slug is the only link; BR-06 and BR-11 checks stay in the page code; tests alongside code; STATUS, DECISIONS, PRD and DEPLOY updated; fake data and stock photos only (no real customer or tailor photos in the repo until the owner adds them).
- Ask first: adding a paid service; putting a real tailor's photo in the repo (needs recorded permission, BR-06); turning a sample post live; changing the CSP of the public site.
- Never: let Sveltia write tailor or product text, prices, status or permission; make a photo entry publish anything; commit secrets (the OAuth client secret lives only in the helper Worker); remove the R2 code.

## Testing strategy

- Unit and integration: slug matching (Sveltia photo shown only when the tailor is published with photo consent; R2 image wins; missing entry gives the stand-in); drafts and samples absent from the journal, feed, sitemap and Tetun pages; site settings fall back to today's text; `/cms` is not in the sitemap, not linked, noindex, and its CSP exception is scoped to `/cms`.
- Config: run the Sveltia validator on `public/cms/config.yml` (`scripts/validate-config.mjs`) as part of `npm run check`.
- `check:repo`: the new image exception allows `public/photos/**` and still rejects an image elsewhere (mutation check, seen failing).
- e2e and axe on the journal list, a post, a tailor page with a Sveltia photo; look at `/cms` locally with the `test-repo` backend before GitHub is connected.

## Success criteria (checkable)

1. `/cms` loads the editor with Posts, Authors, Site settings, Tailor photos, Product photos (FR-CMS-01, 02).
2. A photo saved for a published, consenting tailor appears on the directory card and profile; for an unpublished one it never appears (FR-CMS-04, BR-06).
3. Editing the same tailor in `/admin` changes nothing in `content/`, and a Sveltia save changes nothing in D1 (the no-conflict rule).
4. Ten draft sample posts with stock photos exist; none is public, in the feed or in the sitemap until its draft is turned off (FR-CMS-03, 06).
5. Empty site settings leave every page text as today (FR-CMS-05).
6. `npm run check` passes with the config validator and the `public/photos/**` exception (FR-CMS-07).
7. A save in Sveltia deploys staging without a terminal (FR-CMS-09), shown by one real test save.

## Plan (after approval; one phase at a time)

1. **C1 Content and config:** `public/cms/` page, `config.yml` (validated), content folders, the `check:repo` exception, the `test-repo` backend for trying it locally.
2. **C2 Journal from files:** posts and authors read from `content/`; drafts and samples hidden; 10 sample posts with stock images (downloaded, licence recorded).
3. **C3 Photos by slug:** the Tailor photos and Product photos collections, the page lookup with the R2-first order, the `/admin` read-only line and slug warning.
4. **C4 Site settings:** the single settings file and its fallbacks.
5. **C5 GitHub and deploy:** private repo, OAuth helper, Cloudflare Git connection for staging, DEPLOY guide with exact names, one real test save.

C1 to C4 work on this Mac with `test-repo`; C5 needs your GitHub account.

## Open questions (for the owner)

- OQ-C1 Draft: keep the demo's **Pages** collection (nested pages such as About, FAQ)? The site already has About, FAQ and Terms as code. Draft answer: **no**, skip it; Posts, Authors, Site settings and the two photo collections only.
- OQ-C2 Draft: Posts in English and Tetun side by side (as the demo does with languages). Tetun text is mine and unreviewed, so a Tetun field stays optional and a post with no Tetun does not appear on the Tetun site. Agree?
- OQ-C3 Draft: Sveltia saves straight to the `staging-content` branch (no review step), and production is updated by merging to `main` when you decide. Or do you want Sveltia's "editorial workflow" (every save is a draft pull request you approve)? Draft answer: **straight to staging-content**.
- OQ-C4 Draft: the ten sample posts are **drafts you approve one by one**, because the journal rule is that only owner-approved articles go public. Agree, or should they show as labelled samples on staging only?
- OQ-C5 Draft: the first photo limits (JPG, PNG or WebP, 1.5 MB). A phone photo is usually 3 to 6 MB, so staff must shrink it first (the Sveltia image field can resize on upload; I will turn that on). Agree?
