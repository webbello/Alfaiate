# Handspark inside Alfaiate TL

This folder is the Handspark Astro theme (version 1.0.0, ThemeNcode), copied in unchanged as a separate app so it can be run and studied before its pieces are moved into the main site. Its own README, LICENSE and docs are untouched.

```bash
npm run theme:install   # once; installs into handspark/node_modules
npm run theme:dev       # http://localhost:4331
npm run theme:build     # builds handspark/dist (48 pages)
```

- The theme's demo photos and videos (Freepik stock, see LICENSE.md) are **not tracked in git**: they are listed in the root `.gitignore`. A fresh clone has the code but not the pictures; copy `src/assets/images` and `public/videos` from the theme download, or replace them with Alfaiate photography.
- The root lint, typecheck, formatter and tests skip this folder.
- Plan for moving it into the real site: [docs/SPEC-handspark-theme.md](../docs/SPEC-handspark-theme.md).
