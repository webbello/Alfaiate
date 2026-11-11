# Plan: Sveltia CMS (SPEC-sveltia-cms.md, approved 2026-10-27 with the draft answers to OQ-C1 to C5)

One phase at a time. Owner answers: no nested Pages collection; Tetun optional per post; Sveltia saves straight to a `staging-content` branch; the 10 sample posts are drafts the owner approves one by one; images are converted to WebP, resized, 1.5 MB cap.

Change from the spec: the image folder is `public/photos` (public path `/photos`), not `public/media`, because `/media` is the app's R2 image route and `uploads/` is forbidden by check:repo.

- [x] **C1 Content and config.** `public/cms/index.html` + `config.yml` (validated), `public/_headers` for `/cms/*`, content folders, check:repo exception for `public/photos/**`, `/cms/` disallowed in robots when indexable, tests, try locally with `test-repo`. Verify: `npm run check` incl. validator; `/cms/` loads; mutation check of the image exception.
- [x] **C2 Journal from files.** Posts and authors read from `content/`; drafts and samples hidden everywhere; 10 sample draft posts with stock images (licence recorded).
- [x] **C3 Photos by slug.** Tailor and product photo lookup (R2 first, then Sveltia, then stand-in); `/admin` read-only line and slug warning.
- [ ] **C4 Site settings.** Settings file read with today's text as the fallback.
- [~] **C5 GitHub and deploy.** Private repo, OAuth helper Worker, Cloudflare Git connection for staging, DEPLOY steps, one real test save.
