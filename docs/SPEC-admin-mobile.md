# Spec: Admin on the phone (owner request 2026-10-25)

Status: **Approved by the owner 2026-10-25 (draft answers to OQ-A1..A4 accepted; phone model still unknown). Plan: [tasks/plan-admin-mobile.md](../tasks/plan-admin-mobile.md). Nothing is built yet.** · Source: the owner's grill session of 2026-10-25 (questions Q1 to Q19 of the admin round, all answered) · Builds on [SPEC-admin-redesign.md](SPEC-admin-redesign.md), FR-ADM-01..09, SEC-01 · Requirement IDs below are new and continue the numbering; none is renumbered.

## Objective

The owner runs Alfaiate TL alone, mostly from a phone and from anywhere, and may hand daily work to one helper later. The admin must answer "what needs me now?" in five seconds, let a request be answered and tracked with taps rather than typing, keep the owner signed in on a trusted phone, and stay safe when signed in from many places.

Success: from a phone the owner can, without opening a menu or typing a number, see what is waiting, WhatsApp a customer or tailor, change a request's status, approve a join request and send its sign-in link; a helper account can be added with limited rights and given requests to handle; and every sign-in path stays protected (strong password, optional two-step code, a way to end all sessions).

## Capability map

| Phase | Module | What it delivers | Depends on |
|---|---|---|---|
| A | `admin-phone` | Phone layout, dashboard counters, reply-speed flag, WhatsApp buttons, global search, confirmations, reply-time figure | existing admin |
| B | `admin-access` | Keep me signed in (30 days), add to home screen, extra owner alerts | A not required; can ship alongside |
| C | `admin-team` | Helper role, "assigned to" on requests | A (list filters) |
| D | `admin-2fa` | Two-step sign-in for owner and manager, recovery code | none |

Build order: A and B, then **go live** (owner alone), then C and D before any helper is added. Each phase gets its own plan and tasks; this document is the shared contract.

## Requirements

### Phase A, admin-phone

- **FR-ADM-10** The dashboard opens with four counters, each linking to its list: new requests waiting, join requests waiting, tailors ready to publish (page marked ready, not yet published), shop orders opened today. Below: the status chart and period filter (7, 30, 90 days) as today.
- **FR-ADM-11** The dashboard shows "average time to first reply": the mean time from a request arriving to its first status change away from New, over the chosen period; "no replies yet" when none.
- **FR-ADM-12** A request still New after 24 hours shows a visible "waiting 24h+" flag (text, not colour alone), and the New list shows the oldest first.
- **FR-ADM-13** A request has a "WhatsApp customer" button and a referral has a "WhatsApp tailor" button, opening WhatsApp with the saved number and a prefilled message containing the reference code only (no name, address or notes; FR-PRO-04 stands). With no number the button is replaced by a plain line saying so.
- **FR-ADM-14** One search box in the top bar finds requests, tailors and shop orders by reference, name or phone, returning only what the signed-in role may see (enquiry.view for requests and orders, tailor.edit or higher for tailors). Phone numbers are matched as typed or normalised; nothing is logged (PRV rules).
- **FR-ADM-15** On a phone (below the existing mobile breakpoint) a bottom bar shows Enquiries, Shop orders, Tailors and More (the rest of the menu). On a laptop the sidebar is unchanged.
- **FR-ADM-16** On a phone a request is a card: reference, area, garment and time waiting at the top; four large buttons (WhatsApp, change status with one-tap chips, assign once phase C exists, add a note); full details below. Touch targets are at least 44 px.
- **FR-ADM-17** Only hard-to-undo actions ask "are you sure?": publish or unpublish a tailor, switch a tailor sign-in off, anonymise customer details. Approving a join request and changing a status do not ask.

### Phase B, admin-access

- **FR-ADM-18** Sign-in has a "Keep me signed in on this device" tick. Ticked: a 30-day session (renewed on use). Not ticked: the current 30-minute idle and 12-hour limits (SEC-01). Switching an account off or "Sign out everywhere" ends every session; a password change ends all other sessions.
- **FR-ADM-19** The admin can be added to a phone's home screen: a web app manifest named "Alfaiate Admin", an icon, standalone display, scoped to `/admin` only; no service worker and no offline mode. The public site is unchanged.
- **FR-ADM-20** Owner alerts (the existing notifier channel, reference or name plus a link, never customer details): new requests, new join requests and "tailor says the page is ready" already exist; this adds new shop orders. Each has its own title.

### Phase C, admin-team

- **FR-ADM-21** A fifth role, **Helper**: can view the dashboard, view and update requests, edit referrals, view shop orders, and view tailors and products; cannot publish, edit tailors or products, see fees, delete, or manage users. Added to the fixed role table (OQ-15: roles stay fixed in code, no custom roles).
- **FR-ADM-22** A request has one optional assignee chosen from active admin users. The list shows the assignee and filters Mine, Unassigned and each person; the dashboard gains "assigned to me". Every change is an audit entry. Only requests can be assigned; there is no automatic assignment and no alert to the assignee.
- **FR-ADM-23** Anyone who may update requests may assign them; an inactive user cannot be assigned, and switching a user off clears nothing silently (the request keeps its assignee, shown as inactive, and appears under Unassigned-or-inactive for the owner).

### Phase D, admin-2fa

- **FR-ADM-24** Owner and manager accounts can turn on two-step sign-in with an authenticator app (6-digit time-based code, RFC 6238). It is required for the owner once switched on, with ten one-time recovery codes shown once. Codes and secrets are never logged; the secret is stored encrypted-at-rest by Cloudflare like all D1 data and is never returned after setup. A wrong code is rate-limited like a wrong password. The owner can reset a manager's two-step setting; resetting the owner's needs `owner:reset` (out of band).

## Data and migration notes (all need owner approval before they are written)

- Phase A: no new table. One query for the dashboard figures and a search query over existing tables.
- Phase B: a flag on the session row for the long session; manifest and icon files under `public/`.
- Phase C: an `assigned_to` column on `enquiry` (nullable reference to `admin_user`, on delete set null) and the `helper` value in the role list. **After production exists these are real ALTER migrations** (owner: "we will have ALTER once code is in production"); keep each as small as possible. Before production they may be folded into the table files.
- Phase D: a table for a user's two-step secret and recovery-code hashes (own file named for the table).
- No new dependency is planned: TOTP uses WebCrypto (HMAC-SHA-1) and a small base32 helper.

## Boundaries

- Always: check a named permission server-side on every route and mutation; CSRF on every POST; English only; WCAG 2.2 AA (axe in e2e); reflow at 320 px; no customer data in alerts, URLs, logs or the search box's URL; tests alongside code; update STATUS and DECISIONS.
- Ask first: every migration; any dependency; any new permission name; anything that changes what a role can see.
- Never: automatic orchestration of statuses (the manual-workflow rule stands); a native app; payments; storing a customer's data in an alert; custom roles.

## Testing strategy

- Unit: priority and flag rules (24h), first-reply time, assignee rules, TOTP against the RFC test vectors, recovery-code use-once.
- Integration (built Worker): each role sees and cannot do exactly what FR-ADM-21 lists (the route-inventory and permission matrix tests extend); search returns nothing outside a role's rights; session length with and without the tick; alerts carry only reference or name plus link.
- e2e and axe: dashboard and request card at 375 px; bottom bar reachable and not covering content or focus; confirmations only on the three actions.
- Mutation check for each new permission guard, seen failing, before the commit message cites it.

## Success criteria (checkable)

1. At 375 px the dashboard shows the four counters without scrolling, each a working link (FR-ADM-10).
2. A request waiting over 24 hours is flagged and sorted first (FR-ADM-12).
3. WhatsApp buttons open the right number with a message holding only the reference (FR-ADM-13).
4. Search finds a request by reference, a tailor by name and an order by reference for the owner, and a viewer gets no request or order results (FR-ADM-14).
5. The bottom bar appears below the breakpoint only (FR-ADM-15); no admin page scrolls sideways at 320 px.
6. A ticked sign-in survives 29 days idle and ends at 30; an unticked one ends after 30 minutes idle (FR-ADM-18).
7. The admin installs to a home screen with the name "Alfaiate Admin" and opens at `/admin` (FR-ADM-19).
8. The Helper role passes the permission matrix exactly as FR-ADM-21; assigning, filtering and clearing work and are audited (FR-ADM-22).
9. A new account with two-step on cannot sign in with the password alone; a recovery code works once (FR-ADM-24).

## Open questions (for the owner)

- OQ-A1 Which ntfy titles and wording for the four alert types? (Draft: "New request", "New order", "New join request", "Page ready".)
- OQ-A2 Should a helper see the order list's items and totals, or only that an order exists? (Draft: items and totals, as the owner does.)
- OQ-A3 Home-screen icon: the wordmark on the site green, or a plain "A" tile? (Draft: wordmark tile.)
- OQ-A4 Which phone and browser does the owner use? It decides how the install and the 30-day session are tested.
