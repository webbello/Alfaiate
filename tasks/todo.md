# Tasks: Phase 1

- [x] **T1 Scaffold Astro 7.4.0**
  - Acceptance: minimal Astro project in repo root; `astro`, `@astrojs/cloudflare`, `wrangler` pinned to exact versions from the spec; `package-lock.json` committed; `engines.node >=22.22.0`.
  - Verify: `npm ci && npx astro --version` prints 7.4.0.
  - Files: `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`, `src/env.d.ts`

- [x] **T2 Lint, format, typecheck scripts**
  - Acceptance: ESLint (astro plugin) + Prettier configured; scripts `lint`, `format`, `typecheck` (`astro check`); TypeScript 7 tried, fallback recorded if needed.
  - Verify: `npm run lint && npm run typecheck` exit 0; DECISIONS.md updated with the TypeScript outcome.
  - Files: `package.json`, `eslint.config.js`, `.prettierrc`, `tsconfig.json`, `docs/DECISIONS.md`

- [x] **T3 Cloudflare adapter and Wrangler config**
  - Acceptance: adapter set in `astro.config.mjs`; `wrangler.jsonc` with local D1 + R2 bindings and staging/production stanzas (placeholder IDs, no secrets); `.dev.vars.example` with placeholders; `migrations/` exists (empty, with `.gitkeep`).
  - Verify: `npm run build` succeeds; `npm run dev` + `curl -s -o /dev/null -w '%{http_code}' localhost:4321/` returns 200 with no Cloudflare login.
  - Files: `astro.config.mjs`, `wrangler.jsonc`, `.dev.vars.example`, `migrations/.gitkeep`, `package.json`

- [x] **T4 Base layout, tokens, i18n map, module folders**
  - Acceptance: `Base.astro` (lang, viewport, title/description props), `tokens.css` (mobile-first custom properties), `src/i18n/en.ts` with the placeholder page strings, home page uses both; the eight module folders from ARCHITECTURE §3 each hold a one-line responsibility README. No other routes.
  - Verify: `npm run build`; page source shows one `<h1>` and the viewport meta.
  - Files: `src/layouts/Base.astro`, `src/styles/tokens.css`, `src/i18n/en.ts`, `src/pages/index.astro`, `src/modules/*/README.md`

- [x] **T5 Smoke test and `check` script**
  - Acceptance: Vitest 5 configured; smoke test asserts the home page renders with the expected `<h1>` (and 200 if the Workers pool works); `check` = lint + typecheck + test + build; pool-workers outcome recorded.
  - Verify: `npm run check` exits 0; also green from a fresh `git clone` in a temp dir with `npm ci`.
  - Files: `package.json`, `vitest.config.ts`, `tests/home.test.ts`, `docs/DECISIONS.md`

- [ ] **T6 Docs and status**
  - Acceptance: `README.md` (install, dev, check); ARCHITECTURE §1 updated with the real toolchain and versions; AGENTS.md names `npm run check`; STATUS.md shows Phase 1 complete and Phase 2 next; `git ls-files` has no secret/DB/upload files.
  - Verify: run `docs-sync` and `privacy-scope-reviewer` agents, fix blockers; `git ls-files | grep -E '\.env|dev\.vars$|\.sqlite|\.db$'` is empty.
  - Files: `README.md`, `docs/ARCHITECTURE.md`, `AGENTS.md`, `docs/STATUS.md`
