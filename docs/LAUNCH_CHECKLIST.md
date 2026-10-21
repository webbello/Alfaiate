# Launch checklist

Everything the code can do before deployment is built and tested locally. What is left is yours: decisions, accounts and real content. Tick items off here as you go. Items marked **(OQ-xx)** are open questions in [PRD.md](PRD.md).

## 1. Decide (nothing ships until these are answered)

- [ ] Domain name (OQ-11, AD-08). Used for `SITE_URL`, canonical links, the sitemap and Search Console.
- [ ] Fee model (OQ-03, OQ-04). Recorded fees are only relied on once agreed.
- [ ] Response-time wording you can honour (OQ-05). Set `RESPONSE_WINDOW_EN` / `RESPONSE_WINDOW_TET`, or leave both unset to promise nothing.
- [ ] How you want to be notified (OQ-06). Easiest: a free [ntfy](https://ntfy.sh) topic with a long random name, then `NOTIFY_WEBHOOK_URL=https://ntfy.sh/<topic>`; install the ntfy app and subscribe. Slack or Discord webhooks also work.
- [ ] WhatsApp number for the phone quick-action bar (`SITE_WHATSAPP=+670…`).
- [ ] Final category and area lists (OQ-10). Starting lists are in `seeds/launch.sql`; edit later in the admin.
- [ ] Retention period for enquiries (OQ-09), then apply it with the owner-only "Remove details" action.

## 2. Approve text

- [ ] Privacy and Terms: start from [DRAFT-privacy-and-terms.md](DRAFT-privacy-and-terms.md), have it reviewed (OQ-08), then put the approved text into the static pages and set their `reviewed` flag in `src/modules/seo/pages.ts`. Until then those pages stay `noindex`.
- [ ] How it works and About: read them, then set their `reviewed` flag.
- [ ] Consent wording on the request, business, join and newsletter forms.
- [ ] Tetum text reviewed by a native speaker (OQ-07). Until then production keeps `PUBLIC_LANGUAGES=en`.

## 2b. Tailor portal (built locally; see [SPEC-tailor-portal.md](SPEC-tailor-portal.md))

- [ ] Click through it with demo data: join, approve, send the link yourself, tailor fills the page and adds a photo, you show the photo and publish.
- [ ] Decide how you will send sign-in links (WhatsApp from your own number) and who may approve (managers and the owner).
- [ ] Privacy text covers tailor accounts (OQ-08) and the permission wording `consent-tailor-2026-10-v1` is approved.
- [ ] Decide whether phone-number sign-in is wanted (not built), and (decided 2026-10-21: edits to a published page go live at once, labelled tailor-supplied).
- [ ] Tetum copy for the portal after the OQ-07 review (English only now).

## 3. Content

- [ ] Real tailors, with recorded permission for every name, photo, price and contact shown (BR-06, BR-11).
- [ ] Real photos only with permission. No sample testimonials; add real quotes in `src/components/home/testimonials.ts` only with consent.
- [ ] Run `npm run db:demo:remove` locally so no demo rows remain; never run demo data against the live database.

## 4. Accounts and deployment (Phase 8, once you have a Cloudflare account)

- [ ] Create D1 (production, optional staging) and two R2 buckets per environment; put the real IDs in `wrangler.jsonc`. Keep the public bucket off `r2.dev`.
- [ ] Secrets with `wrangler secret put`: `SESSION_SECRET`, `FORM_TOKEN_SECRET` (16+ characters), and `NOTIFY_WEBHOOK_URL` if the topic name is private.
- [ ] Vars in `wrangler.jsonc` for production: `SITE_URL`, `SITE_INDEXABLE=true`, `PUBLIC_LANGUAGES`, optional `SITE_WHATSAPP`, `SOCIAL_*`, `RESPONSE_WINDOW_*`, `GOOGLE_SITE_VERIFICATION`. Set `JOIN_ENABLED=true` and `NEWSLETTER_ENABLED=true` only after the Privacy text covers them (the newsletter also needs a sender, OQ-06). Never set `SHOW_TESTIMONIAL_PLACEHOLDERS`.
- [ ] `wrangler d1 migrations apply DB --remote` (migrations 0001 to 0006), then `seeds/launch.sql` once if you accept the starting lists.
- [ ] Create the owner account (`npm run owner:create` works on the local database; creating the first owner on the deployed database is a Phase 8 step to be written and tested then) and test sign-in.
- [ ] Add a Cloudflare rate-limiting rule for `POST /request` and `/api/contact-click`; confirm production sends `cf-connecting-ip`.
- [ ] Re-measure PBKDF2 on the deployed Worker and check page weights (`npm run perf`).

## 5. Be found

- [ ] Search Console: add the property, copy the HTML-tag value into `GOOGLE_SITE_VERIFICATION`, submit `/sitemap.xml`.
- [ ] Google Business Profile for the business, with the same name, website and WhatsApp number as the site.
- [ ] Share the link on the Facebook, Instagram and YouTube pages you set in `SOCIAL_*`.
- [ ] After launch, read `/admin/traffic` weekly: sources show whether Google or social is working; "requests per 100 views" shows whether pages convert.

## 6. Sign-off before going live

- [ ] Click through Phases 7b, 7c and 7d with demo data and send notes.
- [ ] Test a request, a business enquiry and a join submission on the live site with fake data, confirm the notification arrives, then remove those rows.
