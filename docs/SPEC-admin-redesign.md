# Spec: Admin redesign (TailAdmin style, faster forms)

Status: **Approved 2026-10-23; built T1 to T8** (nav icons, dark mode and a click-count e2e deferred) · Requested 2026-10-23 · Not in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) (a design pass like Phase 7b, before Phase 8) · Related: NFR-A11Y, SEC-*, AD-xx on CSP, [SPEC-tailor-portal.md](SPEC-tailor-portal.md) (portal reuses admin patterns)

## Objective

The owner asked to "make admin as TailAdmin style, revamp the design, focus on easy form filling, reduce steps, save space, and use the blank space".

Today the admin is a top bar with eight wrapping links, one 48rem column (the right half of a laptop screen is empty), and long single-column forms: the tailor page is 596 lines and stacks about 12 sections, and creating a tailor means fill a 12-field form, save, then open the draft to add categories, areas, photos and the checklist.

Success: the owner (part-time, small screen possible) can create a tailor, work an enquiry and record a referral with **fewer clicks and less scrolling**, on a phone and on a laptop, with no loss of any permission check, audit row or privacy rule.

## What "TailAdmin style" means here

TailAdmin is a Tailwind dashboard template. We **copy its look, not its code**: no Tailwind, no new dependency, plain CSS in `admin.css`, same strict CSP (no inline style or script).

- Left sidebar navigation (grouped, icons, current page marked), slim top bar (page title, signed-in user, sign out), content on a pale grey ground.
- White cards with a soft border and shadow, rounded corners, generous but tight spacing.
- One primary blue accent, status chips (soft tinted background, strong text), stat cards on the dashboard.
- Forms in two or three columns inside cards, with the Save button in a sticky bar.

## Assumptions (correct me now)

1. **Admin only.** The public site and the tailor portal keep their own look (the portal may reuse the new components later; out of scope now).
2. **No JavaScript dependence.** Everything works without script (existing `no-javascript` e2e). The mobile sidebar opens with a CSS-only control (`<details>` or checkbox pattern); no framework.
3. **No new dependency, no web font download.** System font stack; icons are inline SVG already in the repo style or a small local set.
4. **Light theme only at first.** Dark mode is a follow-up (see Open Questions).
5. **Palette:** TailAdmin blue (`#3C50E0`) instead of the current maroon, with contrast re-checked (a test exists for the public palette; add one for admin).
6. **Same routes, same permissions, same handlers.** This is markup and CSS plus a few merged pages; every route still starts with `requirePermission`, and `admin-contract.baseline.json` must still match (no route removed or loosened).
7. **Reduce steps by merging, not by hiding rules.** Publish checklist, verified facts and fee terms stay where permissions say (fees owner-only).
8. English only, as now.

## Where the steps and space go (proposed changes)

| Area | Today | Proposed |
|---|---|---|
| Navigation | Top bar, up to 8 links wrap on a phone | Left sidebar (grouped: Work, Catalogue, People, Site), top bar on a phone with a menu button |
| Page width | 72rem shell, 48rem forms, empty right side | Full-width content; forms in cards of 2 to 3 columns; side panel for status/checklist |
| Create tailor | 12 fields in one column, save, then open the draft | One page: **essentials** (name, phone/WhatsApp, area, work types) in a card, **more detail** folded in a second card; save once, land on the draft with the checklist |
| Tailor page | About 12 stacked sections | Two columns: left the forms in cards (Profile, Work and areas side by side, Photos), right a sticky **status card** (checklist, publish, sign-in link, notes) |
| Enquiry page | Long stack incl. referrals | Left: enquiry and status; right: referral form and log; anonymise stays folded |
| Lists | Plain tables/cards | Table with chips, filters in a bar above, row actions inline |
| Dashboard | Stat cards in a stack | Stat card grid, two-column below (needs attention, recent) |
| Forms generally | Label above, 44 px controls, big gaps | Same 44 px targets, tighter vertical rhythm, helper text under fields, errors inline, sticky Save bar |

## Tech stack

Unchanged: Astro SSR on Cloudflare Workers, D1, R2, TypeScript, Vitest, Playwright and axe. Files touched are views and CSS: `src/styles/admin.css`, `src/layouts/AdminLayout.astro`, `src/components/admin/*`, `src/components/ProfileFields.astro`, `src/pages/admin/**`.

## Commands

```
Check (lint, typecheck, repo, unit, build, integration): npm run check
Browser, axe, CSP, reflow, no-JavaScript:                npm run test:e2e
Preview the built site (dev server blocks inline styles):  npm run preview   (port 4322)
Demo data (local only):                                     npm run db:demo / npm run db:demo:remove
```

## Project structure (additions)

```
src/styles/admin.css                     rewritten: tokens, sidebar shell, cards, form grid, chips, tables, sticky bar
src/layouts/AdminLayout.astro            sidebar + top bar shell (same props)
src/components/admin/                     Card, FormGrid, Field (label + help + error), StickyBar, SidebarNav, PageHeader
src/modules/admin-ui/nav.ts               nav groups and icons (same permission filtering)
tests/integration/admin-*.test.ts         updated markup expectations
e2e/admin-*.spec.ts                       sidebar, mobile menu, reflow, keyboard, axe
```

## Code style

Same as the codebase: Astro components with typed props, class names `block__element`, plain CSS custom properties, no inline style or script.

```astro
<Card title="Profile">
  <FormGrid columns={2}>
    <Field name="display_name" label="Display name" required />
    <Field name="whatsapp" label="WhatsApp" help="Public once published" />
  </FormGrid>
</Card>
```

## Testing strategy

- Existing integration tests that read admin markup are updated in the same task, not deleted. Permission and CSRF tests must pass unchanged (they prove nothing was loosened).
- `admin-contract.test.ts` and its baseline: unchanged.
- e2e: axe WCAG 2.2 AA on every admin page, 320 px reflow without horizontal scroll, keyboard path through the sidebar, mobile menu without JavaScript, CSP (no inline style), one create-tailor journey counting clicks (target below).
- A contrast test for the new admin palette (like `contrast.test.ts`).
- Mutation check for any changed guard, per AGENTS.md lessons (none expected: handlers are not touched).

## Boundaries

- **Always:** keep `requirePermission` on every route, CSRF on every form, 44 px targets, visible focus, labels on every field, fake data in tests, run `npm run check` and `npm run test:e2e` before committing.
- **Ask first:** merging two pages into one route, removing a field from a form, any change to what is saved or when, adding a dependency or a web font, adding JavaScript.
- **Never:** add features outside PRD §7.3, show customer data anywhere new, loosen a permission, put customer details in a URL, log names or numbers, use inline style or script (CSP).

## Success criteria

1. Create a tailor from the dashboard to a saved draft with the checklist in **at most 3 clicks and one form submit** (today: open list, New, submit, then open draft sections).
2. At 1280 px wide, admin forms use at least two columns and no page has more than 25% empty space to the right of the content (checked by a layout test on the main pages).
3. At 320 px: no horizontal scroll, sidebar reachable from a menu button, Save button always visible.
4. All current permission, CSRF, audit and privacy tests pass unchanged; admin contract baseline unchanged.
5. axe: zero violations on every admin page; contrast of every text pair at least 4.5:1.
6. Works with JavaScript off. No inline styles or scripts.
7. Page weight: admin CSS stays within a new, stated budget (measured 11249 bytes minified; budget 11500 in `tests/integration/budgets.test.ts`).

## Order of work (proposed, one slice at a time)

1. Shell: tokens, sidebar, top bar, cards, chips (every page gets the new frame).
2. Dashboard and lists (enquiries, tailors, interest, users).
3. Tailor create and edit (the biggest saving).
4. Enquiry detail and referrals.
5. Small pages (categories, areas, traffic, newsletter, account, login) and cleanup.

## Open questions (need the owner)

1. **Colour:** TailAdmin blue for admin only (the public site stays terracotta and forest), or keep the brand colours inside the new layout?
2. **Dark mode:** include now (needs a small script or `prefers-color-scheme`), or later?
3. **Scope of first pass:** whole admin in the five slices above, or only the shell plus tailor create/edit and the enquiry page first?
4. **Tailor page sections:** all on one page in two columns (no JavaScript, longer page), or tabs (needs JavaScript, shorter page)? Proposed: one page, two columns, anchored side links.
5. **Create tailor:** may "essentials" be only name, one phone/WhatsApp number, area and work types, with everything else optional on the draft page?
6. Should the portal (`/portal`) get the same look in a later pass?

### Answers (2026-10-23, the owner approved the spec and plan with these defaults)

1. Colour: blue for admin only. 2. Dark mode: later. 3. Scope: whole admin in five slices. 4. Tailor sections: one page, two columns from 1440 px wide, no tabs. 5. Essentials: name, WhatsApp, work types and shop areas (the rest under "More detail"). 6. Portal look: later pass, not decided.
