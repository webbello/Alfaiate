# Spec: Tailor inbox in the portal (owner request 2026-10-25)

Status: **Approved by the owner 2026-10-25 (the draft answers to OQ-I1..I4 accepted). Plan: [tasks/plan-tailor-inbox.md](../tasks/plan-tailor-inbox.md).** · Source: the owner, after referring a request to tailor Zeb on staging: "the tailor didn't get any notification or any enquiry section" · Builds on [SPEC-tailor-portal.md](SPEC-tailor-portal.md) (FR-TPO-01..08) and the referral workflow (FR-REF-*, BR-08) · **Amends** FR-TPO-03 and BR-08 (see "Rule changes"). Requirement IDs continue the numbering; none is renumbered.

## Objective

Today a tailor never sees a request: staff copy the customer's details and send them by WhatsApp, the tailor replies there, and staff record the answer by hand. The owner wants the tailor to find the request in their own portal and answer it there, so staff only refer, nudge and watch.

Success: staff press **Send to the tailor's inbox** on a referral; the tailor opens the portal, sees what is being asked (not who is asking), presses **Accept** or **Decline**; only after **Accept** do they see the customer's name and number; the referral shows the tailor's answer to staff with no retyping; the customer's details are never visible to a tailor who did not accept, to any other tailor, or after the request is closed.

## Rule changes (need the owner's yes)

- **FR-TPO-03** says a signed-in tailor sees no enquiry, referral or customer data. New rule: a tailor sees **only referrals addressed to them that staff have sent to their inbox**, and customer contact details **only after that tailor accepts**. Everything else in FR-TPO-03 stands (no other tailor, no admin page, no fees, no notes, no statuses, no other customers).
- **BR-08** (staff copy the agreed details and send them to the tailor by hand) stays valid; the inbox is a second way, controlled by one explicit staff action. The customer's consent wording already says their name, number and request are shared with a suitable partner tailor, so no new consent text is needed; staff can still copy and send by hand.
- Out-of-scope list (PRD 7.3): this is **not** automatic dispatch or matching (staff choose the tailor and press the button), **not** chat, and it adds no payments. Statuses of the request stay manual: the tailor's answer is recorded on the referral only; staff still move the request's status.

## Requirements

- **FR-TPO-09** A referral has a staff action **Send to the tailor's inbox** (needs `referral.edit`). It makes that one referral visible to that one tailor and writes an audit entry. Until then the tailor sees nothing. A second action, **Take back from the inbox**, hides it again (if the tailor has not accepted).
- **FR-TPO-10** The portal has **Requests for you** (a tab and an overview count of requests waiting for an answer). Each item shows, **before accepting**: the reference code, the type of clothing, the neighbourhood (area name only) and the preferred time. It does **not** show the customer's name, number, street or landmark, or free-text notes.
- **FR-TPO-11** The tailor can **Accept** or **Decline** (Decline with an optional reason from a short fixed list: too far, too busy, not my kind of work, other). One answer per referral; a tailor cannot change it, staff can. The answer and time are stored on the referral (`tailor_response`, `responded_at`) and audited with the tailor as actor. The tailor's own sign-in only: the referral is looked up by the signed-in tailor's id, never by a number in the address alone.
- **FR-TPO-12** After **Accept**, the item also shows what the customer agreed to share: name, number and preferred channel, street or landmark, and notes (the same fields as the staff "forwarding text"), with a WhatsApp and a call link. After **Decline** the contact details are never shown. If staff anonymise the request, mark it cancelled or not converted, or take the referral back, the details disappear from the inbox and the item says the request is closed.
- **FR-TPO-13** Staff are told: the existing "referrals waiting for a tailor to reply" count updates by itself, the request page shows the tailor's answer, and a best-effort owner alert (reference only, the same channel as new requests) says "Tailor accepted" or "Tailor declined". The tailor is told by staff: the **WhatsApp tailor** button's message changes to point at the inbox ("You have a new request in your Alfaiate TL portal: AT-XXXX. Sign in: <link>"). The site sends no message by itself.

## Data and migration notes (owner approves before they are written)

- A nullable `shared_to_inbox_at` timestamp on `referral`; optionally `decline_reason`. The table is `referral`; before production they can be folded into its file, **after production they are ALTER migrations** (kept minimal).
- No new table. A new permission is not needed (`referral.edit` already exists); the tailor side uses the tailor session guard.
- No new dependency.

## Boundaries

- Always: tailor id only from the session; every inbox query joins `referral.tailor_id = session.tailorId` AND `shared_to_inbox_at IS NOT NULL`; CSRF on Accept and Decline; no customer data before Accept, in any URL, log, alert, sitemap or analytics; rate limits like other portal posts; WCAG 2.2 AA; English only (Tetun later); tests alongside code; update STATUS, DECISIONS, PRD.
- Ask first: the migration; anything that shows a tailor more than FR-TPO-10 and FR-TPO-12 list; any automatic status change.
- Never: show one tailor's referral to another; show a number before Accept; send a message from the site; let a tailor see fees, notes by staff, the request status or other referrals of the same request.

## Testing strategy

- Isolation (extend `portal-isolation.test.ts`): tailor A never sees B's referral by id guessing, by list, or by the accept URL; a referral not yet sent to the inbox is invisible; an anonymised or closed request shows no details.
- Privacy matrix: the page for each state (not accepted, declined, accepted, closed) contains or lacks name, number, street, landmark and notes exactly as FR-TPO-10 and FR-TPO-12 say.
- Mutation checks, seen failing: remove the `tailor_id` join; show the number before accept.
- Integration: Accept and Decline write the referral and the audit log with the tailor as actor; staff's request page shows the answer; the alert carries the reference only.
- e2e and axe at 375 px for the inbox and an item in each state.

## Success criteria (checkable)

1. A referral the staff did not send is invisible to the tailor (FR-TPO-09).
2. Before Accept the page has no customer name, number, street, landmark or notes; after Accept it has exactly the forwarding-text fields (FR-TPO-10, FR-TPO-12).
3. Another tailor gets "not found" for the item and for the Accept address (FR-TPO-11).
4. Accept and Decline update the referral and are audited as the tailor; staff see the answer without typing it.
5. Anonymise, cancel, not-converted and take-back all remove the details from the tailor's view (FR-TPO-12).
6. The owner alert and the WhatsApp tailor message hold the reference only (FR-TPO-13).

## Open questions (for the owner)

- OQ-I1 Draft: the tailor sees only clothing type, neighbourhood and time before accepting (name, number, street, landmark and notes only after). Is that the right line, or should they see more up front?
- OQ-I2 Draft: Decline reasons are a short fixed list (too far, too busy, not my kind of work, other). Keep, or no reason?
- OQ-I3 Draft: a tailor cannot change their answer; staff can. Agreed?
- OQ-I4 Draft: after **Accept** the details stay visible until the request is closed, cancelled, anonymised or taken back. Should they also disappear after a fixed time (for example 30 days)?

## Notes from the build and review (2026-10-25)

- Answering is rate limited per tailor account (30 an hour) and refused for a tailor who is no longer approved (reviewer findings 1 and 3).
- Staff can record a tailor's acceptance by hand on the referral form (`tailor_response` = accepted); for a referral that is already in the inbox the tailor then sees the customer's details. That is deliberate and needs `referral.edit`.
