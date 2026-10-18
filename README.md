# Alfaiate TL

Tailor discovery and referral platform for Dili, Timor-Leste. Requirements and design live in [docs/](docs/); current progress in [docs/STATUS.md](docs/STATUS.md).

## Requirements

Node >= 22.22.0 and npm.

## Run

```bash
npm ci
cp .dev.vars.example .dev.vars   # placeholders only; never commit .dev.vars
npm run dev                      # http://localhost:4321
```

## Check before finishing any change

```bash
npm run check   # lint + typecheck + test + build
```

Other scripts: `npm run lint`, `npm run format`, `npm run typecheck`, `npm test`, `npm run build`.
