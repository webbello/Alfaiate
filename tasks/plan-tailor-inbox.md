# Plan: Tailor inbox in the portal

Spec: [docs/SPEC-tailor-inbox.md](../docs/SPEC-tailor-inbox.md) (approved 2026-10-25, drafts for OQ-I1..I4 accepted). Tasks: [todo-tailor-inbox.md](todo-tailor-inbox.md). Requirements FR-TPO-09..13 (amend FR-TPO-03, BR-08).

## Order and dependencies

```
T1 referral columns (shared_to_inbox_at, decline_reason) ──> T2 inbox module (rules + tests)
T2 ──> T3 staff buttons on the referral (+ WhatsApp tailor message)
T2 ──> T4 portal: Requests for you tab, list, item, Accept/Decline
T2 ──> T5 owner alert when a tailor answers
T3, T4, T5 ──> T6 isolation + privacy matrix, e2e at 375 px, docs, reviewers, deploy staging
```

One task at a time, one commit each, only when `npm run check` exits 0; `npm run test:e2e` before committing any page change; deploy with `npm run deploy:staging`; edits through `node scripts/replace-once.mjs`.

## Decisions that shape the work

- **Migration:** production has not been deployed, so the two columns go into `migrations/0016_referral.sql` (one file per table). Staging already ran that file, so staging gets a one-off `ALTER TABLE` run by hand (written in the task and in docs/DEPLOY.md); production will create the table with the columns.
- **No new admin route:** the two staff actions are new `action` values on the existing referral POST (`referral.edit` already guards it).
- **Portal routes (new):** `/portal/requests` (GET) and `/portal/requests/[id]` (GET, POST for the answer), both `tailor` access and listed in the portal route inventory.
- **Visibility is one query:** every read joins `referral.tailor_id = session.tailorId` AND `shared_to_inbox_at IS NOT NULL`; the customer fields are selected only when `tailor_response = 'accepted'` and the enquiry is open and not anonymised.

## Risks

| Risk | Mitigation |
|---|---|
| A tailor sees another tailor's referral | One query path with the tailor-id join; id-guessing tests; mutation check removing the join |
| A number shows before Accept | State matrix test per state; mutation check |
| Details linger after the request is closed | Visibility computed on every read from the current enquiry status and anonymised flag, not stored |
| Staging database out of step with the migration file | Documented one-off ALTER on staging; production applies the file fresh |
