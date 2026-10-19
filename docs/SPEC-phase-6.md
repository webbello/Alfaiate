# Spec: Phase 6 — Referral tracking and basic reporting

Status: Approved 2026-10-19 (all six open-question defaults accepted) · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 6 · [PRD.md](PRD.md) §2 (M1–M9), §7.2, FR-REF-01–08, FR-RPT-01/02, BR-08/09/10, AC-12/13/14, ANA-04/05 · [DATA_MODEL.md](DATA_MODEL.md) §3.8, 3.9, §9 · [ARCHITECTURE.md](ARCHITECTURE.md) §4, 6

**Requirements:** FR-REF-01–07 (FR-REF-08 already built in Phase 3), FR-RPT-01, FR-RPT-02, ANA-04, ANA-05, BR-08/09/10, SEC-05, SEC-09. **Acceptance:** AC-12, AC-13, AC-14.
**Owner answers for this phase** (2026-10-19, logged in DECISIONS.md): fee fields are **owner only** (`fee.view`); fee amounts are **recorded by hand, never calculated** (OQ-03/OQ-04 stay open); the dashboard lives on **/admin**, with periods this month / last 30 days / all time using **Dili dates**.

**Scope check.** One journey: the owner or a manager records what happened to an enquiry after it arrives (referral, forwarding, response, completion, fee) and reads the totals. Two slices that share the `referral` table: (A) referral records on the enquiry page, (B) the dashboard. **Not in this phase:** CSV export (FR-RPT-03, Future), anonymise or delete (FR-ADM-09), per-tailor reports, automatic status changes or suggestions, automatic forwarding or messaging, fee calculation, notes on referrals.

## Assumptions

1. **No new migration.** `referral`, its checks and the four triggers (approved tailor, consent and live data) already exist, as do `enquiry_status_log`, `audit_log`, `contact_click_daily` and the tailor's fee terms (`fee_terms_text`, `fee_terms_agreed_on`). The database already refuses a referral without consent, for an anonymised enquiry, to an unapproved tailor (AC-12), a fee before a reported completion, and `paid` without a paid date.
2. **Where it lives.** Referrals are shown and edited on the existing enquiry detail page (`/admin/enquiries/[id]`), as a "Referrals" section. Nothing new is public. No customer data leaves the admin session.
3. **Who may do what** (role map unchanged): `referral.edit` (owner, manager) creates referrals and records forwarding, response and reported completion; `fee.view` (owner only) is needed to see or change any fee field. A manager's page never receives fee columns at all: the query for non-owners does not select them. Editors and viewers get 403 as for enquiries.
4. **Three new admin routes**, each with its own named permission, registered in `ADMIN_ROUTES`: `POST /admin/enquiries/[id]/referrals` (create, `referral.edit`), `POST /admin/enquiries/[id]/referrals/[rid]` (forwarding, response, completion, `referral.edit`), `POST /admin/enquiries/[id]/referrals/[rid]/fee` (fee, `fee.view`). The route inventory test learns the `[rid]` segment. Every mutation checks CSRF and the permission server-side.
5. **Manual only (BR-10, house rule).** Nothing changes an enquiry's status because a referral changed, and nothing is sent. The enquiry status stays a separate manual action (Phase 5).
6. **Referral rules (FR-REF-01/02/07):** a referral can be created only for an enquiry that has sharing consent and is not anonymised, to a tailor whose status is `approved` (the page lists only approved tailors, the enquiry's preferred tailor first; the database triggers remain the backstop and their refusal becomes a plain message). **One active referral at a time:** a new referral is refused while another referral for the same enquiry has response `pending` or `accepted`; after `declined` or `no_response` a new one can be created and the old one stays as history (FR-REF-07). Referrals are never deleted.
7. **Forwarding (FR-REF-03):** forwarded date, method (`whatsapp`, `phone`, `sms`, `in_person`, `other`) and a free-text note of which fields were shared (BR-08). The consented-fields text from Phase 5 is what the owner copies; the note is typed by hand.
8. **Response (FR-REF-04):** `pending`, `accepted`, `declined`, `no_response`, with a response date. If a non-pending response is saved with no date, today's Dili date is used.
9. **Reported completion (FR-REF-05, BR-10):** a date and who reported it (`tailor`, `customer`, `owner_confirmed`). It is labelled "reported" everywhere. `owner_confirmed` can be chosen only by the owner, because it means the owner independently confirmed it. Clearing the report is allowed (it is a correction) and is audited.
10. **Fees (FR-REF-06, BR-09):** owner enters the amount in US dollars (stored in cents, like prices), a basis note, the status (`not_due`, `due`, `paid`, `waived`, `disputed`) and the paid date. Rules: an amount needs a reported completion (database check, plain message); `paid` needs a paid date (database check); **`due` or `paid` needs the tailor's fee terms to have a recorded agreement date** (BR-09: terms agreed before any fee is recorded as due), otherwise a plain refusal. No calculation, suggestion or default amount. The order-value note is optional free text, shown to the owner only.
11. **Dates are Dili dates.** Forwarded, response, completion and paid dates are plain `YYYY-MM-DD` text meaning the Dili calendar day (UTC+9, no daylight saving), entered with date inputs. Enquiry creation times are UTC timestamps and are converted to Dili days for period boundaries.
12. **Audit, ids only:** `referral_created`, `referral_updated`, `referral_fee_updated` rows in `audit_log` with the referral id; no amounts, names or notes. Edits overwrite the fields (the audit row records that, and who, not the old values). The history the plan requires is that referrals are never deleted and reassignment adds a new row; per-field before/after history is not kept (Open Question 3).
13. **Dashboard (FR-RPT-01/02, ANA-04/05):** on `/admin`, for roles with `enquiry.view` (manager, owner); editors and viewers see no figures. Period selector by GET `?period=month|30d|all` (default `month`, the current Dili calendar month; `30d` is the last 30 Dili days including today). Spam enquiries are excluded everywhere. Every figure that comes from manual records is labelled "reported". Fee figures (due, paid, M7, M9) are shown to the owner only and are not even queried for a manager.
14. **Figures and their exact definitions** (each shown with its numerator and denominator so a ratio never stands alone):
    - **M1 Enquiries received:** enquiries created in the period, not spam.
    - **Enquiries by status:** of those M1 enquiries, count per current status.
    - **Referrals forwarded:** referrals whose forwarded date is in the period. **Referrals accepted:** of those, response `accepted`. **M3** = accepted ÷ forwarded.
    - **M2 Referral rate:** M1 enquiries with at least one referral ÷ M1.
    - **Completions, as reported:** M1 enquiries with status `completed_reported`. **M4** = that ÷ M1.
    - **M5 Active tailors:** distinct published tailors with a referral forwarded in the period.
    - **M6 Direct contact clicks:** sum of `contact_click_daily.count` for dates in the period (an indicator, not a confirmed contact).
    - **M8 Time to first contact:** for M1 enquiries, hours from creation to the first status-log row whose new status is `contacted` or `referred`; shown as an average and how many enquiries it covers.
    - **Fees due / paid (owner only):** sum of `fee_amount` for referrals with a reported completion date in the period and status `due` (and `disputed`, shown separately); **M7 Referral revenue** = sum of `fee_amount` with status `paid` and paid date in the period; **M9 Fee collection rate** = paid amount ÷ (paid + due + disputed amount) for referrals with a reported completion in the period, waived excluded.
    - A ratio with a zero denominator shows "no data", never 0%.
15. **AC-14 is proven by a seeded dataset** whose expected figures are written out by hand in the test (not recomputed with the same SQL), plus a cross-check that compares each figure with a plain count over the same rows.
16. **Design:** reuse the admin layout and plain forms; tables and definition lists; no charts, no JavaScript, no new dependency. Admin text stays English (as in Phases 2–5). Accessibility is checked with axe on the changed admin pages.

## Objective

After an enquiry arrives, the owner or a manager can record, in a few forms, that it was passed to a tailor, how and when, what the tailor answered, that the tailor reported completion, and (owner only) what fee was agreed and whether it was paid. A reassignment after a decline keeps the earlier referral visible. The `/admin` dashboard then shows the pilot's numbers for a chosen period, each defined plainly and labelled "reported" where a person typed it in, so the owner can judge whether the service works. The database and the permissions, not the page, enforce consent, approval and fee rules; no fee is calculated or suggested; nothing happens automatically.

## Tech stack

No new dependencies and no migration. Existing: Astro admin pages, D1, `requirePermission`, CSRF, `audit()`, `dollarsToCents`, `formatMoney`.

## Commands

```
Check:      npm run check        # lint + typecheck + workers tests + build + integration tests
Browser:    npm run test:e2e     # extended with a referral journey and axe on the changed admin pages
```

## Project structure

```
src/modules/referral/      queries.ts (list for an enquiry; fee columns only when asked), create.ts (rules, one active), update.ts (forwarding, response, completion), fee.ts (fee rules incl. BR-09), dates.ts (Dili day helpers, period ranges), messages.ts
src/modules/reporting/     metrics.ts (the figures in assumption 14), period.ts (period parsing and ranges)
src/pages/admin/enquiries/[id]/referrals.ts                 POST create        (referral.edit)
src/pages/admin/enquiries/[id]/referrals/[rid].ts           POST update        (referral.edit)
src/pages/admin/enquiries/[id]/referrals/[rid]/fee.ts       POST fee           (fee.view)
src/pages/admin/enquiries/[id].astro      gains the Referrals section
src/pages/admin/index.astro               gains the dashboard
src/modules/auth/admin-routes.ts          three entries; concretePath learns [rid]
tests/workers/, tests/integration/, e2e/   as before
```

## Code style

Same as Phases 4–5: explicit columns, bound parameters, discriminated-union results, plain message codes shown through an allow-list, comments only for the why.

```ts
export type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: 'no_consent' | 'not_approved' | 'already_active' | 'not_found' | 'invalid' };
```

## Testing strategy

- **Workers/D1 unit tests:** create (consent missing, anonymised, unapproved tailor, active referral exists, after decline and after no response allowed, history kept, unknown ids); update (each method and response, default response date, completion needs a date and a reporter, `owner_confirmed` refused to a manager, clearing is audited); fee (amount needs a completion, `paid` needs a date, `due` and `paid` need agreed terms (BR-09), `waived` and `not_due` do not, dollars to cents, non-owner refused); audit rows hold ids only; query for a non-owner contains no fee columns; Dili date helpers (midnight edges, month and 30-day ranges); metrics (AC-14): a seeded dataset with hand-computed expected values for every figure, spam excluded, period edges inclusive and exclusive on the right sides, zero denominators give "no data", fee figures absent for a manager.
- **Integration tests (built Worker):** the three routes: anonymous 302, editor/viewer 403, manager allowed except the fee route (403), owner allowed, missing CSRF 403, bad ids 404, bad input gives a message and changes nothing; AC-12 end to end (no consent, unapproved tailor); a manager's enquiry page contains no fee text or amounts while the owner's does; the dashboard shows figures to manager and owner, fee figures only to the owner, nothing to editor/viewer; customer name and number appear nowhere on the dashboard; the role matrix and route inventory include the new routes.
- **Playwright and axe:** record a referral, response and completion as the throwaway owner, then see the dashboard figures change; axe on the enquiry page with referrals and on `/admin`.
- **Mutation checks** on: consent and approval refusals (app and trigger), the one-active rule, owner-only `owner_confirmed`, the BR-09 rule, each route's permission, fee columns hidden from managers, spam exclusion, each metric's period edge and denominator.

## Boundaries

- **Always:** enforce rules in the database and the module, not only the form; check permission and CSRF on every route; keep fee data out of queries and pages for roles without `fee.view`; keep customer data out of URLs, logs and the audit log; label manual figures "reported"; use fake data in tests; run `npm run check` before each commit.
- **Ask first:** a migration, a new dependency, changing the role map, any fee calculation or default amount, CSV export, automatic status changes or suggestions, any message sent to a tailor or customer.
- **Never:** compute or suggest a fee; present a reported completion as verified; show fees to managers, editors or viewers; delete a referral; send customer data anywhere; change an enquiry's status because a referral changed.

## Success criteria

1. AC-12: a referral for an enquiry without sharing consent (or anonymised), or to a tailor who is not approved, is refused with a plain message, by the module and by the database.
2. AC-13: forwarded date and method, shared-fields note, response, reported completion with reporter, and fee amount and status with paid date can be recorded and edited; reassignment after a decline or no response creates a new referral and the old one stays visible; every change writes an id-only audit row.
3. AC-14: the dashboard figures for a seeded dataset equal the hand-written expected values and a direct count over the same rows, for each period choice.
4. A manager never receives a fee value (page, query or response), and the fee route refuses them; only the owner can set `owner_confirmed`.
5. No `due` or `paid` fee can be recorded for a tailor without an agreed-terms date (BR-09).
6. Nothing in this phase changes a status, sends a message or computes a fee.
7. Editors and viewers see no referral or dashboard data (403 or no figures).
8. `npm run check` and `npm run test:e2e` pass; privacy-scope, docs-sync and security reviewers report no unresolved blockers; docs and STATUS are updated.

## Open questions

1. **One active referral at a time** (assumption 6): refuse a new referral while another is `pending` or `accepted`. Default: yes.
2. **`owner_confirmed` is owner-only** (assumption 9). Default: yes.
3. **Edit history:** overwrite fields and keep only an id-only audit row (assumption 12), rather than storing every old value. Default: audit row only, since fees are small in number and the owner reads the dashboard, not a ledger.
4. **BR-09 gate on `due`/`paid`** needs the tailor's fee-terms date from Phase 3 (assumption 10). Default: enforce.
5. **Metric definitions** (assumption 14), especially M8 as an average in hours, M9 by amount excluding waived, and period membership by the date each event was recorded. Default: as written.
6. **Fee terms and amounts are still the owner's to decide** (OQ-03/OQ-04): this phase records but never interprets them; a fee model must be agreed before any fee is relied on.
