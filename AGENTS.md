# AGENTS.md — Alfaiate TL

Tailor discovery and referral platform for Dili, Timor-Leste. Current state lives in [docs/STATUS.md](docs/STATUS.md), not here.

## Session workflow

1. Start: read [docs/STATUS.md](docs/STATUS.md), [docs/DECISIONS.md](docs/DECISIONS.md) and the Lessons section below.
2. Work one phase: `/plan` then `/build` (agent-skills). Tests alongside code.
3. Before finishing: run `npm run check`, then run the `privacy-scope-reviewer` and `docs-sync` agents on the change and fix what they find.
4. End: update STATUS.md; log any decision in DECISIONS.md; add a lesson if you were corrected or surprised.

## Read first

Before implementing anything, read, in order: [docs/PRD.md](docs/PRD.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DATA_MODEL.md](docs/DATA_MODEL.md), then the relevant phase in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md). Do not restate them here; they are the source of truth.

## Rules

- **One phase at a time**, in plan order. Stay inside that phase's deliverables.
- **No out-of-scope features.** PRD §7.3 lists exclusions (accounts, payments, chat, booking calendars, reviews, matching, native apps, etc.). If something seems needed, ask rather than add it.
- **Follow the repository's conventions.** Inspect existing code, tooling and patterns first; the stack (Astro, Cloudflare Workers/D1/R2, custom RBAC admin) is chosen by the owner, but exact versions and unresolved AD-xx items are confirmed in Phase 1. Do not swap the stack without an explicit decision.
- **Keep requirement IDs stable.** Reference FR-/NFR-/SEC-/AC- IDs in commits, tests and docs. Never renumber.
- **Tests:** write or update tests for each change. Run the available lint, typecheck, test and build commands before finishing.
- **Never claim a check passed unless you ran it** and saw it pass. State plainly what was not run.
- **Docs:** when an implementation decision changes the design, update the affected doc in the same change. Do not document planned features as implemented.
- **Privacy and secrets:** never commit secrets, `.env`, databases, uploads or real customer data. Use fake data in tests and fixtures. Do not log customer names, phone numbers or notes. Customer data is admin-only; never in public pages, URLs, analytics or sitemaps.
- **Do not publish unverified facts** (prices, ratings, credentials, claims) and never show tailor content without recorded permission (BR-06, BR-11).
- **Manual workflow:** statuses and referral outcomes are updated manually; do not add automatic orchestration.
- **Cloudflare:** D1 holds structured data only; images live in R2 and are accessed through the media module. Every admin route and mutation must check a named permission server-side. Never commit secrets or `.dev.vars`.
- **Unresolved decisions** (OQ-xx, AD-xx) must be flagged to the owner, not silently decided.

## Lessons

Append one line when the user corrects you, a check catches a mistake, or something surprising bites. Format: `YYYY-MM-DD — what happened → rule to follow`. Keep it to rules that are not already above. At the end of each phase, propose pruning or promoting entries to Rules; the owner approves.

- 2026-10-18 — `prettier --write .` reformatted docs and hooks → `.prettierignore` excludes docs, tasks, .claude and *.md; never run a formatter repo-wide without checking `git status` after.
- 2026-10-18 — a commit chained after `npm run check | grep` ran although check failed → capture the exit code (`npm run check; rc=$?`) and commit only when `rc` is 0.
- 2026-10-18 — a scripted `str.replace` edit silently did nothing because Prettier had reformatted the target, and the new tests passed vacuously → assert the replacement happened, and run a mutation check (break the guard, see the test fail) before trusting a new security test.
- 2026-10-19 — a mutation check ran with no mutation applied (the Python replace asserted, the shell carried on) and its "tests still pass" was read as success → a mutation check only counts if the script confirmed the edit and the tests then FAILED; abort the whole command chain (`set -e`) when the edit step fails, and never cite mutation checks in a commit message until seen failing.
- 2026-10-20 — a multi-step shell command kept running after its first Python edit failed, so later edits applied once and again (a duplicated footer nav and CSS block slipped through) → start edit scripts with `set -e`, and test for duplicated landmarks; also never name a zsh variable `path` (it is tied to PATH).
- 2026-10-19 — prettier reformatted files between my edits, so scripted text replacements and mutation patterns silently missed → read the current text first and use a replace that fails loudly when it does not apply.
- 2026-10-19 — a script kept running after its first failure and duplicated markup → stop scripts on the first error (`set -e`) and add a test that counts landmarks.
- 2026-10-19 — the public-pages scope-guard list must be updated on purpose with every new page, including twins and API routes → edit `tests/workers/public-pages.test.ts` in the same task.
- 2026-10-19 — D1 rejected a long search term with "LIKE or GLOB pattern too complex" (limit 50 bytes, escapes and emoji count) → cut user search text until its escaped pattern fits, and test with `%`, emoji and backslashes.
- 2026-10-19 — a mutation survived because no role could tell two permissions apart in the integration test → check which suite is supposed to catch a mutation (here the route-inventory unit test) before adding tests, and test each guard where it can actually be observed.
- 2026-10-19 — a Python edit failed its assertion, the shell chain went on, the commit message then claimed a mutation check that had not run → end every edit script with `&& echo EDIT-OK`, read that line before the next step, and write commit messages only from results seen in this run.
- 2026-10-19 — a test searched the page for `<script` and failed on the hostile name that Astro leaves unescaped inside attribute values (like `og:title`) → check markup after blanking attribute values, and run attribute text through `metaText` when it is customer-controlled.
- 2026-10-19 — e2e requests shared one rate-limit bucket because the local Worker sees no client address, so the sixth form submission was refused → give each e2e file that posts its own `cf-connecting-ip`.
- 2026-10-19 — an imprecise mutation (changing a bound-parameter count) "failed" for the wrong reason → mutate so the bind count stays valid (add `OR 1 = 1`, swap a constant) and look at which test failed.
- 2026-10-19 — a UI commit passed `npm run check` while e2e was failing, and a `grep -c` after a failed Python edit still printed EDIT-OK → for UI changes run `npm run test:e2e` before committing, and chain `echo EDIT-OK` only with `&&` after the Python step (or `set -e`).
- 2026-10-19 — an integration-test mutation "passed" because those tests run the built Worker, not the source → rebuild (run `npm run test:integration`, which builds) before judging a mutation of a page or component.
- 2026-10-19 — a fresh `sed` on a spec's path list duplicated entries and the e2e suite refused to start on duplicate test titles → read the file first, and when a spec already prefixes a language path (a11y.spec) list only the English path.
- 2026-10-19 — a restyle of pages that carry the owner's wording could silently change text → fingerprint the visible text of owner-owned pages (`tests/integration/static-text.test.ts`) before restyling, and keep the fingerprints in the same commit as any approved wording change.
- 2026-10-19 — the owner set JOIN_ENABLED=true in .dev.vars to try a feature and the next `npm run check` failed, because the test environments read .dev.vars → pin every feature flag and optional setting the tests depend on in the vitest configs (`vitest.integration*.config.ts`).
- 2026-10-21 — a commit followed a red `npm run check` because the chain printed rc but did not gate on it → commit only inside `if [ $rc -eq 0 ]`; and adding a shared import (the image-upload script) split a bundle chunk so a test reading the page script failed → check tests that read built assets when two pages share a script.
- 2026-10-21 — rebuilding `admin_user` to widen its role CHECK deleted all staff sessions and nulled audit actors (foreign keys cascade on DROP) → never rebuild a table that others reference without proving child rows survive; prefer a separate table.
- 2026-10-23 — I gated the motion script off for phones to save weight and the services section broke, because it is driven by that script at every width → before skipping a script by device, check which layout it drives and look at the page without it.
- 2026-10-23 — a mutation check of a public route 'passed' because I ran it before rebuilding the Worker (the same slip as the 2026-10-19 lesson) → in the same command chain: mutate, `npm run build`, run the test, see it FAIL, restore, rebuild.
- 2026-10-24 — the owner read "no consent to publish" as "no number" for a tailor whose number was saved → when one publish rule has two different fixes, return two blockers and link each to its own control.
- 2026-10-24 — while debugging I copied a real-looking number from the local D1 into test fixtures and docs → never copy values from local data; use the made-up `+6707000…` range in fixtures and leave real values in the database.
- 2026-10-24 — a "fix this" link jumped to the right control but the sticky admin bar covered it and focus stayed on the link, so the jump did nothing for a keyboard user → test an in-page fix link by where the target lands and what has focus, not just that the href exists; add `scroll-margin-top` and `tabindex="-1"`.
- 2026-10-24 — a mutation of the next-step rule survived twice because my fixture gave the same answer on both branches → build each test case so the mutated and the correct code give different results, and see the mutation fail before trusting it.
- 2026-10-24 — removing `js-flag.js` also removed the `js` class that CSS (`html:not(.js) .works-*`) used for the services fallback, so the reel stopped pinning and no check noticed → before removing a class, script or attribute, grep every selector and test that uses it (`grep -rn ':not(.js)'`); behaviour that is visible only while scrolling needs a browser test (`e2e/services-reel.spec.ts`).
