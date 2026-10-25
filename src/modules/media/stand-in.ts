import { SCENES, type Scene } from '../../components/home/images';
import type { Variant } from './keys';

/**
 * Photo storage off (free plan, no R2): a product photo may point at one of the site's own licensed scene photos instead of an upload
 * (public/images/site, credits in CREDITS.md). Its `file_key` starts with the first 28 hex digits of SHA-256 of `scene:<name>`, so it passes the normal key check
 * and the media route can still ask D1 whether the product is published. The key is the first 28 digits of that hash plus 4 digits that make each photo's key unique (file_key is unique). Used by the staging sample shop (seeds/staging-shop.sql); nothing else writes such keys.
 */
const hex = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

export const standInPrefix = async (scene: Scene) =>
  (await hex(`scene:${scene}`)).slice(0, 28);

/** The static image address for a stand-in key and size, or null when the key is not one. */
export async function standInUrl(
  imageKey: string,
  variant: Variant,
): Promise<string | null> {
  for (const scene of Object.keys(SCENES) as Scene[]) {
    if ((await standInPrefix(scene)) !== imageKey.slice(0, 28)) continue;
    const { widths } = SCENES[scene];
    const width = variant === 'thumb' ? widths[0] : widths[1];
    return `/images/site/${scene}-${width}.webp`;
  }
  return null;
}
