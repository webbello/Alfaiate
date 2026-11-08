import { CMS_BASE } from './cms-photos';

/**
 * The address of a picture in a page. A `base` is either an R2 image (`tailor/<id>/<key>` or `product/<id>/<key>`, served by the /media routes in three sizes)
 * or a photo from the content editor (`cms:/photos/...`, one file, served as it is). `scope` is `shop/` for product pictures.
 */
export type Size = 'thumb' | 'medium' | 'large';
export const isCms = (base: string) => base.startsWith(CMS_BASE);
export const photoUrl = (base: string, size: Size, scope = ''): string =>
  isCms(base)
    ? base.slice(CMS_BASE.length)
    : `/media/${scope}${base}/${size}.jpg`;
/** A srcset for R2 images; a content-editor photo has one size, so it gets none. */
export const photoSrcset = (
  base: string,
  sizes: [Size, number][],
  scope = '',
): string | undefined =>
  isCms(base)
    ? undefined
    : sizes.map(([s, w]) => `${photoUrl(base, s, scope)} ${w}w`).join(', ');
