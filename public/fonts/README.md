# Fonts

- `alfaiate-display.woff2`: a Modified Version of Playfair Display (SIL OFL 1.1, `OFL-playfair-display.txt`): instanced at weight 500, subset to Latin and Latin-1, renamed "Alfaiate Display" because "Playfair Display" is a Reserved Font Name.
- `alfaiate-script.woff2`: a Modified Version of Allura (SIL OFL 1.1, `OFL-allura.txt`): subset to Latin, renamed "Alfaiate Script" (Allura is also a Reserved Font Name).

Made with fonttools (instancer and pyftsubset) outside the project dependencies, 2026-10-19.
- `theme/LibreBaskerville-*.woff2` (8 files) and `theme/Manrope-latin.woff2`: the Handspark theme's fonts, Libre Baskerville and Manrope (SIL OFL 1.1, `OFL-libre-baskerville.txt`, `OFL-manrope.txt`). The Libre Baskerville files are Modified Versions (converted from TTF and subset to Latin, 2026-10-23, with fonttools); their name tables declare no Reserved Font Name, so they keep their names. Each is tested to stay under 25 kB (`tests/integration/brand.test.ts`).
