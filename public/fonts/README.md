# Fonts

- `theme/LibreBaskerville-*.woff2` (8 files) and `theme/Manrope-latin.woff2`: the Handspark theme's fonts, Libre Baskerville and Manrope (SIL OFL 1.1, `OFL-libre-baskerville.txt`, `OFL-manrope.txt`). The Libre Baskerville files are Modified Versions (converted from TTF and subset to Latin, 2026-10-23, with fonttools); their name tables declare no Reserved Font Name, so they keep their names. Each is tested to stay under 25 kB (`tests/integration/brand.test.ts`).

The earlier Alfaiate Display (Playfair Display) and Alfaiate Script (Allura) fonts were removed in step 8 of the Handspark theme work (2026-10-23) because no page uses them any more.
