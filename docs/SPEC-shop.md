# Spec: Shop (products from the platform and from approved tailors)

Status: **Approved by the owner 2026-10-23 (with the defaults below for the open questions: USD only, no commission, delivery and returns are the seller's, platform products first then tailor products). S1 built 2026-10-23 (admin only, nothing public); S1b, S2, S3 and S4 not built.** · Requested by the owner 2026-10-23 · Touches PRD §7.3 (marketplaces excluded) and BR-01/BR-02 · Follows the Handspark theme work (SPEC-handspark-theme.md); the theme's `/shop`, category and product pages are the layout.

## Objective

Alfaiate TL becomes a one-stop place for clothing: besides finding and requesting a tailor, a visitor can browse **products** (the platform's own exclusive collection, and specific items that approved tailors choose to list) and ask to buy one. The tailor directory and its request list stay as they are.

## Owner decisions (2026-10-23)

1. **Sellers:** the platform and approved tailors. No open listing by anyone.
2. **Buying:** an **enquiry, paid to the seller directly**. No online payment, escrow, delivery or order management on the platform. The shop never holds money.
3. **Carts:** two separate lists. The tailor request list is unchanged; the shop gets its own product list that sends a **product enquiry**.

## Assumptions (correct me now)

- A product is a listing, not stock: no inventory counts, no "sold out" automation (manual hide or "unavailable" switch).
- Prices are shown in US dollars, always "price set by the seller", per BR-02/BR-11 (tailor-supplied prices are labelled; platform prices are the owner's own).
- A tailor's product shows the tailor's name and links to the tailor's page; the enquiry goes through our form with the same consent and spam controls, then staff pass it on manually (BR-08, BR-10).
- A tailor can only list products through the existing owner-approved tailor portal; staff publish.
- Product photos need recorded permission, as tailor photos do (BR-06). Platform products use photos the owner owns.
- Categories reuse the theme's product categories (new table, separate from garment types), e.g. Ready-made, Fabrics, Accessories, Exclusive collection.

## Scope

| Area | What is built |
|---|---|
| Data | New tables `product` (seller = platform or tailor, name, slug, description, price, category, status, published) and `product_category` (S1 built); `product_image` with photo permission comes in S1b; `product_category`. One migration. Images in R2 through the media module, D1 holds structured data only. |
| Public | `/shop` (paged, category filter), `/shop/category/[slug]`, `/shop/[slug]` product page, Tetun twins, sitemap and structured data (`Product` with no rating or review). Seller label on each product. |
| Product list | A second cart in the theme panel: add product, remove, "Send enquiry" opens `/shop/enquiry` (a form with consent, spam controls, rate limit, same protections as `/request`). Stored as a new kind of enquiry. |
| Admin | New permissions `product.edit`, `product.publish` (S1 built these two; `product.view` was dropped); product list, create, edit, photos, publish; product enquiries appear in the inbox with their own kind and status. Every route and mutation checks a permission server-side. |
| Tailor portal | A tailor adds and edits their own products as drafts; staff publish. A tailor never sees enquiries or customers. |
| Docs/tests | PRD §7.3 amended (see below), new FR-SHP-xx requirements, DATA_MODEL, ARCHITECTURE, tests for each rule, e2e for browse, add, send. |

## Out of scope (still excluded)

Online payment, checkout, shipping, delivery, tax, refunds, stock counts, discounts or coupons, customer accounts, reviews and ratings, order tracking, automatic commission. Any of these is a separate owner decision.

## PRD changes needed (for approval)

- §7.3: replace "marketplaces" in the exclusions with: a **product shop** for the platform's own items and approved tailors' items, enquiry only, no online payment; open marketplaces remain excluded.
- New business rules: BR-13 the platform lists items but is not the seller of tailors' products and does not handle payment; BR-14 a tailor's product needs the same permission and labelling as other tailor content.
- New requirements FR-SHP-01..08 (browse, product page, seller label, product list, product enquiry, admin CRUD, tailor draft, permissions).

## Plan (each step ends with `npm run check`, e2e, reviewers, commit)

- **S1** Migration, product module (queries, validation), admin product pages with permissions, tests.
- **S2** Public `/shop`, category and product pages in the theme (with the theme's own pages replaced, not the demo), SEO, Tetun, sitemap.
- **S3** Product list and product enquiry flow (separate from the tailor request list), inbox integration.
- **S4** Tailor portal: draft products and photos.
- Order against the theme steps: this can run after step 5 or alongside step 6; the theme's Shop page is not used for tailors, so there is no conflict.

## Open questions for the owner

1. Currency and price display for platform items: USD only?
2. Do you want a platform fee or commission on tailors' product sales (BR-09 style, manual)? If yes, it needs a fee record and agreement text; default: **no**.
3. Who handles delivery and returns: the seller alone (default), with a line on each product page saying so?
4. Terms/Privacy text must cover product enquiries (OQ-08, owner approval).
5. Start with S1 to S3 (platform products only) and add tailor products (S4) later?

## Build log

- **S1 (2026-10-23), done:** migration `0009_shop.sql` (`product`, `product_category`), `src/modules/shop/products.ts`, permissions `product.edit` (editor, manager, owner) and `product.publish` (manager, owner) instead of the three in the plan (`product.view` was dropped: whoever can open the list can edit), admin pages `/admin/products`, `/new`, `/[id]` and `/[id]/publish` with CSRF and server-side permission checks, a Products link in the admin menu, audit actions by ids only. Tests: unit (rules, permissions, a seen-failing mutation of the publish check), integration through the real pages (roles, CSRF, hostile names, hidden from every public page and the sitemap), the role matrix and nav tests, an axe e2e. `npm run check` 790 workers and 732 integration tests and 160 browser tests passed (the privacy-scope and docs-sync reviewers also ran; their findings are fixed).
- **Deviation:** **product photos moved to S1b.** The media module is keyed by tailor (`tailor/<id>/`) and would need generalising (prefix, permission record, public/private buckets); doing it inside S1 would have mixed a refactor of working code into a feature. Until S1b a product has no photo and the shop pages (S2) must not be switched on without it.
- Product types can be changed only in the database for now (no admin page for them).
- **Owner to confirm:** a live (published) product can be edited only by someone with `product.publish`, so an editor cannot change public text around the publish control. The alternative is to let editors edit and re-approve afterwards.
- Fixed after review: a long name that collides no longer breaks the 60-character slug limit, and a non-Latin name gets the slug `product` instead of `tailor`.

