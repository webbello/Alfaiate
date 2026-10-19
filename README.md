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

Note: `npm run dev` inlines CSS, which the strict CSP blocks, so pages look unstyled in dev (they still work). To see the real, styled site locally, run `npm run preview` (builds, then serves the built Worker at http://localhost:4322 with the same local database).

## Check before finishing any change

```bash
npm run check   # lint + typecheck + repo check + unit/D1 tests + build + integration tests
```

Other scripts: `npm test` (unit and D1 tests in workerd), `npm run test:integration` (builds, then tests the built Worker in three modes: English and Tetum indexable, English only, and staging with indexing off), `npm run test:e2e` (builds, serves the built Worker on a throwaway database with fake data, runs Playwright and axe for WCAG 2.2 AA, a CSP watcher, no-JavaScript runs and reflow checks; first run needs `npx playwright install chromium`), `npm run perf` (builds, then measures page weight and timings on a throttled mobile profile), `npm run check:repo` (fails if git tracks secrets, environment files, databases, uploads or photos), `npm run lint`, `npm run format`, `npm run typecheck`, `npm run types` (regenerate Worker types after editing `wrangler.jsonc`), `npm run bench:hash` (PBKDF2 timing), `npm run owner:reset` (forgotten password).

## Admin workflow and public site (Phases 2-5)

Sign in at `/admin`. Editors create and edit draft tailors, categories, areas and photos; managers also record the tailor's permission, mark verified facts and publish; the owner alone sees referral fee terms and manages users. Photos are private until a manager records permission and the tailor is published. The public site (Phase 4) is live locally: home, directory, category and profile pages, static pages, sitemap and robots, in English and, when `PUBLIC_LANGUAGES` includes `tet`, Tetum under `/tet/`. `/request` is the request form (Phase 5); requests appear in `/admin/enquiries` for managers and owners, who set statuses, add internal notes, flag spam and copy the consented details to forward by hand, then record referrals (forwarding, tailor response, reported completion); the owner alone records fees. The `/admin` dashboard shows the pilot figures for this month, the last 30 days or all time (Dili dates), with fee figures for the owner only. Tetum is on in `.dev.vars.example` and staging but off in production until a native speaker has reviewed it.

