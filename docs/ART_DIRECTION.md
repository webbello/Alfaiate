# Art direction (Phase 7c)

Status: draft, grows with each Phase 7c task. Spec: [SPEC-phase-7c.md](SPEC-phase-7c.md). All copy is a draft marked REVIEW until the owner approves it (BR-11).

## Idea

A tailor's atelier as a fashion magazine: pattern paper, chalk lines, basting stitches, tape marks and cloth, set in large editorial type with generous space. Craftsmanship, personal style, trust, local culture. Never a marketplace template: no star ratings, no "200+ tailors", no stock photos, no invented testimonials.

## Palette (tokens in `src/styles/site.css`)

| Token | Value | Use |
|---|---|---|
| `--paper` | #fffdf9 | page ground |
| `--band` | #f4efe7 | quiet sections |
| `--chalk` | #efe8da | pattern-paper sections |
| `--ink`, `--muted` | #1b1b1b, #4d4d4d | text |
| `--accent` | #8a1c2b | maroon: links, primary buttons |
| `--indigo` | #1f2a4d | deep section ground (light text) |
| `--deep` | #14110f | darkest ground (light text) |
| `--thread` | #7a5a12 | gold-brown thread, text on light grounds |
| `--thread-light` | #e2c27a | gold thread on dark grounds |

Every pair used is tested for WCAG AA 4.5:1 (`tests/integration/contrast.test.ts`). Colour is never the only signal.

## Type

Display: Instrument Serif (SIL OFL, owner's pick 2026-10-19), Latin subset, 18.8 KB WOFF2 at `public/fonts/instrument-serif-regular.woff2` with `public/fonts/OFL.txt`; regular weight only, `font-display: swap`, system serif fallback; used for headings, numerals and pull quotes only. The italic (19.8 KB) is not shipped; add it only if a pull quote needs it. Subset made with fonttools (Latin, Latin-1, general punctuation), kept out of the project dependencies. Body: system sans for speed. Scale and spacing are set in T2 onward.

## Motion and 3D

CSS only. Decorative pieces (swatch, tape measure, pattern pieces, stitch) are `aria-hidden` and carry no content. Motion runs only under `prefers-reduced-motion: no-preference`; otherwise the page is static and 3D transforms are flattened. The tape measure is an illustration: the site never collects body measurements.

## Motifs

Abstract geometry only, inspired by the rhythm of woven borders; nothing named or copied from a specific cloth. The owner reviews before use.

## Copy rules

Plain, warm, specific. No claims we cannot verify, no counts, no ratings, no promised timings (OQ-05). The platform introduces; the tailor agrees price, measurements and dates directly (BR-01, BR-02).
