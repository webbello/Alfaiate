import { parseFrontmatter } from '../journal/frontmatter';
import { safePhoto } from '../journal/markdown';

/**
 * Photos of tailors and platform products that staff keep in the content editor (/cms, docs/SPEC-sveltia-cms.md, FR-CMS-04). One file per slug under
 * `content/photos/<tailors|products>/<slug>.yml`; the picture files are under `public/photos/`. The slug is the only link to the tailor or product in D1:
 * /admin keeps every other fact, and a tailor's or product's own R2 photos (when R2 is on) always come first. The site reads these when it is built.
 * Only the page code decides whether a tailor or product is public: these photos are looked up for published records only.
 */
export type CmsPhoto = { src: string; alt: string };
export type CmsPhotos = { main: CmsPhoto | null; gallery: CmsPhoto[] };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** `files` maps `.../<slug>.yml` to its text. `folder` is the only place a picture may live; `mainField` is `profile` or `main`. */
export function parseCmsPhotos(
  files: Record<string, string>,
  folder: 'tailors' | 'products',
  mainField: 'profile' | 'main',
): Map<string, CmsPhotos> {
  const out = new Map<string, CmsPhotos>();
  const ok = (src: string) =>
    safePhoto(src) && src.startsWith(`/photos/${folder}/`);
  for (const [path, raw] of Object.entries(files)) {
    const slug = /([^/]+)\.yml$/.exec(path)?.[1];
    if (!slug || !SLUG.test(slug)) continue;
    const { data } = parseFrontmatter(raw);
    const main = str(data[mainField]);
    const gallery = Array.isArray(data.gallery) ? data.gallery : [];
    const notes = str(data.gallery_alt).split('\n');
    out.set(slug, {
      main: ok(main) ? { src: main, alt: str(data[`${mainField}_alt`]) } : null,
      gallery: gallery
        .map((src, i) => ({ src: str(src), alt: str(notes[i]) }))
        .filter((p) => ok(p.src)),
    });
  }
  return out;
}

const read = (files: Record<string, string>) => files;
const tailors = parseCmsPhotos(
  read(
    import.meta.glob('../../../content/photos/tailors/*.yml', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>,
  ),
  'tailors',
  'profile',
);
const products = parseCmsPhotos(
  read(
    import.meta.glob('../../../content/photos/products/*.yml', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>,
  ),
  'products',
  'main',
);

const EMPTY: CmsPhotos = { main: null, gallery: [] };
export const cmsTailorPhotos = (slug: string): CmsPhotos =>
  tailors.get(slug) ?? EMPTY;
export const cmsProductPhotos = (slug: string): CmsPhotos =>
  products.get(slug) ?? EMPTY;

/** The `base` string a page template turns into an address. See photoUrl(). */
export const CMS_BASE = 'cms:';
export const cmsBase = (photo: CmsPhoto) => `${CMS_BASE}${photo.src}`;
