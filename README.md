# Alfaiate TL

Tailor discovery and referral platform for Dili, Timor-Leste. Requirements and design live in [docs/](docs/); current progress in [docs/STATUS.md](docs/STATUS.md).

## Requirements

Node >= 22.22.0 and npm.

## Run

```bash
npm ci
cp .dev.vars.example .dev.vars   # placeholders only; never commit .dev.vars
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

Other scripts: `npm test` (container + D1 tests), `npm run test:integration` (builds, then tests the built Worker), `npm run lint`, `npm run format`, `npm run typecheck`, `npm run types` (regenerate Worker types after editing `wrangler.jsonc`), `npm run bench:hash` (PBKDF2 timing), `npm run owner:reset` (forgotten password).
