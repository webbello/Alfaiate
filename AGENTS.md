# AGENTS.md — Alfaiate TL

Tailor discovery and referral platform for Dili, Timor-Leste. Current state lives in [docs/STATUS.md](docs/STATUS.md), not here.

## Session workflow

1. Start: read [docs/STATUS.md](docs/STATUS.md), [docs/DECISIONS.md](docs/DECISIONS.md) and the Lessons section below.
2. Work one phase: `/plan` then `/build` (agent-skills). Tests alongside code.
3. Before finishing: run the `check` command (once it exists), then run the `privacy-scope-reviewer` and `docs-sync` agents on the change and fix what they find.
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

- (none yet)
