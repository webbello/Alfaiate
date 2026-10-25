// Every scene photo on the home page, in one place (files and credits: public/images/site/CREDITS.md). Replace a photo by
// dropping new files with the same name and widths there and updating its credit; nothing else needs to change.
// These are licensed stock scenes: they are never shown as, or next to, a listed tailor's own work (BR-06, BR-11).
export const SCENES = {
  hero: { widths: [800, 1600], ratio: [2, 3] },
  custom: { widths: [400, 800], ratio: [5, 4] },
  traditional: { widths: [400, 800], ratio: [5, 4] },
  alterations: { widths: [400, 800], ratio: [5, 4] },
  shirts: { widths: [400, 800], ratio: [5, 4] },
  dresses: { widths: [400, 800], ratio: [5, 4] },
  suits: { widths: [400, 800], ratio: [5, 4] },
  uniforms: { widths: [400, 800], ratio: [5, 4] },
  wedding: { widths: [400, 800], ratio: [5, 4] },
  craft: { widths: [700, 1200], ratio: [3, 2] },
  rack: { widths: [480, 800], ratio: [3, 2] },
  'home-visit': { widths: [500, 900], ratio: [16, 9] },
  business: { widths: [500, 900], ratio: [2, 3] },
  'final-cta': { widths: [800, 1400], ratio: [3, 4] },
} as const;

export type Scene = keyof typeof SCENES;

/** `src`, `srcset`, `width` and `height` for an <img> (width and height reserve the space, so nothing jumps while it loads). */
export function scene(name: Scene) {
  const { widths, ratio } = SCENES[name];
  const [small] = widths;
  return {
    src: `/images/site/${name}-${small}.webp`,
    srcset: widths
      .map((w) => `/images/site/${name}-${w}.webp ${w}w`)
      .join(', '),
    width: small,
    height: Math.round((small * ratio[1]) / ratio[0]),
  };
}
