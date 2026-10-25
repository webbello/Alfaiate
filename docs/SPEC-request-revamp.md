# Spec: Request page revamp (least typing, app-like, optional map)

Status: **Approved and built 2026-10-24, no-map option. Form replaced 2026-10-25 by the four-step version (see DECISIONS.md); the findings below describe the form it replaced.** Owner decision: "avoid third party map, just go with useful alternatives" (D1 = A, D2 = no pin stored). Built form differs from the draft below in two ways: the area stays a drop-down (not chips) and there is no place-suggestion list (`places-dili.json`), sticky Send bar, hero strip or contact-channel change; "pick a day" is a typed box in the collapsed section; the script is the shared `portal-form`; thanks timeline keys `next1..3`; D1 to D5 are answered as A / no pin / defaults not built; "share my location" is not offered. · Requested by the owner 2026-10-24 · Covers `/request` and `/tet/request` (view `src/views/Request.astro`, logic `src/modules/enquiry/`). `/business` shares the view and must not break. Requirement IDs unchanged: FR-ENQ-01..06, PRV-01..04, BR-03, BR-07, BR-08, SEC-07.

## Objective

A visitor who wants a tailor to come to their home sends a request in under a minute on a phone, mostly by tapping. Success: with a tailor already chosen from the cart, the form needs only **name, number, where, and the consent tick**; everything else is a tap or optional.

## Findings in the current page

1. Two fieldsets with eight-plus fields before the consent: garment chips, a free-text "service", an area drop-down plus a separate "other area" box, then a collapsed "more" (when, notes), then name, phone, channel.
2. "Where" is a drop-down of areas (no street/landmark), so a tailor at the door cannot find the house without calling. That is the real gap behind the map request.
3. "When" and "notes" are free text where three taps would do.
4. Cart arrivals (`?tailor=`, `?product=`) show a notice but the form does not shorten.
5. Plain stacked inputs; no progress, no sense of a finished request; the how-it-works list sits above the form.

## Design (server-rendered; JavaScript is optional enhancement only)

One form, one POST to the same route (FR-ENQ-*): no new route, no new table in the base option.

- **Hero strip:** one headline, the tailor name(s) as chips ("Sent to: Maria's Atelier ✕" is not offered; removal stays on the cart), the not-a-booking line next to Send (FR-ENQ-03).
- **1. What do you need?** garment chips (existing categories, plus "Not sure"); the free-text "service" becomes an optional one-line box under "Add details".
- **2. Where?** area chips (existing `service_area` rows, tap one) then **"Street, landmark or what is near your home"** (one text box, up to 100 characters, example hint "near the Farol roundabout, blue gate"). Stored in the existing `area_text`. With JavaScript, typing offers suggestions from a **self-hosted list** of Dili places (the areas plus landmarks the owner approves, a static JSON in `public/`), no external call. Without JavaScript it is a plain text box.
- **3. When?** tap choices: "As soon as possible", "This week", "I am flexible", "Pick a day" (opens the existing free-text box). Stored as the existing `preferred_datetime_text`.
- **4. You.** Name, number (type `tel`, `autocomplete`), and a WhatsApp / Call / Either tap choice defaulting to WhatsApp (today's value is unset-or-required: confirm the default is allowed, it changes no schema).
- **Add details (collapsed):** service text, notes with tap-to-add sentences ("It is for a wedding", "I have my own cloth"), counter. Mirrors the portal revamp pattern.
- **Consent block and Send:** unchanged consent wording and version (PRV-03), unticked by default; sticky Send bar on phones; honeypot, signed fill-time token, rate limit untouched.
- **After submit:** the existing thanks page with reference code; add a three-point "what happens next" timeline (you sent it · we pass it to a suitable tailor · the tailor contacts you), no promised timing (OQ-05).
- **Errors:** inline on the exact field plus the summary, input kept (FR-ENQ-05), as now.
- **Accessibility and performance:** WCAG 2.2 AA (axe in e2e), 44 px targets, visible focus, state not shown by colour alone, reflow at 320 px, `prefers-reduced-motion` respected, CSP unchanged in the base option.

## Decisions for the owner (not decided here)

### D1. A map with place search needs a third party, which breaks three rules

A map with search means tiles (images), geocoding (typed text to coordinates) and a map script. Using a provider such as OpenStreetMap tiles with Nominatim, or a paid one (Mapbox, Google), means:

- the visitor's **IP address, the search text and the coordinates** go to that company (privacy: customer data stays private; PRV-01 data minimisation);
- the strict CSP must be loosened (`img-src`, `connect-src`, probably `script-src`/`worker-src`), against SEC-08;
- `check:repo` and the "no third-party resources" test must get an exception;
- OSM's tile and Nominatim policies forbid heavy or commercial-grade use without your own server; paid providers add a key (a secret in the page) and a bill.

| Option | What the visitor gets | Third party? | CSP / test change | Cost to build | Risk |
|---|---|---|---|---|---|
| **A. No map. Smart place field** (recommended first step) | Area chips, one landmark box with local suggestions, tap choices | None | None | Small (view, schema reuse, one script, a JSON list, tests) | Visitors cannot drop a pin |
| **B. Map after a consent click** (OSM tiles + Nominatim) | "Show map" button; pin and search load only after the visitor taps it, with text saying what is sent to whom | Yes, only after the click | Add tile and geocoder hosts to CSP on this page only; narrow exception in the repo test | Medium (map script is a new dependency, e.g. Leaflet ~40 kB, vendored) | Policy and uptime of free services; consent wording needs your review (OQ-08) |
| **C. Self-hosted map** (vector tiles of Dili in our R2, MapLibre vendored, search over our own place list) | Full map and search, no third party | None | `worker-src blob:`, `img-src data:` maybe; tiles from `'self'` | Large (tile build, ~200 kB script, a place index, tests); ongoing data upkeep | Largest build and weight; place search is only as good as our list |
| **D. Paid provider** | Best search | Yes, always | CSP change on this page | Medium plus a monthly bill and key handling | Highest privacy exposure |

**Recommendation:** build **A now** (it removes most of the typing and fixes "the tailor cannot find the house"), and decide on **B or C** later from real use. If you want a map in this change, take **B** with the consent click, not D. A leaves the door open: the pin would only add two optional values next to the text.

### D2. May an exact home pin be stored at all?

Today an enquiry stores an area and optional area text, not an address or coordinates. With A nothing new is stored beyond `area_text` (already private, admin-only, cleared by anonymise). If you choose B or C, a pin is **precise customer data** and needs, before build:

- two nullable columns on `enquiry` (`lat`, `lng`, rounded to 5 decimals) via a migration, admin-only, shown only on the admin enquiry page (`enquiry.view`), never in a public page, URL, log line, analytics event, sitemap or notification (AC-15, BR-07);
- cleared by the anonymise routine and covered by the CHECK that already forces the personal columns to NULL;
- the Privacy text and the consent wording extended to say a location is collected and shared with the tailor (BR-08), new consent version; retention follows OQ-09 (still undecided: a figure is needed before launch);
- shared with the tailor only when you forward it, as a link built in the admin, never auto-sent.

Question: store a pin, store only an area/landmark text, or a pin that is used on screen and not saved? [Recommended: text only for now.]

### D3. Without JavaScript or when the map fails

Always works whatever you choose: the area chips (radio inputs with a visible text label), the landmark/address text box and the whole form submit as a plain POST. A map, if added, is an enhancement behind a button; if its script or tiles fail, the button text changes to "The map did not load. Type the place instead." and nothing is lost. Tested with JavaScript off and with the tile host blocked.

### D4. Tetun wording

New Tetun strings are added to `src/i18n/public/tet.ts` and listed in [TETUN-REVIEW.md](TETUN-REVIEW.md); they stay **unreviewed** (OQ-07) and are not promoted to production. The English page is the source of truth.

### D5. Smaller choices (my defaults in brackets)

1. Default contact choice WhatsApp [yes, with a visible change control]. 2. "When" as four tap choices plus optional date text [yes]. 3. Place suggestions list: start from the existing areas, owner adds landmarks [areas only until you send landmarks]. 4. Keep how-it-works list below the form on phones [yes, it moves under Send].

## What does not change (boundaries)

- Always: consent wording and version, unticked consent, signed token, honeypot, per-address rate limit, server validation, no customer data in logs, URLs, analytics or notifications, strict CSP in option A.
- Ask first: any migration, any new dependency, any CSP or `check:repo` exception (all only under B, C or D).
- Never: accounts, payments, chat, booking calendars, automatic matching (PRD §7.3); a third-party resource loaded before an explicit visitor click; a pin in a URL.

## Files touched (option A)

`src/views/Request.astro` (restructure), `src/modules/enquiry/schema.ts` (accept the "when" chip values and a WhatsApp default, no new field), `src/modules/enquiry/page.ts` / `queries.ts` only if the suggestion list needs data, `src/scripts/request-form.ts` (new, optional: suggestions, tap-to-add, counter), `src/styles/` request styles, `public/places-dili.json` (areas now), `src/i18n/public/{en,tet}.ts`, `src/views/RequestThanks.astro` (timeline), `tests/workers/enquiry-*.test.ts`, `tests/integration/*request*`, `e2e/request*.spec.ts` (+ axe, 320 px, no-JavaScript, hostile text), `tests/workers/public-pages.test.ts` only if a path changes (none), docs (this file, STATUS, DECISIONS, ARCHITECTURE enquiry section, TETUN-REVIEW). Under B or C add: migration `0014`, DATA_MODEL §3.7, headers.ts, `check-repo`, SECURITY_PRIVACY_REVIEW.

## Commands

```
Check: npm run check        Browser, axe, CSP, reflow: npm run test:e2e
```

## Testing

- Unit/D1: "when" choices and WhatsApp default validate; a forged choice is rejected; honeypot, token and rate-limit cases still pass unchanged; hostile text in landmark/notes is escaped; anonymise still clears `area_text`.
- Integration: cart arrival (`?tailor=`, `?product=`) shows the short form with tailors named; error re-render keeps input; EN and TET twins match; no third-party host appears in the page.
- E2E: axe at phone and desktop width, 320 px reflow, keyboard-only pass over chips, no-JavaScript submit, reduced motion, CSP violations none.
- Mutation check on the "when" whitelist and on the default channel before citing them.

## Open questions

1. D1: A, B, C or D? [A now.] 2. D2: pin stored? [no.] 3. D5 defaults ok? 4. Owner to supply Dili landmarks for suggestions, or areas only?

Approve this (and answer D1/D2) and I will build in three slices: (a) form restructure with chips and "when" choices; (b) place field, suggestions, thanks timeline; (c) tests, docs, Tetun list.
