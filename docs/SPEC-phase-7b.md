# Spec: Phase 7b — Admin UX polish and first-run experience

Status: Draft for approval · Not in the original [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md): added on the owner's request (2026-10-19) after the first look at the admin in a browser, to be inserted between Phase 7 and Phase 8 · Related: PRD §5 (users and needs), FR-ADM-01–09, FR-RPT-01/02, NFR-A11Y-01, PRD §7.3 (exclusions)

**Requirements touched:** FR-ADM-02/03/04/05/06/07/08/09, FR-RPT-01/02, ANA-04/05, NFR-A11Y-01 (kept, not weakened). **No new feature and no change to who may do what.**
**Owner decision (2026-10-19):** spec and build the UX polish as its own short phase before Phase 8, covering items 1 to 7 of the review below; the public-site items (8) stay out.

**Why.** The first browser look showed the admin as plain, unstyled text: links run together, no navigation, the dashboard is a long list, the enquiry page is a long scroll, messages are one grey line. The owner will spend most of the pilot in these screens, so the admin must be pleasant and obvious to use before real tailors and customers appear.

**Scope check.** One theme (the admin experience), seven slices that share one stylesheet and one layout. Each slice is independently testable and committed alone. Slice order matters only for the layout (first) and the demo data (last). **Not in this phase:** the public site (its look, wording or the "what happens next" text), Tetum admin text, new permissions or roles, charts or any JavaScript, dark mode, new dependencies, schema changes, deployment.

## Assumptions

1. **Plain CSS in one external file** (`src/styles/admin.css`), no framework and no new dependency, built from the same colour and spacing tokens as the public site so the product looks like one thing. The strict CSP stays: no inline style or script.
2. **One admin layout** (`AdminLayout.astro`) replaces `Base.astro` on every admin page except the sign-in page (which keeps a small centred card). It shows a header bar with the site name, the links the signed-in role may use (Dashboard, Enquiries, Tailors, Categories, Areas, Users, Account), the signed-in email and role, and Sign out. On a phone the links wrap onto more lines (no hidden menu, so no JavaScript). The current page is marked `aria-current="page"` and styled.
3. **Messages become banners.** The `?msg=` code still goes through the existing allow-lists; a new helper classifies each code as success or problem, and the banner shows an icon-free text label ("Done" or "Problem") plus the message, with `role="status"` or `role="alert"`. A test fails if any message key is unclassified.
4. **Status chips** show the status in words, never colour alone, in colours that keep at least 4.5:1 contrast. Used on the inbox, the enquiry page and the dashboard list.
5. **Dashboard:** the period becomes three tab-style links (the current one marked), the figures become cards in a responsive grid (number large, label, one-line meaning), the status counts become a chip row linking to the inbox filtered by that status, and the fee block is a separate card visible to the owner only. Every figure and its definition stays as built in Phase 6; only the presentation changes. "No data" stays literal.
6. **Inbox:** each status chip in the filter row shows its count (spam excluded) and filters on click; the list sorts **new first, then newest** (decision in Open Questions); rows show reference, received date, name, number, status chip and referral state (none, pending, accepted, declined); the search box is large and labelled; an empty inbox explains what will appear and links to the request form.
7. **Enquiry page** is re-ordered into cards: summary header (reference, status chip, received date, source, spam mark) and a one-line "next step" hint (for example "Not yet passed to a tailor"); the customer's details; the copy-to-forward box; referrals (one card each, history included); change status and add a note; status history inside a native `<details>`; the anonymise action last, in a clearly marked warning box. Nothing is removed and no permission changes: the same forms, fields, routes and server rules.
8. **Tailor page:** a **publish checklist** at the top built from the existing `publishBlockers` rules: each requirement (approved, permission recorded, a consented WhatsApp or phone number, and so on) shown as done or missing with a link to the field that fixes it, and the Publish button explained when it cannot be used. The server still enforces every rule; the checklist only shows them. The tailors list gets status chips and a "needs attention" count (draft or missing something).
9. **Forms:** consistent spacing, labels above inputs, one clear primary button per form, secondary and destructive button styles (the anonymise and unpublish buttons are destructive style), inline hints, the same 44 px targets and visible focus as now.
10. **Empty states** for the tailors list, categories, areas, inbox and dashboard say what to do next in one or two sentences; the dashboard with no data at all shows a short "getting started" card (create categories and areas, add a tailor, record permission, publish).
11. **Demo data (local only):** `npm run db:demo` loads `seeds/demo.sql` into the local database only: clearly fake tailors whose names start with "[Demo]", a few categories and areas, a handful of enquiries in different statuses with referrals, and a few tap counts, so the whole site and admin can be seen filled in. `npm run db:demo:remove` deletes exactly those rows (matching the "demo-" slug and "AT-DEMO" reference prefixes). It is **not a migration**, never touches a remote database (the scripts use `--local` and a test asserts it), and uses obviously fake names and made-up numbers. It adds no photos (images live in R2). Before launch the owner runs the remove command; the check list in STATUS says so.
12. **Accessibility does not regress.** The existing axe suite (WCAG 2.2 AA) already covers every admin page; the new components must pass it unchanged. Admin pages are added to the 320 px reflow and text-spacing checks. Focus order follows visual order, there is no content hidden behind hover, and reduced motion is respected (no animation is added).
13. **Weight:** the admin stylesheet gets a byte budget set from its measured size plus about 20%, enforced in `npm run check` like the public budgets. No admin JavaScript.
14. **Copy:** all new admin text is English, plain, and says what happened and what to do next. No exclamation marks, no jargon (for example "Referral" stays because it is the product's own word, with a one-line explanation where first used).

## Objective

The owner or a manager opens the admin and immediately knows where they are, where everything else is, what needs their attention, and what to do next. A first-time user can go from an empty system to a published tailor following the on-screen checklist, and can see the whole product filled with demo data in one command. Success is judged by the owner clicking through, by unchanged behaviour (every existing test passes), and by axe still reporting no violations on every admin page.

## Tech stack

No new dependencies and no migration. Existing: Astro layouts and components, plain CSS, D1 (read-only additions: per-status counts and a referral-state column in the inbox query), Playwright and axe, Vitest.

## Commands

```
Look:       npm run preview          # builds and serves the styled app at http://localhost:4322 (restart after any rebuild)
Demo data:  npm run db:demo          # local database only; npm run db:demo:remove deletes it again
Check:      npm run check            # lint + typecheck + repo check + workers tests + build + integration tests
Browser:    npm run test:e2e         # axe on every admin page, reflow, CSP watcher, journeys
```

## Project structure

```
src/layouts/AdminLayout.astro      header bar, role-based links, current page, sign out, flash banner slot
src/styles/admin.css               the admin stylesheet (external file); tokens.css stays for the sign-in page
src/components/admin/              Flash.astro, StatusChip.astro, Card.astro, StatCard.astro, Checklist.astro, EmptyState.astro
src/modules/admin-ui/              nav.ts (links per permission), messages.ts (success or problem per code), next-step.ts (hint text from enquiry state)
src/pages/admin/**                 every page moves to AdminLayout and the components; behaviour and routes unchanged
seeds/demo.sql, scripts/demo.mjs   demo data and its local-only runner (add and remove)
tests/workers/, tests/integration/, e2e/   as before, plus new tests below
```

## Code style

Same as earlier phases. A small, boring component and a pure helper:

```astro
---
// StatusChip.astro: the status in words, with a class for colour
const { status } = Astro.props;
---
<span class={`chip chip--${status}`}>{en.enquiry.statuses[status]}</span>
```

```ts
// next-step.ts: one sentence about what to do next, from facts already on the page
export function nextStep(e: { status: Status; referralStates: string[]; anonymised: boolean }): string { /* ... */ }
```

## Testing strategy

- **Unit (workers):** nav links per role (owner, manager, editor, viewer see exactly the right set); message classification (every key in every dictionary is success or problem); `nextStep` for each state; per-status counts query; inbox sort (new first, then newest) and referral-state column; checklist builder against `publishBlockers`; demo seed safety (no `--remote`, every inserted row is a demo row, remove deletes exactly them and nothing else).
- **Integration (built Worker):** every admin page renders inside the layout with the right links for the role and the current page marked; success and problem banners use the right roles; the inbox filter chips show counts and filter; the dashboard cards show the same figures as before (reuse the Phase 6 expectations); the enquiry page keeps every form, field and route it had (a test lists them) and shows the warning box only to the owner; the tailor checklist lists exactly the missing requirements; the sign-in page still works without the nav; no admin page loads a script; the admin stylesheet is within its byte budget.
- **Playwright and axe:** all existing admin axe checks stay green; added: 320 px reflow and text-spacing on admin pages; keyboard path through the nav; a first-run journey as the throwaway owner (empty state, create category, create tailor, follow the checklist to publish) and a demo-data journey.
- **Manual (recorded):** the owner's own click-through plus screenshots at phone and desktop width. Recorded with what was not checked (screen readers, real phones).
- **Mutation checks** on: nav links per permission, banner role for problems, message classification, the owner-only warning box, the checklist rules, the demo remove query, the local-only guard.

## Boundaries

- **Always:** keep every route, form field, permission and server rule exactly as it is; keep text escaped and `?msg=` allow-listed; keep targets at least 44 px and focus visible; run the full test suite and axe before each commit; show the owner screenshots before calling a slice done.
- **Ask first:** a new dependency, any JavaScript, a schema change, dark mode, changing public pages, Tetum admin text, any change to permissions or roles.
- **Never:** remove a safety rule or confirmation to make a screen simpler; hide a destructive action's warning; run demo data against a remote database or ship it as a migration; use colour as the only signal; weaken the CSP.

## Success criteria

1. Every admin page (except sign-in) uses the shared layout with a header bar, role-correct links, the current page marked, the signed-in user and Sign out; on a 320 px screen nothing scrolls sideways.
2. Messages appear as banners that say Done or Problem in words and use the right live-region role; no message key is unclassified.
3. The dashboard shows the Phase 6 figures unchanged (same numbers, same "no data") as a card grid with period tabs and a status chip row; fees only for the owner.
4. The inbox shows per-status counts, sorts new first then newest, shows referral state, and has a helpful empty state.
5. The enquiry page is reorganised as specified with every previous form, field, route and rule intact; the anonymise action is last and visibly a warning, owner only.
6. A tailor page shows a publish checklist that matches the server's rules exactly (a test compares them), and the tailors list shows status chips.
7. Empty states exist for tailors, categories, areas, inbox and dashboard; a first-time user can reach a published tailor by following the screens.
8. `npm run db:demo` fills a local database with clearly fake data and `db:demo:remove` removes exactly it; neither can touch a remote database.
9. axe (WCAG 2.2 AA) is clean on every admin page, 320 px reflow and text spacing pass on admin pages, the CSP watcher is clean, the admin stylesheet and pages meet their byte budgets, and there is no admin JavaScript.
10. All earlier tests still pass unchanged (behaviour did not change); `npm run check` and `npm run test:e2e` pass; reviewers report no unresolved blockers; docs and STATUS are updated; the owner has clicked through and signed off.

## Open questions

1. **Visual direction:** reuse the public palette (warm paper background, maroon accent) so admin and site look like one product. Default: yes.
2. **Navigation:** a horizontal header bar that wraps on phones (no menu button, no JavaScript) rather than a sidebar. Default: header bar.
3. **Inbox order:** new enquiries first, then newest first, instead of strictly newest first. Default: new first.
4. **Demo data** may include published demo tailors visible on the local public site, always prefixed "[Demo]", removed by one command before launch. Default: yes.
5. **Public "what happens next" text** after sending a request (item 8 of the review) stays out of this phase. Default: out; it needs wording from you (OQ-05) and Tetum review.
6. **Where it goes in the plan:** insert as Phase 7b in IMPLEMENTATION_PLAN.md on approval. Default: yes.
