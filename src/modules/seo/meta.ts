/** Text for <meta name="description"> and similar: no markup characters, single spaces, cut at a word boundary. */
export function metaText(text: string, max: number): string {
  const clean = text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
