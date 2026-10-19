/** One of three cloth looks for the illustrated stand-in, stable per tailor so a card and its profile match. */
export const swatchVariant = (slug: string): 0 | 1 | 2 => {
  let sum = 0;
  for (const ch of slug) sum += ch.charCodeAt(0);
  return (sum % 3) as 0 | 1 | 2;
};
