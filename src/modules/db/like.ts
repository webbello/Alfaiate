/** A LIKE pattern that matches `text` anywhere, with its wildcards escaped (use with ESCAPE '\'). */
export const likeAnywhere = (text: string) =>
  `%${text.replace(/[\\%_]/g, '\\$&')}%`;

/** D1 rejects LIKE patterns over 50 bytes, so cut the search until its escaped pattern fits (emoji and % cost more bytes). */
export function fitLike(text: string): string {
  let q = text.trim();
  while (q && new TextEncoder().encode(likeAnywhere(q)).length > 50)
    q = [...q].slice(0, -1).join(''); // whole characters, never half an emoji
  return q;
}
