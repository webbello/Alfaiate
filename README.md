# Alfaiate TL

Tailor discovery and referral platform for Dili, Timor-Leste. Requirements and design live in [docs/](docs/); current progress in [docs/STATUS.md](docs/STATUS.md).

## Requirements

Node >= 22.22.0 and npm.

## Run

```bash
npm ci
npm run setup:local              # first time only: creates .dev.vars with random secrets (never committed), migrates the local database, adds placeholder categories and areas
npm run owner:create             # first admin account (prompts; password is never echoed or stored)
npm run dev                      # http://localhost:4321, admin at /admin
```

Note: `npm run dev` inlines CSS, which the strict CSP blocks, so pages look unstyled in dev (they still work). To see the real, styled site locally, run `npm run preview` (builds, then serves the built Worker at http://localhost:4322 with the same local database). It serves the build it just made: after any command that rebuilds (`npm run check`, `npm run test:e2e`, `npm run build`) stop it (Ctrl+C) and run `npm run preview` again, otherwise the page loses its styles. If `npm run dev` says another server is already running, stop it with `npx astro dev stop`.

To see the site and admin filled in, load clearly fake demo data into the **local** database only (tailors named "[Demo] ...", enquiries `AT-DEMO0001`..., made-up numbers, no photos):

```bash
npm run db:demo                  # adds it (safe to repeat: earlier demo rows are cleared first)
npm run db:demo:remove           # deletes exactly those rows (slug prefix demo-, reference prefix AT-DEMO); run before launch
```

The scripts take no options and always use `--local`; they cannot reach a remote database.

Optional: set `NEWSLETTER_ENABLED=true` to switch on the footer "Stay updated" sign-up (off by default: no sender yet, OQ-06, and the Privacy text must cover it, OQ-08; addresses are listed at `/admin/newsletter`). Set `JOIN_ENABLED=true` to switch on the public "Join as a tailor" form (it is off by default until the owner approves its wording, OQ-08), and `SITE_WHATSAPP` in `.dev.vars` (and as a Worker variable at deploy) to show a WhatsApp button in the phone quick-action bar; without it the button is simply not shown (OQ-06). The public "Join as a tailor" form is at `/join`; the people who used it are listed at `/admin/interest`.

## Check before finishing any change

```bash
npm run check   # lint + typecheck + repo check + unit/D1 tests + build + integration tests
```

Other scripts: `npm test` (unit and D1 tests in workerd), `npm run test:integration` (builds, then tests the built Worker in three modes: English and Tetum indexable, English only, and staging with indexing off), `npm run test:e2e` (builds, serves the built Worker on a throwaway database with fake data, runs Playwright and axe for WCAG 2.2 AA, a CSP watcher, no-JavaScript runs and reflow checks; first run needs `npx playwright install chromium`), `npm run perf` (builds, then measures page weight and timings on a throttled mobile profile), `npm run check:repo` (fails if git tracks secrets, environment files, databases, uploads or photos), `npm run lint`, `npm run format`, `npm run typecheck`, `npm run types` (regenerate Worker types after editing `wrangler.jsonc`), `npm run bench:hash` (PBKDF2 timing), `npm run owner:reset` (forgotten password).

## Admin workflow and public site (Phases 2-7c)

Sign in at `/admin`. Editors create and edit draft tailors, categories, areas and photos; managers also record the tailor's permission, mark verified facts and publish; the owner alone sees referral fee terms and manages users. Photos are private until a manager records permission and the tailor is published. The public site (Phase 4) is live locally: home, directory, category and profile pages, static pages, sitemap and robots, in English and, when `PUBLIC_LANGUAGES` includes `tet`, Tetum under `/tet/`. `/request` is the request form (Phase 5); requests appear in `/admin/enquiries` for managers and owners, who set statuses, add internal notes, flag spam and copy the consented details to forward by hand, then record referrals (forwarding, tailor response, reported completion); the owner alone records fees. The `/admin` dashboard shows the pilot figures for this month, the last 30 days or all time (Dili dates), with fee figures for the owner only. Tetum is on in `.dev.vars.example` and staging but off in production until a native speaker has reviewed it.

