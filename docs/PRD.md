# Alfaiate TL — Product Requirements Document

| | |
|---|---|
| Status | Draft v0.2 for owner review |
| Date | 2026-10-16 |
| Related | [ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) |

**Conventions.** Requirement IDs are stable; never renumber, only deprecate. Priority: **Must** (MVP launch blocker), **Should** (MVP, can slip with owner approval), **Future** (not MVP). Items tagged **[Assumption]**, **[Proposed]** or **[Confirm]** are not confirmed decisions. Nothing in this document is implemented yet.

---

## 1. Product overview

Alfaiate TL is a mobile-first website that helps people in Dili, Timor-Leste find local tailors. It combines:

1. A curated directory of approved, participating tailors.
2. A profile per tailor: specialties, example work, approximate prices, location or service area, contact details.
3. Direct customer-to-tailor contact by WhatsApp or phone.
4. An optional "request a tailor at home" form for doorstep measurements.
5. A lightweight admin interface for the owner to manage listings, enquiries and referral outcomes.
6. A potential referral fee on completed orders, subject to agreement with each tailor.

The owner is a **customer-acquisition and referral intermediary, not the tailoring provider**. Tailors confirm availability, agree price, measure, stitch, and arrange fitting and delivery.

## 2. Problem statement

- Customers must visit or phone several shops to learn who makes what, at what price, and whether anyone will come to them. **[Assumption]** — not validated by research.
- Traditional tailors, with the owner's existing connections (>10), have little or no digital presence and no online way to receive new customers.
- The owner cannot afford to coordinate every order manually.

## 3. Business opportunity and hypotheses

No market-size or revenue figures are claimed. The MVP exists to test these hypotheses cheaply:

| ID | Hypothesis | Tested by |
|---|---|---|
| H1 | Customers will use an online directory to choose a tailor and contact them directly. | Contact-click events, enquiries |
| H2 | Some customers will submit a doorstep-measurement request. | Enquiry count |
| H3 | Partner tailors will respond to forwarded enquiries and accept some. | Referral acceptance rate |
| H4 | Tailors will report completed orders honestly enough for referral revenue to be measured. | Reported completions, owner's reconciliation |
| H5 | Tailors will agree to pay a referral fee. | Signed/recorded fee agreements, fees recorded as paid |
| H6 | Admin effort per enquiry is low enough to sustain. | Owner's time log (manual) |

## 4. Goals and success metrics

**Goals:** present tailors professionally; help customers discover them; generate qualified enquiries; offer doorstep requests; track enquiry → referral → reported completion; validate demand before further investment; keep running costs and admin effort low.

**Metrics.** No target values are set here; the owner sets thresholds before the pilot (see OQ-01). All are computable from the data model or the analytics in §13.

| ID | Metric | Definition |
|---|---|---|
| M1 | Enquiries received | Count of submitted doorstep requests per period |
| M2 | Referral rate | Enquiries with ≥1 referral ÷ enquiries received |
| M3 | Tailor acceptance rate | Referrals accepted ÷ referrals forwarded |
| M4 | Reported conversion rate | Enquiries with status "Completed, as reported" ÷ enquiries received |
| M5 | Active participating tailors | Published tailors who received ≥1 referral in the period |
| M6 | Direct contact clicks | WhatsApp/phone click events on profiles (an indicator, not a confirmed contact) |
| M7 | Referral revenue | Sum of fees recorded as paid |
| M8 | Time to first contact | Enquiry created → status first moved to "Contacted" or "Referred" |
| M9 | Fee collection rate | Fees paid ÷ fees due on reported completions |

Reported figures are tailor-reported and manually recorded; they must be labelled as such.

## 5. Target users and needs

| User | Needs | Constraints |
|---|---|---|
| **Customer** — person in Dili seeking custom garments, stitching, alterations | See who exists, what they make, rough prices, where they are; contact quickly via WhatsApp/phone; optionally request a home visit; no account | Mostly mobile, possibly slow/costly data; accustomed to traditional shops; languages may be Tetum, Portuguese, English, Indonesian **[Confirm]** |
| **Partner tailor** — traditional shop | Receive enquiries with minimal effort; be shown fairly; keep control of what is published | May not own a smartphone, may not use WhatsApp, may lack digital skills. Participation must be possible by phone/SMS/WhatsApp message alone |
| **Administrator** — the owner | Add/edit/publish tailors; see and triage enquiries; forward them; record outcomes and fees; see simple counts | Likely a single user, part-time, small screen possible |

## 6. User journeys

**J1 Browse and contact directly.** Homepage or category page → directory (filter) → profile → tap WhatsApp or Call. No account.

**J2 Request a tailor at home.** CTA (any page) → form → consent + disclaimer → submit → acknowledgement (reference code, "not a confirmed appointment", what happens next).

**J3 Admin processes an enquiry.** New enquiry → admin reviews → (optionally contacts customer) → assigns tailor → forwards (WhatsApp/phone/SMS, outside the system) and records it → tailor responds → admin updates status → tailor reports completion (by phone/message) → admin records completion, fee, payment.

**J4 Admin onboards a tailor.** Agree terms and obtain permissions offline → create profile (draft) → upload approved photos → record permission and verification → publish.

## 7. Scope

### 7.1 Functional requirements

#### Public site

| ID | Requirement | Priority |
|---|---|---|
| FR-PUB-01 | Homepage explains the service, how it works, and links to directory and request form. | Must |
| FR-PUB-02 | Homepage and directory state plainly that Alfaiate TL introduces customers to independent tailors and does not guarantee availability, quality or timing (BR-01, BR-04). | Must |
| FR-PUB-03 | A prominent "Request a tailor at home" call to action appears on the homepage, directory and every profile. | Must |
| FR-PUB-04 | Garment/service category pages list published tailors offering that category. | Must |
| FR-PUB-05 | Layouts are mobile-first and responsive. | Must |
| FR-PUB-06 | Basic pages: about, how it works/FAQ, privacy notice, terms (content owned by the owner; see OQ-08). | Must |

#### Directory

| ID | Requirement | Priority |
|---|---|---|
| FR-DIR-01 | Anyone can browse published tailors without an account. | Must |
| FR-DIR-02 | Directory filters: garment category, service area, offers home visits. | Must |
| FR-DIR-03 | Directory cards show name, photo/logo (if permitted), main specialties, area, home-visit flag, price indication if verified/supplied. | Must |
| FR-DIR-04 | Empty-result state offers clearing filters and the request form. | Must |
| FR-DIR-05 | Free-text search. | Future |

#### Tailor profile

| ID | Requirement | Priority |
|---|---|---|
| FR-PRO-01 | Profile supports, where available: display/shop name, photo or logo, description, specialties, garment categories, portfolio images, approximate prices, shop location or service areas, contact details, home visits offered, languages (only if verified), listing status. | Must |
| FR-PRO-02 | Only fields with data are rendered; no placeholders implying data. | Must |
| FR-PRO-03 | Prices are shown only if supplied by the tailor, labelled "approximate" or as a range, with the date last confirmed where recorded. | Must |
| FR-PRO-04 | Each of WhatsApp and phone has its own tap-to-contact link, shown only if that number exists and the tailor consented to publish it. WhatsApp links carry a prefilled message that names the tailor's listing (no customer data). | Must |
| FR-PRO-05 | Each published fact is marked verified or tailor-supplied; verified-by-owner is the only state shown as "verified". Ratings, credentials and service claims are not shown unless verified (BR-10, BR-11). | Must |
| FR-PRO-06 | Unpublished or unknown profiles return a not-found page; they are not indexable. | Must |
| FR-PRO-07 | Each profile has unique title, description and structured data (see ARCHITECTURE §11). | Must |
| FR-PRO-08 | Portfolio images appear only when permission is recorded (BR-06). | Must |

#### Enquiry / doorstep request

| ID | Requirement | Priority |
|---|---|---|
| FR-ENQ-01 | Form collects only: name, phone or WhatsApp number (and which it is), requested garment/service, general neighbourhood/area, preferred date/time (optional), notes (optional), consent. Optional preselected tailor when started from a profile. | Must |
| FR-ENQ-02 | Submission requires an explicit, unticked-by-default consent checkbox stating that the details will be shared with a suitable partner tailor, linking to the privacy notice. | Must |
| FR-ENQ-03 | Form and acknowledgement state that submitting is a request, **not** a confirmed appointment, and that the tailor must confirm availability directly. | Must |
| FR-ENQ-04 | On success, show an acknowledgement with a reference code and next steps. No promise of timing beyond what the owner has approved (OQ-05). | Must |
| FR-ENQ-05 | Server-side validation with clear, field-level, plain-language errors; user input is preserved on error. | Must |
| FR-ENQ-06 | Spam prevention without forced accounts or CAPTCHAs that harm accessibility (honeypot, rate limit, optional privacy-friendly challenge) (SEC-07). | Must |
| FR-ENQ-07 | Optional reference images (limited number/size/type). | Should |
| FR-ENQ-08 | Notify the owner of new enquiries (channel per OQ-06, e.g. email). The notification carries only the reference code and an admin link, no customer data. | Should |

#### Administration

| ID | Requirement | Priority |
|---|---|---|
| FR-ADM-01 | Admin area requires authentication; all admin routes and actions are protected (SEC-01). | Must |
| FR-ADM-02 | Create, edit, and view tailor profiles, including draft state. | Must |
| FR-ADM-03 | Publish/unpublish a tailor. Publishing requires recorded publication permission (BR-06) and an approved status (BR-05). | Must |
| FR-ADM-04 | Manage garment categories and service areas (create, rename, order, deactivate). | Must |
| FR-ADM-05 | Upload, caption, reorder, hide and delete portfolio images per tailor, each with a permission flag. | Must |
| FR-ADM-06 | List and view enquiries with filtering by status and search by reference/name/phone. | Must |
| FR-ADM-07 | Manually update enquiry status among the values in §7.2. Status changes are logged with time. | Must |
| FR-ADM-08 | Add internal notes to enquiries and tailors (never public). | Must |
| FR-ADM-09 | Delete or anonymise an enquiry on request or per retention policy (PRV-04). | Should |

#### Referral tracking

| ID | Requirement | Priority |
|---|---|---|
| FR-REF-01 | Assign an enquiry to a tailor, creating a referral. | Must |
| FR-REF-02 | Assignment is blocked if the enquiry lacks sharing consent or the tailor is not approved. | Must |
| FR-REF-03 | Record when and how (WhatsApp, phone, SMS, other) the enquiry was forwarded. | Must |
| FR-REF-04 | Record the tailor's response: pending, accepted, declined, no response. | Must |
| FR-REF-05 | Record tailor-reported completion with date and who reported it. This is a report, not verified. | Must |
| FR-REF-06 | Record referral fee: amount (or agreed rule reference), due, and payment status (not due / due / paid / waived) with paid date. | Must |
| FR-REF-07 | Reassign after a decline or no response by creating a new referral; history is retained. | Should |
| FR-REF-08 | Record per-tailor fee agreement terms (text + date agreed) on the tailor. | Must |

#### Reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-RPT-01 | Admin dashboard shows counts for a selectable period: enquiries by status, referrals forwarded/accepted, completions as reported, fees due/paid. | Must |
| FR-RPT-02 | Dashboard shows M2, M3, M4, M5, M7 and M9 where computable. | Should |
| FR-RPT-03 | CSV export of enquiries/referrals (admin only). | Future |

### 7.2 Enquiry statuses (manual)

`New` → `Contacted` → `Referred` → `Accepted by tailor` → `Completed, as reported`; terminal alternatives `Not converted`, `Cancelled`. Admin may set any status at any time (no enforced order, no automation). `Completed, as reported` means a tailor said so; it is not an order the platform manages.

### 7.3 Explicitly excluded from the MVP

Customer accounts; tailor self-service registration or dashboards; booking calendars/real-time availability; online payments, escrow, holding funds; in-app chat; automatic dispatch/matching; delivery fleet; production management; fabric inventory; automated commission collection; native apps; AI recommendations; ratings and reviews. Unrequested extras (loyalty, coupons, blogs, marketplaces) are also out of scope.

### 7.4 Future enhancements (not designed here)

English/Tetum content (design for it now, ship later — NFR-I18N-01); tailor-side notifications beyond manual messages; simple verified reviews; tailor self-service profile updates; online booking; CSV export; richer analytics.

## 8. Business rules

| ID | Rule |
|---|---|
| BR-01 | The platform introduces customers to independent tailoring businesses; it is not the tailoring provider. |
| BR-02 | Final price, materials, measurements, completion dates and payment are agreed directly between customer and tailor. |
| BR-03 | A doorstep request is an enquiry, not a confirmed appointment. |
| BR-04 | The platform does not guarantee a tailor's availability, garment quality or completion date. |
| BR-05 | Only participating, approved tailors may be publicly listed. |
| BR-06 | Tailors must give permission before their photographs, business details and work samples are published; permission is recorded per tailor (and per image). |
| BR-07 | Customer contact details and enquiry content are never publicly exposed. |
| BR-08 | Customer information is shared with a tailor only after disclosure and the customer's consent, and only the necessary fields. |
| BR-09 | Referral fees and payment terms are agreed with each tailor before any fee is recorded as due. |
| BR-10 | Referral completion and revenue reporting are manual. Completion is tailor-reported unless the owner independently confirms it. |
| BR-11 | Every public fact is either verified by the owner or labelled as supplied by the tailor; unverified prices, ratings, credentials and service claims are not published as fact. |
| BR-12 | Customers are never charged by the platform in the MVP. **[Proposed]** |

**Operational policies to agree before launch** (see also OQ list): referral-fee terms (rate/flat, trigger, payment timing, disputes, what counts as an introduced customer, attribution window, repeat customers); tailor participation agreement and removal/suspension rules; response-time expectation for tailors and for the owner; what to do when a tailor does not respond; handling a customer who contacts a tailor directly (attribution of direct-contact customers is not trackable in the MVP — decide whether fees apply only to form-based referrals); complaint handling; verification standard for each public claim; photo/consent process and takedown; customer-data retention and deletion; enquiry-sharing channel and tailor data-handling expectations; service-area boundaries; languages; dormant-listing policy; legal/tax/regulatory review (no conclusions are drawn here).

## 9. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-PERF-01 | Public pages are server-rendered/static-friendly, with images resized and lazy-loaded, aiming for fast loads on mid-range phones and slow mobile data. Specific budgets set in IMPLEMENTATION_PLAN P7 and measured, not assumed. |
| NFR-A11Y-01 | Target WCAG 2.2 AA for public pages: readable type, sufficient contrast, labelled form fields, keyboard operability, touch targets, alt text for portfolio images. |
| NFR-SEO-01 | Crawlable, unique URLs for directory, categories, areas and profiles; sitemap; metadata; unpublished content excluded. |
| NFR-I18N-01 | All user-visible strings are separable from templates and content fields can later hold per-language values. Only one language ships in MVP unless OQ-07 says otherwise. |
| NFR-COST-01 | Operating cost must stay low and predictable: Cloudflare usage plus domain, with any paid plan or add-on approved by the owner (ARCHITECTURE AD-02). |
| NFR-MNT-01 | Maintainable by one developer; one deployable Worker; minimal dependencies. |
| NFR-REL-01 | Daily automated backup of database and images, with a documented, tested restore. |
| NFR-BRW-01 | Works on current mobile browsers and degrades gracefully without client-side JavaScript for browsing and the request form. |

## 10. Privacy and security requirements

| ID | Requirement |
|---|---|
| SEC-01 | Admin authentication with strong password hashing, secure session cookies, logout, and login rate limiting. Admin accounts are few and created by an owner or seed script; no public sign-up. |
| SEC-02 | CSRF protection on all state-changing forms; output escaping; parameterised queries. |
| SEC-03 | All traffic over HTTPS; secrets only in environment/config outside version control. |
| SEC-04 | Uploads validated by actual type and size, re-encoded, stored in the image store under generated keys. |
| SEC-05 | Customer data is exposed only on authenticated admin pages; no customer data in URLs, logs, analytics or public caches. |
| SEC-06 | Admin pages send `noindex` and no-store caching headers. |
| SEC-07 | Spam controls: honeypot, per-IP rate limit, time-trap, optional privacy-friendly challenge; failures must not silently lose a genuine enquiry. |
| SEC-08 | Security headers (CSP, frame, referrer, content-type options). |
| SEC-09 | Role-based access control: each admin route and action requires a named permission; roles are least-privilege, deny by default; only roles with enquiry permissions can see customer data; the last owner cannot be removed; sign-ins, role changes, publishing and status changes are logged. |
| PRV-01 | Collect the minimum fields in FR-ENQ-01. |
| PRV-02 | Privacy notice states what is collected, why, who receives it (the selected partner tailor), retention, and how to request deletion. |
| PRV-03 | Record consent text version and timestamp with each enquiry. |
| PRV-04 | Retention period for enquiries and a deletion/anonymisation procedure are defined before launch (OQ-09). |
| PRV-05 | Analytics are cookieless/aggregate; no personal data. |
| PRV-06 | Tailor business contact details are published only with consent (BR-06). |

Legal applicability of any Timor-Leste data-protection or consumer rules has **not** been assessed here; see OQ-08.

## 11. Edge cases and failure states

| Case | Expected behaviour |
|---|---|
| Tailor has no WhatsApp, only phone | Show only the call link. |
| Tailor has no published photos | Profile renders without gallery; no stock imagery implying their work. |
| Filters match nothing | FR-DIR-04. |
| Customer submits twice | Rate limit / duplicate detection (same phone + garment within a window) flags it for admin; both are stored, none lost. |
| Invalid phone number | Field error; accepts local Timor-Leste formats and +670 **[Confirm]**. |
| Spam submission | Rejected or flagged silently; admin can mark spam. |
| Database/storage failure on submit | Friendly error with the tailor-contact fallback; no false success message. |
| Upload too large / wrong type | Clear error; nothing partially stored. |
| Tailor unpublished while a referral is open | Referral stays visible to admin; public page 404s. |
| Tailor declines or never answers | Admin sets no-response/declined and may refer to another tailor (FR-REF-07). |
| Customer withdraws or asks deletion | Status Cancelled; deletion per FR-ADM-09. |
| Customer contacts tailor directly | Not tracked; outside referral accounting (OQ-04). |
| Enquiry in an area no tailor covers | Admin marks Not converted with a note. |
| Admin forgets password / account compromised | Out-of-band reset by the developer; sessions invalidated. |
| Tailor reports completion but disputes fee | Status stays "as reported"; fee flagged disputed in notes; handled per agreement. |

## 12. Acceptance criteria

Criteria are testable statements; full test mapping is in the implementation plan.

| ID | Covers | Criterion |
|---|---|---|
| AC-01 | FR-PUB-01/02/03 | Homepage shows the explanation, disclaimer and request CTA without scrolling past the first content block on a 375 px-wide viewport **[Proposed]**. |
| AC-02 | FR-DIR-01/02/03 | Given published and draft tailors, an anonymous visitor sees only published ones, and each filter narrows results correctly, singly and combined. |
| AC-03 | FR-PRO-01/02/03/05/08 | A profile with missing optional data renders without empty sections; prices carry an "approximate"/range label; images without recorded permission are not shown. |
| AC-04 | FR-PRO-04 | WhatsApp link is `https://wa.me/<digits>` with prefilled text and phone link is `tel:`; each appears only when that number exists. |
| AC-05 | FR-PRO-06 | Requesting an unpublished tailor URL returns 404 and the page is absent from the sitemap. |
| AC-06 | FR-ENQ-01/02/03/05 | The form cannot be submitted without required fields and consent; errors name the field; the not-confirmed disclaimer is visible beside the submit button. |
| AC-07 | FR-ENQ-04 | A valid submission stores one enquiry with status New, consent version and timestamp, and shows a reference code. |
| AC-08 | FR-ENQ-06 / SEC-07 | Honeypot-filled and over-rate-limit submissions create no normal enquiry; a normal submission after them still works. |
| AC-09 | FR-ADM-01 / SEC-01 / SEC-09 | Every admin route and action returns redirect/401 when unauthenticated, and 403 when the role lacks the permission (e.g. editor cannot read enquiries or publish). |
| AC-10 | FR-ADM-03 | Publishing a tailor without recorded permission or approval is refused with an explanation. |
| AC-11 | FR-ADM-07 | Admin can set each of the seven statuses; each change is logged with timestamp. |
| AC-12 | FR-REF-01/02 | Referring an enquiry with no sharing consent, or to an unapproved tailor, is refused. |
| AC-13 | FR-REF-03/04/05/06 | Forwarded time/method, tailor response, reported completion and fee/payment status can be recorded and edited, and history is preserved. |
| AC-14 | FR-RPT-01 | Dashboard counts equal counts computed directly from the records for a seeded dataset. |
| AC-15 | SEC-05 / BR-07 | No public route, sitemap, analytics event or log line contains customer name, phone or notes. |
| AC-16 | NFR-REL-01 | A backup is restored to a clean environment and the site and admin function with the restored data. |
| AC-17 | NFR-A11Y-01 | Automated accessibility checks pass on key pages and the form is completable by keyboard alone. |

## 13. Analytics and reporting requirements

- **ANA-01** Aggregate, cookieless page analytics (or server-log aggregation) for visits to home, directory, profile, request form.
- **ANA-02** Count events for WhatsApp/call link taps per tailor (no visitor identity). These are intent signals, not confirmed contacts.
- **ANA-03** Form funnel counts: form viewed, submitted, failed validation.
- **ANA-04** Admin dashboard per FR-RPT-01/02, with every manually-sourced figure labelled "reported".
- **ANA-05** Time period selection (this month, last 30 days, all time).

## 14. Risks, assumptions and open questions

**Assumptions**

- A1: Customers primarily use mobile phones and WhatsApp.
- A2: Most partner tailors can be reached by phone or WhatsApp, some only by phone.
- A3: One to a few admin users with role-based access (ARCHITECTURE §6); a single owner account is enough at launch.
- A4: Owner will gather tailor content, photos and permissions offline.
- A5: Referral fee agreements are possible with at least some tailors.
- A6: No payment of any kind passes through the platform.

**Risks**

| Risk | Mitigation |
|---|---|
| Customers bypass the form and tailors under-report completions, hiding revenue | Manual reconciliation; fee terms tied to introduced customers; accept imperfect measurement in MVP |
| Tailors don't respond; customers have poor experience | Response expectation in agreement; admin follow-up; honest disclaimer |
| Low-quality or outdated profile data harms trust | Verified/unverified labelling; "last confirmed" dates; unpublish dormant listings |
| Photos used without permission | Per-image permission flag; takedown process |
| Customer data mishandled by tailors after sharing | Share minimum fields; agreement clause; privacy notice |
| Admin overload | Dashboard of "New" enquiries; notifications; small tailor pool |
| Legal/tax/data-protection obligations unknown | Obtain advice before launch; no conclusions assumed |
| Hosting latency for local users | Check actual load times from Dili during pilot |

**Open questions for the owner**

| ID | Question |
|---|---|
| OQ-01 | What thresholds define pilot success for M1–M9, and over what period? |
| OQ-02 | Which tailors will be in the pilot, and have they agreed to be listed? |
| OQ-03 | What referral fee model (percentage, flat, tiered), trigger and payment timing? |
| OQ-04 | Do fees apply only to form-based referrals, or also to customers who contact a tailor directly from the site? |
| OQ-05 | What response-time promise (if any) may the site make to customers? |
| OQ-06 | How will the owner be notified (email, WhatsApp, other) and how are enquiries forwarded to tailors? |
| OQ-07 | Which language(s) at launch — Tetum, English, Portuguese, Indonesian? |
| OQ-08 | Who prepares privacy notice and terms, and is legal advice on data protection and consumer/tax obligations available? |
| OQ-09 | How long are enquiries retained before deletion/anonymisation? |
| OQ-10 | Which service areas (neighbourhood list) and category list should exist at launch? |
| OQ-11 | Does the owner have a domain, WhatsApp Business number and brand assets? |
| OQ-12 | Should customers be able to pick a specific tailor in the request form, or only a general request? (Draft assumes both are allowed.) |
| OQ-13 | Who verifies tailor facts and how (visit, photo, phone)? |
| OQ-14 | Which currency and price format are displayed (USD or other)? **Answered 2026-10-19:** US dollars, always labelled approximate. |
| OQ-15 | Who needs admin access at launch, and are the proposed roles (owner, manager, editor, viewer) right? **Answered 2026-10-18:** yes, four roles; one owner account at launch. |

## 15. MVP launch criteria

All **Must** requirements implemented and their acceptance criteria passing, plus:

1. At least the owner-defined minimum number of tailors published with recorded permissions and verified or labelled facts (number per OQ-02).
2. Privacy notice and terms published; retention policy decided (OQ-08, OQ-09).
3. Fee terms agreed with each tailor that will be referred paying enquiries, or an owner-approved decision to run a no-fee pilot.
4. Backup and restore tested (AC-16).
5. Security checks and accessibility checks complete (AC-09, AC-15, AC-17).
6. Owner has walked through J1–J4 end to end on a staging copy.
7. Pilot success thresholds written down (OQ-01).
