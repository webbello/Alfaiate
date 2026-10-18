# Spec: Phase 1 — Project setup and empty tested skeleton

Status: Approved 2026-10-18 · Source: [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) Phase 1 · [ARCHITECTURE.md](ARCHITECTURE.md) §2–3, §12

Phases 2–8 are one capability each and already planned, so no capability map is needed. Each later phase gets its own short spec like this one before building.

## Assumptions

1. Package manager is **npm** (installed, no lockfile exists). Say so if you prefer pnpm.
2. Local machine only; no Cloudflare account, domain or deploy in this phase (that is Phase 8).
3. The scaffold contains a placeholder home page and no product features. Nothing from PRD §7.3.
4. Plain CSS with tokens, mobile-first, no CSS framework (ARCHITECTURE §2).
5. Repo is already a git repo (initial commit `12381a0`).

## Objective

A runnable, empty, tested skeleton so every later phase builds on a fixed toolchain. Done when `npm run check` passes from a clean clone and the app serves a placeholder home page locally on the Workers runtime. Resolves **AD-01** (record it in DECISIONS.md).

## Verified toolchain (checked on npm 2026-10-18)

| Item | Version | Note |
|---|---|---|
| Node | 24.15.0 installed | Astro 7.4.0 needs ≥ 22.22.0 |
| astro | 7.4.0 exists | matches the owner's choice (AD-01 resolved) |
| @astrojs/cloudflare | 14.4.0 | peer: astro ^7.4.0, wrangler ^4.125.0 |
| wrangler | 4.151.1 | |
| vitest | 5.0.5 | |
| @playwright/test | 1.64.1 | e2e arrives in Phase 4; installed only if cheap |
| zod | 4.6.7 | first used in Phase 2/5; do not install now |
| typescript | 7.0.2 is latest | **not yet checked** against `astro check` — see Open Questions |

Pin exact versions in `package.json` and commit the lockfile.

## Commands (defined by this phase)

```
Install:   npm ci
Dev:       npm run dev            # astro dev on the Workers runtime, local D1/R2
Build:     npm run build
Lint:      npm run lint
Format:    npm run format
Typecheck: npm run typecheck      # astro check
Test:      npm test               # vitest run
Check:     npm run check          # lint + typecheck + test + build, fails on any error
```

## Project structure (ARCHITECTURE §3)

```
src/pages/            routes (index.astro only)
src/layouts/Base.astro  html shell, lang attr, meta, mobile-first
src/styles/tokens.css   CSS custom properties (colour, space, type)
src/modules/{auth,enquiry,referral,media,db,contact-links,notify,config}/  empty, each with a README line of its responsibility
src/env.d.ts
tests/                  vitest
migrations/             empty (Phase 2)
wrangler.jsonc          local D1 + R2 bindings, staging/production env stanzas
.dev.vars.example       placeholders only
README.md               run instructions
```

## Code style

Small TypeScript modules, named exports, no default exports except Astro pages, 2-space indent, single quotes, Prettier-formatted. UI strings live in one `src/i18n/en.ts` map from day one (NFR-I18N-01), even for the placeholder page.

```ts
// src/modules/contact-links/index.ts (Phase 4 example of the style)
export const telLink = (e164: string) => `tel:${e164}`;
```

## Testing strategy

- Vitest, tests in `tests/`, named after the module.
- One smoke test: the home page route renders and returns 200 with the expected `<h1>` (AC for Phase 1).
- Build is part of `check`.
- No coverage threshold yet; set one in Phase 7.

## Boundaries

- **Always:** run `npm run check` before finishing; keep versions pinned; fake data only.
- **Ask first:** adding any dependency not listed above; changing the stack; choosing the Cloudflare plan (AD-02).
- **Never:** commit `.env`, `.dev.vars`, databases or uploads; add product features, auth, schema or routes beyond `/`; deploy.

## Success criteria

1. `npm ci && npm run check` passes on a fresh clone (output seen, not assumed).
2. `npm run dev` serves `/` with status 200 on the local Workers runtime.
3. `wrangler.jsonc` declares local D1 and R2 bindings and staging/production environments with no secrets.
4. `.dev.vars.example` exists with placeholders; `git ls-files` contains no secret, DB or upload files.
5. Module folders from ARCHITECTURE §3 exist, each with a one-line responsibility note.
6. README explains install, dev, check.
7. ARCHITECTURE §1 is updated with the real toolchain; DECISIONS.md records AD-01; STATUS.md shows Phase 1 complete.
8. The Stop hook now runs `check` (it activates automatically once `package.json` has a `check` script).

## Open questions

1. **TypeScript:** latest is 7.0.2. I have not verified that `astro check` and the Astro/Cloudflare toolchain work with it. Proposed: try it, fall back to the newest TypeScript that `astro check` supports, and record which in DECISIONS.md. OK?
2. **Lint/format:** proposed ESLint (astro plugin) + Prettier. Alternative is Biome (fewer dependencies, weaker `.astro` support). Which do you want?
3. **Local D1 test runtime:** ARCHITECTURE §2 says "verify in Phase 1." Proposed: try `@cloudflare/vitest-pool-workers` with Vitest 5; compatibility is unverified. Phase 1 only needs the smoke test, so if it does not work, defer D1 tests to Phase 2 and note it. OK?
4. **CI:** no remote exists, so Phase 1 ships only the local `check` script. Add a GitHub Actions file later when a remote exists?
