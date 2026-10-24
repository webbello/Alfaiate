# Deploying Alfaiate TL to Cloudflare

A step-by-step guide for the owner. Nothing here needs programming: you copy a command, paste it into the Terminal, and read the answer. Each step says what you should see. If something looks different, stop and ask before going on.

**Order of work:** (A) accounts and tools, (B) create the database and storage, (C) fill in the settings, (D) put the **staging** copy online and test it, (E) repeat for **production**, (F) domain, safety rule and first owner, (G) smoke test, (H) backups and rollback. Finish with the checklist **"What I need from you"** at the end. [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) lists the same decisions as tick boxes.

**Names used in this guide (use them exactly; they are already written into `wrangler.jsonc`):**

| What | Staging (test copy) | Production (the real site) |
|---|---|---|
| Worker (the website program) | `alfaiate-tl-staging` | `alfaiate-tl-production` |
| D1 database | `alfaiate-tl-staging` | `alfaiate-tl-prod` |
| R2 bucket, private photos | `alfaiate-tl-staging-media-private` | `alfaiate-tl-media-private` |
| R2 bucket, public photos | `alfaiate-tl-staging-media-public` | `alfaiate-tl-media-public` |

Binding names inside the program (never change them): `DB`, `MEDIA_PRIVATE`, `MEDIA_PUBLIC`.

**Cost to expect.** The sign-in uses a deliberately slow password check (PBKDF2, 600000 rounds). It needs more computing time than the free Workers plan gives, so use **Workers Paid (about US$5 a month)**. R2 also asks for a payment card when you first switch it on; the free allowance is large and a small site normally stays inside it.

---

## A. Account and tools

### A1. Create the Cloudflare account
1. Open <https://dash.cloudflare.com/sign-up>. Sign up with your email and a long, unique password. Use a password manager.
2. Confirm your email (Cloudflare sends a link).
3. Switch on two-step sign-in: top right profile icon → **My Profile** → **Authentication** → **Two-factor authentication**. This account will hold your customers' data, so do not skip it.
4. Add the paid plan: left menu **Workers & Pages** → **Plans** → choose **Workers Paid** and add your card.

### A2. Install Node.js and the project tools (once, on your Mac)
1. Install Node.js version **22.22 or newer** from <https://nodejs.org> (the "LTS" download). Open the installer and accept the defaults.
2. Open **Terminal** (press Cmd+Space, type `Terminal`, press Enter) and check:

```bash
node --version
```

You should see `v22.22.0` or a higher number. Then go to the project and install its parts:

```bash
cd ~/Sites/AlfaiateTL
```

```bash
npm install
```

3. Sign in to Cloudflare from the Terminal. A browser window opens; click **Allow**:

```bash
npx wrangler login
```

Check it worked (it prints your email and account):

```bash
npx wrangler whoami
```

---

## B. Create the databases and storage

Create the **staging** items first. You can create each item in the dashboard (clicks) **or** with a command. Pick one way per item; do not do both.

### B1. D1 databases (the data: tailors, requests, staff accounts)

**Dashboard way.** Left menu **Storage & databases** → **D1 SQL database** → **Create database**. Name: `alfaiate-tl-staging`. Location: **Asia-Pacific** if offered (closest to Dili). Click **Create**. Repeat with the name `alfaiate-tl-prod`.

**Command way:**

```bash
npx wrangler d1 create alfaiate-tl-staging --location apac
```

```bash
npx wrangler d1 create alfaiate-tl-prod --location apac
```

Each command prints a block with a `database_id` (a long code like `0a1b2c3d-...`). In the dashboard the same code is on the database's page as **Database ID**.

**Copy each ID into `wrangler.jsonc`.** Open the file `wrangler.jsonc` in the project (TextEdit works, or any code editor). Find these two words and replace each with the matching ID, keeping the quotation marks:

- `REPLACE_ME_STAGING_DATABASE_ID` → the ID of `alfaiate-tl-staging`
- `REPLACE_ME_PRODUCTION_DATABASE_ID` → the ID of `alfaiate-tl-prod`

Do **not** touch the all-zero ID at the top of the file (`00000000-...`); that one is for the practice database on your own Mac. The IDs are not secrets and may stay in the project.

### B2. R2 buckets (the photos)

**Dashboard way.** **R2 object storage** → (first time: add your card, choose the free plan) → **Create bucket**. Create these four, one at a time, each with location **Asia-Pacific** (or **Automatic**) and storage class **Standard**:

`alfaiate-tl-staging-media-private`, `alfaiate-tl-staging-media-public`, `alfaiate-tl-media-private`, `alfaiate-tl-media-public`

**Command way:**

```bash
npx wrangler r2 bucket create alfaiate-tl-staging-media-private
```

```bash
npx wrangler r2 bucket create alfaiate-tl-staging-media-public
```

```bash
npx wrangler r2 bucket create alfaiate-tl-media-private
```

```bash
npx wrangler r2 bucket create alfaiate-tl-media-public
```

Check:

```bash
npx wrangler r2 bucket list
```

All four names must appear.

### B3. Keep the "public" bucket closed to the internet
The website itself decides which photo may be shown, one request at a time, and checks permission and publication status in the database each time. The bucket must therefore **never** be opened directly. For **each** of the four buckets: dashboard → **R2** → click the bucket → **Settings**:
- **Public Development URL (r2.dev)**: must say **Disabled**. If it says Enabled, click **Disable** and confirm.
- **Custom Domains**: must be empty. Do not add one.

(The name "public" only means "photos that may appear on public pages". They still go through the website.)

---

## C. Settings (variables and secrets)

There are two kinds. **Variables** are ordinary settings kept in `wrangler.jsonc`. **Secrets** are private values; they are typed once into Cloudflare and never written in any file.

### C1. Variables (in `wrangler.jsonc`)
Each environment (`staging`, `production`) has its own `"vars": { ... }` line. Variables are **not** shared between them, so add each setting to both where wanted. Edit the line, keeping commas and quotation marks exactly. Example for production with a phone number added:

```
"vars": { "SITE_URL": "https://yourdomain.tl", "PUBLIC_LANGUAGES": "en", "SITE_INDEXABLE": "true", "SITE_WHATSAPP": "+670XXXXXXXX", "ORDER_WHATSAPP": "+670XXXXXXXX" },
```

| Variable | Needed? | What it does and what to put |
|---|---|---|
| `SITE_URL` | **Required** | The web address with `https://` and no slash at the end, for example `https://yourdomain.tl`. Used for links, the sitemap and search engines. For staging, use the `workers.dev` address you will see after the first deploy (step D3), then redeploy. |
| `SITE_INDEXABLE` | Required | `true` in production only; `false` in staging. `true` lets Google list the site. |
| `PUBLIC_LANGUAGES` | Required | `en` for production until a Tetum speaker has reviewed the text; `en,tet` shows both (staging). |
| `ORDER_WHATSAPP` | Needed for shop orders | Your WhatsApp number with country code, like `+670XXXXXXXX` (any country allowed). Shop orders open WhatsApp to this number. If unset, ordering says it is not set up. |
| `SITE_WHATSAPP` | Optional | The WhatsApp number shown in the phone quick-action bar. If it is empty, the button is simply not shown. Also the fallback for shop orders. |
| `JOIN_ENABLED` | Optional | `true` shows the "Join us" form for tailors. Leave unset until the Privacy text covers it. |
| `NEWSLETTER_ENABLED` | Optional | `true` shows the footer sign-up. Leave unset until the Privacy text covers it **and** you have a way to send newsletters. |
| `SOCIAL_FACEBOOK`, `SOCIAL_INSTAGRAM`, `SOCIAL_YOUTUBE` | Optional | Full `https://` addresses of your pages; each icon shows only if set. |
| `RESPONSE_WINDOW_EN`, `RESPONSE_WINDOW_TET` | Optional | The sentence after "We aim to contact you", for example `within one working day`. Set only what you can keep. Unset promises nothing. |
| `GOOGLE_SITE_VERIFICATION` | Optional | The code Google Search Console gives you for the "HTML tag" method (letters, digits, `-`, `_`). |
| `SHOW_TESTIMONIAL_PLACEHOLDERS` | **Never set** | For developers only. |

### C2. Secrets (typed into Cloudflare)
Make a strong random value:

```bash
openssl rand -base64 36
```

Copy the line it prints. Then store it (staging first). The command asks you to paste the value; nothing is shown while you paste, which is normal. Press Enter.

```bash
npx wrangler secret put FORM_TOKEN_SECRET --env staging
```

If it asks "There doesn't seem to be a Worker called ..., create a new one?", answer **y**. Do the same for production, with a **different** random value:

```bash
npx wrangler secret put FORM_TOKEN_SECRET --env production
```

| Secret | Needed? | Notes |
|---|---|---|
| `FORM_TOKEN_SECRET` | **Required** | At least 16 characters; the site refuses the request forms without it. Different value for each environment. |
| `NOTIFY_WEBHOOK_URL` | Optional but recommended | Where "a new request arrived" notices go (only the reference code and a link, never customer details). Easiest: a free [ntfy](https://ntfy.sh) topic with a long random name, for example `https://ntfy.sh/alfaiate-tl-<30 random letters>`; install the ntfy phone app and subscribe to that topic. Slack/Discord incoming-webhook addresses also work. Treat the address as a secret: whoever knows a ntfy topic name can read it. |

Set it the same way (`npx wrangler secret put NOTIFY_WEBHOOK_URL --env production`). To list what is set (names only): `npx wrangler secret list --env production`.

There is **no** `SESSION_SECRET`: earlier notes mentioned one, but the site does not use it (sign-in sessions are random codes stored in the database).

---

## D. Put the staging copy online and test it

### D1. Build the database tables (staging)

```bash
npx wrangler d1 migrations apply DB --remote --env staging
```

It lists 27 files, one per table (`0001_admin_user.sql` ... `0027_page_view_daily.sql`), and asks to proceed. Type `y`. You should see a green check next to each.

### D2. Load the starting categories and areas (staging, once)
Read `seeds/launch.sql` first (garment types and Dili areas). Edit it if you want different starting lists, then:

```bash
npx wrangler d1 execute DB --remote --env staging --file=seeds/launch.sql
```

(Running it twice does no harm: it skips what exists.)

### D3. Build and deploy staging
The build must be told which environment it is for:

```bash
CLOUDFLARE_ENV=staging npm run build
```

```bash
npx wrangler deploy
```

The last lines show an address like `https://alfaiate-tl-staging.<your-name>.workers.dev`. Put exactly that address (https, no slash at the end) as `SITE_URL` in the `staging` section of `wrangler.jsonc`, then run the two commands above once more. Open the address in your browser: the home page appears.

### D4. Create the first owner on staging and test

```bash
npm run owner:create -- --remote --env staging --email you@example.com
```

Use your real email. It asks you to type `staging` to confirm, then asks for a password twice. The password is typed **hidden**, is never printed or saved in the Terminal history, and only its scrambled form (a hash) is sent to the database. Use at least 12 characters; a password manager is best. When finished it prints `Owner created: you@example.com`.

Open `<staging address>/admin/login` and sign in. Do the smoke test (section G) here first.

---

## E. Production

Repeat the same steps with the production names. In order:

1. Check `wrangler.jsonc` → `production`: `SITE_URL` (your real domain, or the `workers.dev` address for now), `SITE_INDEXABLE` `true`, `PUBLIC_LANGUAGES` `en`, plus any optional variables from C1.
2. Secrets already set in C2 (`--env production`).
3. Tables:

```bash
npx wrangler d1 migrations apply DB --remote --env production
```

4. Starting lists (once, only if you accept them):

```bash
npx wrangler d1 execute DB --remote --env production --file=seeds/launch.sql
```

5. Build and deploy:

```bash
CLOUDFLARE_ENV=production npm run build
```

```bash
npx wrangler deploy
```

6. First owner (see F3).

Never run `npm run db:demo` against production. It only works on your Mac's practice database, but double-check that no demo rows are on the site.

> Always build with `CLOUDFLARE_ENV=staging` or `CLOUDFLARE_ENV=production` right before `npx wrangler deploy`. A build without it targets the practice database and will not deploy.

---

## F. Domain, safety rule and first owner

### F1. Put the site on your own domain
1. Your domain must use Cloudflare's name servers. If you bought it elsewhere: dashboard → **Add a domain** (or **Websites** → **Add a domain**), enter it, choose the Free plan, then at your registrar replace the name servers with the two Cloudflare gives you. Wait until Cloudflare shows the domain as **Active** (minutes to hours).
2. Dashboard → **Workers & Pages** → `alfaiate-tl-production` → **Settings** → **Domains & Routes** → **Add** → **Custom domain** → type `yourdomain.tl` (and again for `www.yourdomain.tl` if wanted) → **Add domain**. Cloudflare creates the DNS record and the HTTPS certificate itself.
3. Make sure `SITE_URL` in `wrangler.jsonc` (production) is exactly that address (`https://yourdomain.tl`), then redeploy (E5).
4. Optional: in the same **Domains & Routes** card, disable the `workers.dev` address of production so there is one address only.

### F2. Cloudflare rate-limiting rule (extra protection against abuse)
The site already limits repeated form sends itself; this rule adds a front gate. It works only once the site is on your domain.

1. Dashboard → your domain → **Security** → **WAF** → **Rate limiting rules** → **Create rule**.
2. Name: `Alfaiate TL forms`.
3. **If incoming requests match** → **Edit expression** and paste:

```
(http.request.method eq "POST" and http.request.uri.path in {"/request" "/tet/request" "/api/contact-click"})
```

4. **With the same characteristics**: **IP**. **Requests**: 10, **Period**: 10 seconds (the free plan only allows 10 seconds). **Action**: **Block**, **Duration**: 10 seconds.
5. **Deploy**.

### F3. Create the first owner on production

```bash
npm run owner:create -- --remote --env production --email you@example.com
```

Type `production` to confirm, then the password twice (hidden). The command refuses if an owner already exists, so it cannot be used to take over the site.

**Changing or recovering the password later.** If you forgot it, or want to rotate it:

```bash
npm run owner:reset -- --remote --env production --email you@example.com
```

This sets a new password and signs that person out everywhere. While signed in you can change your own password under **My account**, and an owner can make a new password for another user under **Users**. Rotate it if anyone else ever saw it or the Mac was lost.

### F4. Confirm the real visitor address is used
The site limits requests per visitor using the `cf-connecting-ip` header, which Cloudflare adds to every request on your domain. After the domain is live, do this test: on your laptop send the request form six times in a row with fake data (see G). The sixth must be refused with a "too many" message. Then, on your phone using mobile data (a different address), send one: it must work. That proves visitors are counted separately and not as one shared "unknown" visitor.

---

## G. Smoke test with fake data (staging, then production)

Use only made-up details: name `Smoke Test`, number `+67077000999`.

1. Open the home page, the directory, a category page, and `/shop` on a phone and a laptop: pages load, no errors.
2. Send a request on `/request` with the fake details. You see a reference like `AT-XXXXXXXX`. **Write it down.**
3. Your notification (ntfy, Slack or Discord) arrives, with only the reference and a link.
4. Sign in at `/admin/login`: the request is in the inbox as **New**.
5. In the admin create a tailor named `Smoke Test Tailor`, do not publish it. Check that the public directory does not show it.
6. Sign out and in again; check `/admin/users`.

**Delete the test rows afterwards** (replace `AT-XXXXXXXX` with your reference and add `--env staging` or `--env production` as needed):

```bash
npx wrangler d1 execute DB --remote --env production --command "DELETE FROM enquiry WHERE reference_code = 'AT-XXXXXXXX'"
```

```bash
npx wrangler d1 execute DB --remote --env production --command "DELETE FROM tailor WHERE display_name = 'Smoke Test Tailor'"
```

Deleting the request also removes its status log, notes and referrals. Audit-log lines keep only ids, not names. Visit counts are only totals and need no cleaning.

---

## Starting your own Mac's practice database again

The practice database lives in the `.wrangler/state` folder and is separate from Cloudflare. To wipe it and start clean (this never touches the online site):

```bash
rm -rf .wrangler/state
```

```bash
npm run db:migrate
```

```bash
npm run db:seed:launch
```

```bash
npm run owner:create
```

Optional sample data: `npm run db:demo` (remove it with `npm run db:demo:remove`).

---

## H. Backups, restore and rollback

### H1. Backup (export) the database
Do this after launch weekly, and before any change. The file contains **customer data**: keep it in a private folder outside the project, never in email or a shared drive.

```bash
mkdir -p ~/alfaiate-backups
```

```bash
npx wrangler d1 export alfaiate-tl-prod --remote --env production --output ~/alfaiate-backups/alfaiate-tl-prod-$(date +%Y-%m-%d).sql
```

Cloudflare also keeps 30 days of point-in-time history ("Time Travel"). Look at it with:

```bash
npx wrangler d1 time-travel info alfaiate-tl-prod --env production
```

Photos are in R2 and are **not** in the export. Tailors can re-upload; staff keep the originals if a photo must never be lost.

### H2. Restore
- **Undo a bad change in the last 30 days (fastest):** `npx wrangler d1 time-travel restore alfaiate-tl-prod --env production --timestamp=<time as 2026-12-01T09:30:00Z>`. This rewinds the whole database to that moment. The command prints a bookmark: write it down, because it lets you undo the restore.
- **Rebuild from an export file:** create a new empty database (B1), put its ID in `wrangler.jsonc`, then run `npx wrangler d1 execute DB --remote --env production --file=<your backup>.sql` (without applying the migrations first: the export already contains the tables).

Remember the privacy rule: an old backup still holds data you may have since removed on someone's request. Delete old backups after your retention period.

### H3. Roll back the website program
The database is not changed by a code rollback. Dashboard → **Workers & Pages** → `alfaiate-tl-production` → **Deployments** → pick an earlier version → **Rollback**. Or, from the Terminal: `npx wrangler rollback --env production`. A change to the tables is undone with H2, never by editing by hand.

### H4. Before every later update
1. Export a backup (H1). 2. `npm run check` and `npm run test:e2e` pass on your Mac. 3. Deploy to staging, look at it. 4. `migrations apply` for production (only if new migration files exist), then build and deploy production.

---

## What I need from you

Give these to whoever runs the deployment, or do them yourself. Each says where it goes.

**Accounts**
- [ ] A Cloudflare account with two-step sign-in and **Workers Paid** switched on → section A1.
- [ ] A payment card for Workers Paid and R2 → A1, B2.
- [ ] The domain name you want (for example `yourdomain.tl`) and access to where you bought it, to change its name servers → `SITE_URL` in `wrangler.jsonc` (production), F1.

**Values**
- [ ] The two database IDs shown by Cloudflare → `wrangler.jsonc`, B1.
- [ ] The staging `workers.dev` address (appears after the first deploy) → `SITE_URL`, staging, D3.
- [ ] Your WhatsApp number for shop orders (`ORDER_WHATSAPP`) and, if different, the number for the phone bar (`SITE_WHATSAPP`) → `wrangler.jsonc` vars, C1.
- [ ] How you want to be notified of new requests (an ntfy topic, or a Slack/Discord webhook address) → secret `NOTIFY_WEBHOOK_URL`, C2.
- [ ] Wording you can honour for "We aim to contact you ..." (English and Tetum), or "promise nothing" → `RESPONSE_WINDOW_EN` / `RESPONSE_WINDOW_TET`, C1.
- [ ] Facebook, Instagram, YouTube page addresses, if you want the icons → `SOCIAL_*`, C1.
- [ ] A Google Search Console verification code, once you have added the site there → `GOOGLE_SITE_VERIFICATION`, C1.
- [ ] Your email for the first owner account and a strong password you type yourself → F3.

**Decisions**
- [ ] Final starting lists of garment types and areas (`seeds/launch.sql`) → D2 (they can be edited later in the admin).
- [ ] Fee model (OQ-03/OQ-04) before any recorded fee is relied on.
- [ ] How long you keep request details (OQ-09), and who removes them.
- [ ] Whether to switch on the tailor **Join us** form (`JOIN_ENABLED`) and the newsletter (`NEWSLETTER_ENABLED`; the newsletter also needs a sender, OQ-06) → C1, only after the Privacy text covers them.
- [ ] Who may approve tailors and how you send sign-in links (WhatsApp from your own number).
- [ ] Whether the "Alfaiate TL" wordmark is acceptable or a real logo will be supplied.
- [ ] Whether to delete the unused `handspark/` demo-theme folder from the project (it is not part of the website).

**Approvals**
- [ ] Legal text: the Privacy and Terms wording, reviewed by someone qualified (OQ-08), starting from [DRAFT-privacy-and-terms.md](DRAFT-privacy-and-terms.md) → put into the pages, then set their `reviewed` flag in `src/modules/seo/pages.ts` and redeploy.
- [ ] Read and approve: How it works, About, FAQ, Gallery, Journal, Shop pages → their `reviewed` flags in `src/modules/seo/pages.ts`. Until then they stay hidden from search engines and the sitemap.
- [ ] The consent wording on the request, business, join and newsletter forms.
- [ ] A native Tetum speaker's review of [TETUN-REVIEW.md](TETUN-REVIEW.md) (OQ-07) before `PUBLIC_LANGUAGES` becomes `en,tet`.
- [ ] The tailor permission wording `consent-tailor-2026-10-v1`.

**Content**
- [ ] Real tailors, each with **recorded permission** for every name, photo, price and contact number shown (BR-06, BR-11). Nothing is shown without it.
- [ ] Real photos only with permission; real testimonials only with consent (`src/components/home/testimonials.ts`).

**Your time**
- [ ] Do the smoke test (G) on staging, then on production; keep the written reference numbers.
- [ ] Click through the admin and the tailor portal on your own phone.
- [ ] Add the Cloudflare rate-limiting rule (F2) and make the first backup (H1) on launch day.
