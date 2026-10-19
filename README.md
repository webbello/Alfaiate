# Alfaiate TL

Tailor discovery and referral platform for Dili, Timor-Leste. Requirements and design live in [docs/](docs/); current progress in [docs/STATUS.md](docs/STATUS.md).

## Requirements

Node >= 22.22.0 and npm.

## Run

```bash
npm ci
cp .dev.vars.example .dev.vars   # placeholders only; never commit .dev.vars (set FORM_TOKEN_SECRET to any 16+ characters locally)
npm run db:migrate               # apply migrations to the local D1
npm run db:seed                  # optional: placeholder categories/areas (local only)
npm run owner:create             # first admin account (prompts; password is never echoed or stored)
npm run dev                      # http://localhost:4321, admin at /admin
```

Note: `npm run dev` inlines CSS, which the strict CSP blocks, so pages look unstyled in dev. The built app is styled.

## Check before finishing any change

```bash
npm run check   # lint + typecheck + unit/D1 tests + build + integration tests
```

Other scripts: `npm test` (unit and D1 tests in workerd), `npm run test:integration` (builds, then tests the built Worker in English+Tetum and English-only modes), `npm run test:e2e` (builds, serves the built Worker on a throwaway database with fake data, runs Playwright and axe at phone width; first run needs `npx playwright install chromium`), `npm run lint`, `npm run format`, `npm run typecheck`, `npm run types` (regenerate Worker types after editing `wrangler.jsonc`), `npm run bench:hash` (PBKDF2 timing), `npm run owner:reset` (forgotten password).

## Admin workflow and public site (Phases 2-5)

Sign in at `/admin`. Editors create and edit draft tailors, categories, areas and photos; managers also record the tailor's permission, mark verified facts and publish; the owner alone sees referral fee terms and manages users. Photos are private until a manager records permission and the tailor is published. The public site (Phase 4) is live locally: home, directory, category and profile pages, static pages, sitemap and robots, in English and, when `PUBLIC_LANGUAGES` includes `tet`, Tetum under `/tet/`. `/request` is the request form (Phase 5); requests appear in `/admin/enquiries` for managers and owners, who set statuses, add internal notes, flag spam and copy the consented details to forward by hand. Tetum is on in `.dev.vars.example` and staging but off in production until a native speaker has reviewed it.

