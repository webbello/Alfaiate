# UX audit of the public site (2026-11-12)

Scope: every public page, checked as a first-time visitor on a phone (390 px, the main audience per PRD §5) and on a laptop (1280 px), against the PRD journeys J1 (browse and contact a tailor) and J2 (request a tailor at home), plus the shop. Seeded test data (one fake tailor, one fake product, no photos), so pictures show as initials. `/admin` and the tailor portal were polished separately (STATUS, admin polish A to D) and are not repeated here.

Nothing here invents a figure, testimonial or partner: the sample testimonials and logos already show only in development (BR-11).

## What works

- The request form is already a guided four-step wizard (Step 1 of 4, picture cards, Skip, progress bar) with a clear "what happens next".
- One clear headline and two actions in the home hero; the menu, language switch and footer are consistent on every page.
- No page scrolls sideways on a phone; every image has alt text; the 404 page leads home.

## Problems, most harmful first

| # | Where | Problem a visitor meets | Journey |
|---|---|---|---|
| P1 | Tailor profile | **Six contact buttons, three of them twice**: WhatsApp and Request this tailor in a bar, then Add to request list, Request this tailor, WhatsApp and Call again. A visitor cannot tell which to press, and "request list" (a basket of tailors) is not explained. | J1 |
| P2 | Find a tailor (phone) | **The list starts a full screen down**: a disclaimer box and four filter fields come before the first tailor. Each card without a photo is a screen-high green block, so one tailor fills the screen. | J1 |
| P3 | Home (phone) | **About 13 screens long.** Tailors appear only on screen 3 to 4, after a long "Our craft" text; the services section pins for five full screens; "How it works" arrives on screen 9. The value (find a tailor near you, or ask for a home visit) is said once at the top and then buried. | J1, J2 |
| P4 | Everywhere | **The same legal note in full on the home hero, the directory and every profile** ("Alfaiate TL introduces you to independent tailors..."). Necessary once, noise when repeated; on the hero it sits beside the main buttons in small grey text. | all |
| P5 | Everywhere | **Five names for one action**: Find a Tailor, Find Your Tailor, Explore All Tailors, Browse tailors, Browse all tailors. And two for the other: Request a Tailor, Request this tailor. | all |
| P6 | Shop and product pages | **The sticky "Request a Tailor" bar shows on shop pages**, where the visitor came to buy, and covers the product's own Add to cart area on a phone. The cart icon in the header holds both tailors and products, which mixes two ideas. | shop |
| P7 | `/order` | ~~Same page as `/shop` under a second address.~~ Not a problem: a plain visit already redirects to `/shop` (checked in U5). | shop |
| P8 | Contact | **No way to contact the business directly**: the page only offers the request form and Join. No WhatsApp number, hours or place, which costs trust. | trust |
| P9 | Home hero (phone) | **No picture in the hero on a phone**, so the first screen is all text; the small line under the buttons has weak contrast. | J1, J2 |
| P10 | Product page | The price note, "Sold by", the quantity box, Add to Cart and "Ask about this item" are stacked with little hierarchy; the legal note repeats a second time. | shop |

Not checked: real photos (none in test data), Tetun pages one by one (same templates), a real slow connection, screen-reader reading order beyond the automated axe checks that already run in e2e.

## Journey map (as it is today)

| Journey | Start | Steps today | Friction |
|---|---|---|---|
| J1 Contact a tailor | Home → Find a Tailor | Directory (scroll past note and filters) → profile → choose among 6 buttons → WhatsApp or Call | P2, P1, P4 |
| J2 Home visit | Any page → Request a Tailor | 4-step wizard → thanks page with reference | Low; sticky bar label differs (P5) |
| Shop | Menu → Shop | List → product → Add to Cart → cart → Order on WhatsApp | P6, P10 |
| Trust | Menu → About / How it works / Contact | Read | P8 |

## Proposed fixes, in batches (one at a time, each with tests and phone screenshots)

- **U1 Profile contact block (P1).** One block: WhatsApp (primary) and Call, then "Ask us to arrange it" (the request form with this tailor chosen). Remove the duplicate bar buttons; keep "Add to request list" only if the owner wants to keep comparing several tailors (see question 1).
- **U2 Directory on a phone (P2).** Tailors first; filters fold under one "Filter" button that shows how many are set; compact card with initials when there is no photo; the legal note becomes one line linking to How it works.
- **U3 Home length (P3, P9).** Tailors right after the hero; the craft text cut to two lines plus a link; services as a swipeable row on a phone instead of five pinned screens (desktop keeps the reel); How it works moved up; the licensed hero photo shown on phones too.
- **U4 One wording for each action (P5)** and **one short legal line (P4)**: "Find a tailor" and "Request a home visit" everywhere; the full note stays on How it works, Terms and the request form.
- **U5 Shop (P6, P7, P10).** No request bar on shop pages; `/order` redirects to `/shop`; product page in a clear order (price, seller, quantity + Add to cart, then details).
- **U6 Contact (P8).** Show the business WhatsApp (`SITE_WHATSAPP`, already a setting) and Call when set, with "We reply within ..." only if `RESPONSE_WINDOW_EN` is set.

## Questions for the owner (needed before U1, U3 and U4)

1. **Request list:** keep "Add to request list" on tailor profiles (visitors can pick several tailors, then send one request), or remove it so a profile has only WhatsApp, Call and "Ask us to arrange it"? Draft: keep it, but only as a small text link under the main buttons.
2. **Wording:** may I change the button texts and shorten the repeated legal note? Several of these pages carry your approved wording (checked by `tests/integration/static-text.test.ts`), so each change needs your yes. Draft: yes for button labels; the legal note keeps its full text on How it works, Terms and the request form, and becomes one line elsewhere.
3. **Home order on a phone:** hero, tailors, how it works, services, craft, final call to action. Agree?
