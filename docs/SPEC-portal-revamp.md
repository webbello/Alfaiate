# Spec: Tailor portal revamp (guided, low-typing, rewarding)

Status: **Approved and built 2026-10-24** (three slices in one change) · Requested by the owner 2026-10-24 · Builds on [SPEC-tailor-portal.md](SPEC-tailor-portal.md) (FR-TPO-01..08) · No new routes, no new tables, no new dependency.

## Objective

A tailor who has never used a web form should finish their page in one sitting on a phone, always knowing three things: **what am I doing now, what is left, what happens next**. Each saved step should feel like progress.

Success: from the overview the tailor reaches "Ready for review" by tapping rather than typing wherever possible; every screen says "Step N of 5", what it is for, and what comes after; completion ends on a clear "what happens next" screen.

## Findings in the current portal

1. Plain stacked `<p>` forms: every field is a full-width text box, labels have no examples, no sense of progress inside a page.
2. The overview lists five steps but each opens a long page with no "next" button; the tailor must go back to the overview after every save.
3. "Where you work" is a wall of two checkboxes per area (shop here / also work here): confusing.
4. Photos need three inputs (file, description, caption) before anything is added.
5. Nothing celebrates a finished step; "To do" and "Done" are the only feedback.
6. The five-link top bar is jargon-free but gives no order or progress.

## Design (all CSS, server-rendered; JavaScript is optional enhancement only)

- **Overview = a progress hero.** Greeting, a CSS ring (`conic-gradient`, `role="progressbar"`-equivalent text "3 of 5 done") and one big **"Next: <step name>"** button with a time hint ("about 1 minute"). Below it, the five steps as cards with a number or tick, a one-line reason ("Customers read this first"), and Fill in / Change. Required vs optional shown plainly.
- **Step bar on every step page** replacing the five-link bar on step pages: five dots with ticks for done steps, current one named. The top bar keeps Overview / Products / Sign out.
- **One job per page, with "Save and next".** Steps reorder to the order a tailor thinks in: 1 Contact numbers, 2 About your work, 3 What you make, 4 Where you work, 5 Photos. Contact numbers move out of the long profile form into step 1 (it is the thing that blocks publishing), the rest of the profile (shop address, home visits, languages, price guide) becomes an optional "more details" block under step 2. Saving a step redirects to the next unfinished step with a success banner ("Saved. 2 of 5 done."); the last one lands on the overview.
- **Tap, don't type.** Types of clothing and areas become large chip toggles (styled checkboxes, 44 px targets, visible focus and checked state not by colour alone). Areas (the single drop-down keeps one shop place; extra shop places set by staff are dropped on save, confirmed by the owner 2026-10-24): one chip list "Where do you work?" plus one select "Where is your shop?" instead of two checkboxes per row; saved to the same two link kinds. Home visits: a Yes / No segmented control. About text: example starter lines the tailor can tap to add (needs JavaScript; without it the example is printed under the box), a live "n of 2000" counter. Price guide: tap-to-fill examples.
- **Photos: one big "Add a photo" tile.** Choosing a file uploads at once with the existing client-side clean-up; description defaults to "Clothes made by <business name>" and is optional to change; caption moves to "Add details" per photo. The "these are my own photos" tick stays (BR-06), once, above the tile.
- **Reward moments (no confetti library, no autoplay).** A tick that scales in on a finished step and a short ring fill when progress rises, both off under `prefers-reduced-motion`; plain-words messages ("Great, your contact is saved"); when the five are done the hero turns into a "You are ready!" card with the Ready for review button. After submitting: a three-point timeline (You sent it · The team checks it · It goes live) with the current point marked.
- **Accessibility and performance.** WCAG 2.2 AA (axe in e2e), labels always visible, hints tied with `aria-describedby`, status messages in `role="status"`, errors inline on the exact field, focus moved to the heading after redirect, reflow at 320 px, one small optional script (`portal-form.ts`: focus after save, character counter, tap-to-add sentences) on the overview and step pages, CSP unchanged (`script-src 'self'`).

## What does not change (boundaries)

- Always: tailor id from the session only; `portalProfileInput` whitelist; locked pages stay read-only; numbers locked after publish; photos hidden until staff show them; no customer data; English-only copy (Tetun waits for OQ-07).
- Ask first: new routes, migrations, any new field a tailor can edit, any dependency.
- Never: let a tailor publish, set permission, verify facts, or change routing/fees.

## Commands

```
Check: npm run check        Browser, axe, CSP, reflow: npm run test:e2e
```

## Files touched

`src/layouts/PortalLayout.astro`, `src/pages/portal/{index,profile,work,photos}.astro`, small shared components in `src/components/portal/` (progress ring, step bar, chip), `src/modules/portal/{checklist,work}.ts` (step order, per-step "next" target, short reason and time hint), `src/i18n/en.ts` (`portal` strings), `src/styles/portal.css` (new, imported by `PortalLayout`), `src/scripts/{portal-form,image-upload}.ts`, `src/modules/portal/{profile,photos}.ts`, `e2e/portal.spec.ts`, `tests/integration/portal-content.test.ts`, `tests/workers/portal-{content,submit}.test.ts`, docs (this file, SPEC-tailor-portal.md, STATUS.md).

## Testing

- Unit: checklist order and "next step" target; areas select saves one `shop_location` and the chosen `serves` links, and keeps links to switched-off areas.
- Integration: every step page shows "Step N of 5"; save redirects to the next unfinished step; forged fields still ignored; locked and published cases unchanged; hostile text escaped.
- E2E: axe on each step at phone width, keyboard-only pass through the chips, no-JavaScript submit works, reduced motion removes animation.
- Mutation check on the "next step" redirect target and on the areas whitelist before citing them.

## Open questions (my defaults in brackets)

1. Reorder steps with contact first? [yes: it is the publish blocker and the quickest win]
2. Keep optional extras (shop address, languages, home visits, price guide) on the About step, collapsed? [yes]
3. Photo description defaulted automatically? [yes, editable; blank alt text is never saved]
4. Tone: friendly plain English, "you/your", no jargon. Tetun later with OQ-07.

Approve this and I will build it in three slices: (a) layout, overview, step bar, next-step flow; (b) chips, areas select, About and Contact steps; (c) photos tile and finished/waiting screens, then tests and docs.
