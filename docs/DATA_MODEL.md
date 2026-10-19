# Alfaiate TL — Conceptual Data Model

Status: Draft v0.2 · 2026-10-18 · Requirements: [PRD.md](PRD.md) · Architecture: [ARCHITECTURE.md](ARCHITECTURE.md)

This is a conceptual model: names and types guide the schema in Phase 2 and may be adjusted there; changes must be reflected here. Phase 2 implemented the schema as migrations 0001 and 0002; section 9 lists where they differ from this model. All tables carry `id`, `created_at`, `updated_at` unless stated.

## 1. Key distinctions

| Concept | Meaning | Where recorded |
|---|---|---|
| **Enquiry** | A customer's request submitted through the form. Not an appointment. | `enquiry` |
| **Referral** | The act of passing an enquiry to a specific tailor, with the tailor's response. | `referral` |
| **Confirmed appointment** | Agreed between tailor and customer directly. **Not modelled** in the MVP (BR-02/03). The most the system holds is the tailor's `accepted` response. | — |
| **Reported completed order** | A tailor (or customer) *says* the order was completed; recorded as a date and reporter on the referral. Not verified, not an order record. | `referral.completion_*` |

No order, measurement, garment, payment-of-customer or delivery entities exist (PRD §7.3).

## 2. Overview

```
admin_user 1─* session
admin_user 1─* audit_log
admin_user 1─* enquiry_status_log (changed_by)

tailor *─* garment_category   (tailor_category)
tailor *─* service_area       (tailor_area)
tailor 1─* portfolio_image
tailor 1─* referral
enquiry 1─* referral
enquiry *─1 garment_category   (requested)
enquiry *─1 service_area       (customer area)
enquiry 1─* enquiry_status_log
enquiry 1─* internal_note ; tailor 1─* internal_note ; referral 1─* internal_note   (one note table, nullable FKs)
```

## 3. Entities

### 3.1 `tailor` — Public (conditional) / private fields noted

**Purpose:** a participating tailoring business. **Lifecycle:** `draft` → `approved` + `published` ⇄ `unpublished`; `suspended`; `archived`.

| Field | Type | Visibility | Notes |
|---|---|---|---|
| slug | text, unique | public | URL identifier, stable |
| display_name | text, required | public | Shop or tailor name |
| description | text | public | Tailor-supplied unless marked verified |
| profile_photo_id | FK portfolio_image, null | public | Logo/photo; needs permission |
| shop_address_text | text, null | public if consented | Free text; no geocoding in MVP |
| home_visits | enum yes/no/unknown | public | "unknown" is not displayed as "no" |
| languages | text, null | public only if verified | |
| price_note | text, null | public | Short approximate-price statement, labelled |
| price_confirmed_on | date, null | public | When price info was last confirmed |
| whatsapp_e164 | text, null | public if consented | |
| phone_e164 | text, null | public if consented | |
| status | enum | private | `draft`, `approved`, `suspended`, `archived` |
| is_published | bool | private | Visibility switch |
| published_at | timestamp, null | private | |
| permission_recorded | bool, required to publish | private | BR-06 |
| permission_note | text | private | Who/when/how permission was given |
| permission_date | date, null | private | |
| contact_publish_consent | bool | private | Whether numbers/address may be shown (PRV-06) |
| verified_fields | list/JSON of field names | private (drives labels) | Which public facts the owner verified (BR-11) |
| fee_terms_text | text, null | private | FR-REF-08 agreed referral-fee terms |
| fee_terms_agreed_on | date, null | private | |
| private_contact_name / private_phone | text, null | private | For forwarding enquiries when different from public contact |

**Constraints:** slug unique; `is_published` true requires `status = approved` and `permission_recorded = true`; published tailors need at least a display name and one published contact method (application rule, confirmed 2026-10-19; see `publishBlockers` and `needs_contact`); whatsapp/phone stored in E.164.
**Relations:** many categories, many areas, many images, many referrals.

### 3.2 `garment_category` — Public

**Purpose:** garment or service type used for filtering (e.g. suits, dresses, alterations — the list is the owner's, OQ-10).
Fields: `slug` (unique), `name`, `description` (null), `sort_order`, `is_active`. Names are single-language now; per-language values can be added later (NFR-I18N-01).
**Constraints:** deleting is blocked while in use — deactivate instead. Inactive categories disappear from public filters.

### 3.3 `tailor_category` (join) — Public via tailor

`tailor_id`, `category_id`, optional `price_from`, `price_to`, `price_unit_note` (null), `price_source` (`tailor_supplied`|`verified`), `price_confirmed_on`. One row per tailor-category pair (unique). This holds category-specific prices, avoiding duplicate price fields on `tailor`. Prices are US dollars, stored as whole cents (OQ-14, answered 2026-10-19). Display must include the "approximate" label (FR-PRO-03).

### 3.4 `service_area` — Public

**Purpose:** neighbourhood or zone in Dili where a tailor's shop is or where they travel. Fields: `slug` (unique), `name`, `sort_order`, `is_active`. List defined by owner (OQ-10). Customers choose an area in the form; tailors link to the areas they serve.

### 3.5 `tailor_area` (join) — Public via tailor

`tailor_id`, `area_id`, `kind` (`shop_location` | `serves`). Unique per triple.

### 3.6 `portfolio_image` — Public if permitted

| Field | Notes |
|---|---|
| tailor_id | FK |
| file_key | Random identifier of the image variants in the object store (R2); no image bytes in the database |
| alt_text / caption | Required alt text |
| sort_order | |
| permission_granted | bool; public only when true (BR-06) |
| permission_date | date, null |
| is_visible | admin hide toggle |

**Lifecycle:** uploaded (private) → permitted & visible (public) → hidden or deleted; deleting removes files. Withdrawing permission removes public variants.

### 3.7 `enquiry` — **Private**

**Purpose:** one customer request (FR-ENQ). Never exposed publicly (BR-07).

| Field | Notes |
|---|---|
| reference_code | Unique, non-sequential, shown to customer |
| customer_name | required |
| contact_number_e164 | required |
| contact_channel | `whatsapp` \| `phone` \| `either` |
| garment_category_id | FK, null (or "other" note) |
| service_description | short text, null |
| area_id | FK, null — customer's neighbourhood |
| area_text | text, null — if not in the list |
| preferred_datetime_text | text, null — a preference, not a booking |
| notes | text, null |
| preferred_tailor_id | FK tailor, null — set when started from a profile |
| consent_shared_with_tailor | bool, must be true |
| consent_text_version | text |
| consent_at | timestamp |
| status | enum, see below |
| status_changed_at | timestamp |
| is_spam | bool |
| source | e.g. `form`, `profile:<slug>` |
| anonymised_at | timestamp, null |

**Status values** (PRD §7.2, manual): `new`, `contacted`, `referred`, `accepted_by_tailor`, `completed_reported`, `not_converted`, `cancelled`. Default `new`. No enforced transitions.
**Constraints:** consent must be true; reference unique; customer name/number/notes cleared when anonymised.
**Lifecycle:** created → worked by admin → closed (completed_reported / not_converted / cancelled) → retained until policy deadline → anonymised or deleted (PRV-04).
Customer reference images (if FR-ENQ-07 ships): `enquiry_attachment` (`enquiry_id`, `file_key`, private only).

### 3.8 `referral` — **Private**

**Purpose:** one enquiry passed to one tailor; the single place for forwarding, response, reported completion and fee. An enquiry may have several referrals over time (re-referral after decline); **one active** (`pending` or `accepted`) at a time, enforced in the INSERT and in every edit, not by the database.

| Field | Notes |
|---|---|
| enquiry_id, tailor_id | FKs |
| forwarded_at | Dili day `YYYY-MM-DD` text, null until forwarded |
| forwarded_via | `whatsapp` \| `phone` \| `sms` \| `in_person` \| `other` |
| fields_shared_note | text — what was shared (supports BR-08 audit) |
| tailor_response | `pending` \| `accepted` \| `declined` \| `no_response` |
| responded_at | Dili day text, null while `pending` |
| completion_reported_at | Dili day text, null — set when completion is reported |
| completion_reported_by | `tailor` \| `customer` \| `owner_confirmed` |
| order_value_note | text/amount, null — as reported, optional, used only if the fee is value-based |
| fee_basis_note | text — which agreed terms apply |
| fee_amount | integer cents (US dollars), null |
| fee_status | `not_due` \| `due` \| `paid` \| `waived` \| `disputed` |
| fee_paid_at | Dili day text, null |
| closed_reason | text, null |

**Constraints:** enquiry must have consent true and tailor must be `approved` at creation; `fee_amount` allowed only when `completion_reported_at` is set (database CHECK); `fee_status = paid` requires `fee_paid_at` (CHECK); `due` or `paid` also needs the tailor's `fee_terms_agreed_on` (BR-09, enforced in `src/modules/referral/fee.ts`). `fields_shared_note` and `closed_reason` are free text: the anonymise routine (FR-ADM-09, not built yet) must clear them.
**Why not duplicate status here:** the overall customer-facing lifecycle lives in `enquiry.status`; the referral stores only per-tailor facts. The admin UI never suggests or changes an enquiry status because of a referral edit (no workflow orchestration).

### 3.9 `enquiry_status_log` — Private

Append-only: `enquiry_id`, `from_status`, `to_status`, `changed_by` (admin_user), `changed_at`. Supports FR-ADM-07, M8 and reporting.

### 3.10 `internal_note` — Private

`body`, `author_id`, with exactly one of `enquiry_id`, `tailor_id`, `referral_id` set. Never rendered publicly.

### 3.11 `admin_user`, `session`, `audit_log` — Private

`admin_user`: `email` (unique), `password_hash` (plus KDF parameters/salt), `role` (`owner` | `manager` | `editor` | `viewer`; one role per user; the role-to-permission map is defined in code, see ARCHITECTURE §6), `is_active`, `last_login_at`. Constraint: at least one active `owner` must always exist.
`session`: `token_hash` (the raw token lives only in the cookie), `admin_user_id`, `expires_at`, `created_at`.
`audit_log`: append-only `admin_user_id`, `action` (e.g. `login`, `role_changed`, `tailor_published`, `enquiry_status_changed`), `entity_type`, `entity_id`, `at`; no customer data in the log text. `enquiry_status_log` (3.9) remains the detailed status history.
No customer or tailor identities exist. First owner is created by a seed script; further users by an owner.

### 3.12 Aggregates and operational tables

- `contact_click_daily` (`tailor_id`, `channel`, `date`, `count`) — aggregate counts only, no visitor data (ANA-02, PRV-05). Public: no.
- `rate_limit` (key hash, window, count) — transient; may live in memory instead.
- Reports (FR-RPT) are computed by queries, not stored.

## 4. Public vs private summary

| Public (only when published and permitted) | Private (admin only) |
|---|---|
| tailor public fields (D1), categories, areas, permitted images, price notes with labels | enquiry, referral, notes, status log, fee data, permissions and fee terms, admin_user, session, private contact fields, click aggregates |

## 5. Verification handling

`tailor.verified_fields` plus `price_source` express which public facts the owner verified; anything else is displayed as "information supplied by the tailor". No ratings, credentials or claims fields exist in the model; adding one requires a PRD change (BR-11).

## 6. Data minimisation and retention

- Customer data lives only in `enquiry` (and optionally attachments); `referral` stores no customer copy.
- Anonymisation keeps non-identifying fields (category, area, status, dates, fee data) for reporting.
- Retention period is an open decision (OQ-09). Backups follow the same policy.

## 7. Indexing and integrity notes

Index: `tailor(slug)`, `tailor(is_published, status)`, joins by FK, `enquiry(status, created_at)`, `enquiry(reference_code)`, `referral(enquiry_id)`, `referral(tailor_id, fee_status)`. Foreign keys enforced; migrations are reversible or have a documented restore path.

## 8. Requirement coverage

FR-PRO-* → tailor, tailor_category, tailor_area, portfolio_image · FR-ENQ-* → enquiry · FR-ADM-* → all admin tables · FR-REF-* → referral, tailor fee terms · FR-RPT-* → computed from enquiry, status_log, referral · SEC-05/BR-07 → public/private split · ANA-02 → contact_click_daily.

## 9. As implemented in migrations (Phase 2, `migrations/0001`, `0002`)

Where the migrations refine the conceptual model above, the migrations win; this list records the differences.

- Timestamps are UTC ISO-8601 text, booleans 0/1, enums CHECK-constrained text, foreign keys enforced. Prices (`price_from`/`price_to`, `fee_amount`) are whole minor units of one site-wide currency (US cents, OQ-14 answered).
- `session` also has `last_seen_at` (idle expiry) and `expires_at` (absolute expiry). CSRF tokens are derived, not stored.
- `tailor`: publishing is refused by CHECK unless `status = 'approved'` and `permission_recorded = 1`. "At least one published contact method" stays an application rule (it was Proposed).
- `enquiry`: `customer_name`, `contact_number_e164` and `contact_channel` are nullable only when `anonymised_at` is set; a CHECK requires them present before, and requires name, number, notes and `service_description` to be cleared after. Consent must be 1.
- `referral`: triggers refuse creation for a tailor that is not `approved`, and for an enquiry that is anonymised (FR-REF-02, AC-12). CHECKs: `fee_amount` only after `completion_reported_at`; a completion needs `completion_reported_by`; `fee_status = 'paid'` needs `fee_paid_at`.
- `internal_note`: exactly one of `enquiry_id`, `tailor_id`, `referral_id` (CHECK); `author_id` is required and users are deactivated, never deleted.
- `audit_log` and `enquiry_status_log` are append-only by convention (the code has no update path); no database triggers enforce it.
- `rate_limit` uses an integer `window_start` (epoch seconds).
- **Files:** `0001_schema.sql` holds `admin_user`, `session`, `audit_log`, `tailor`, `garment_category`, `tailor_category`, `service_area`, `tailor_area`, `portfolio_image`. `0002_enquiry_referral.sql` holds `enquiry`, `enquiry_status_log`, `enquiry_attachment`, `referral`, `internal_note` (moved here because it references enquiry and referral), `contact_click_daily`, `rate_limit`.
- **Last owner:** "at least one active owner" (§3.11) is not a database constraint. It is enforced by one guarded UPDATE in `src/modules/auth/users.ts`, so a direct SQL edit can bypass it.
- **Password hash:** `admin_user.password_hash` holds the whole `pbkdf2-sha256$iterations$salt$hash` string; there are no separate KDF columns. `admin_user.email` is unique, case-insensitive (`COLLATE NOCASE`), length > 3.
- **Phone shape:** `whatsapp_e164`, `phone_e164` and `contact_number_e164` have a CHECK for E.164 shape (leading `+`, non-zero first digit, digits only, 8-16 characters). The Timor-Leste rule (AD-10: `+670` + 8 digits starting 7 or 3) is applied in application code by `normalisePhone`, not in the database.
- **Dates** (`price_confirmed_on`, `permission_date`, `fee_paid_at`, `contact_click_daily.date`, ...) are plain text. `tailor.verified_fields` defaults to `'[]'` and is `json_valid`-checked.
- **Referral triggers** run on INSERT and on UPDATE of `tailor_id` / `enquiry_id`, so a referral cannot be moved to an unapproved tailor or an anonymised enquiry.
- **Anonymising** (CHECK) requires `customer_name`, `contact_number_e164`, `notes`, `service_description`, `area_text` and `preferred_datetime_text` to be NULL. The anonymise routine (FR-ADM-09, Phase 5/6) must also clear `internal_note.body` and `referral.fields_shared_note` for that enquiry and delete its `enquiry_attachment` rows and their private R2 objects; the schema does not do that by itself.
- **Delete behaviour:** CASCADE for `session`, `tailor_category`, `tailor_area`, `portfolio_image`, `referral.enquiry_id`, `enquiry_status_log`, `enquiry_attachment`, `internal_note`, `contact_click_daily`. RESTRICT for `tailor_category.category_id`, `tailor_area.area_id`, `referral.tailor_id`, `internal_note.author_id`, `enquiry.garment_category_id`, `enquiry.area_id`. SET NULL for `audit_log.admin_user_id`, `enquiry_status_log.changed_by`, `enquiry.preferred_tailor_id`, `tailor.profile_photo_id`.
- **Indexes** beyond §7: `session_user`, `tailor_category_category`, `tailor_area_area`, `portfolio_image_tailor`, `enquiry_status_log_enquiry`, `internal_note_*`.
- **Phase 3 conventions (no schema change):** `tailor.verified_fields` holds a JSON list drawn from `description, shop_address_text, home_visits, languages, price_note, whatsapp, phone`, in that order; editing a verified value removes it from the list. `portfolio_image.file_key` is the 32-hex base of the three R2 objects `tailor/<tailor_id>/<file_key>/<variant>.jpg`. `tailor.profile_photo_id` may only point to a photo with permission that is visible, and is cleared otherwise. `tailor_category.price_*` are US cents (OQ-14). `internal_note` rows for a tailor can be added by any role with `tailor.edit`, even when the tailor is published.

- **Phase 6 conventions (no schema change):** `referral.forwarded_at`, `responded_at`, `completion_reported_at` and `fee_paid_at` are `YYYY-MM-DD` text meaning the Dili calendar day (UTC+9), typed by an admin; `fee_amount` is integer cents (US dollars); a referral is never deleted and a new one is created on reassignment; only one referral per enquiry may be `pending` or `accepted` (checked in the INSERT, not by the database); `enquiry.consent_shared_with_tailor` is always 1 (CHECK), so the consent refusal in practice means an anonymised enquiry; audit actions `referral_created`, `referral_updated`, `referral_fee_updated` (referral id only).
- **Phase 5 conventions (no schema change):** `enquiry.source` is `form` or `profile:<slug>`; `reference_code` is `AT-` plus 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`; `consent_text_version` is `consent-2026-10-v1-<language>`; the first `enquiry_status_log` row has `from_status` NULL, `to_status` `new` and `changed_by` NULL; spam toggles write only an `audit_log` row (`enquiry_spam_changed`), and status changes write `enquiry_status_changed` (ids only).
