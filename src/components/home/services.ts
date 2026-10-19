import type { Scene } from './images';

// The eight service cards. `category` is the garment-category slug a card links to when the owner has created that category
// and a published tailor offers it; otherwise the card opens the full directory. Labels live in the public dictionaries.
export const SERVICES = [
  { key: 'custom', image: 'custom', category: 'custom-clothing' },
  { key: 'traditional', image: 'traditional', category: 'traditional-wear' },
  { key: 'alterations', image: 'alterations', category: 'alterations' },
  { key: 'shirts', image: 'shirts', category: 'shirts-and-trousers' },
  { key: 'dresses', image: 'dresses', category: 'dresses' },
  { key: 'suits', image: 'suits', category: 'suits' },
  { key: 'uniforms', image: 'uniforms', category: 'uniforms' },
  { key: 'wedding', image: 'wedding', category: 'wedding' },
] as const satisfies readonly { key: string; image: Scene; category: string }[];
