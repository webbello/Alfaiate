const MAX_LENGTH = 60;

/** URL-safe ASCII slug from a display name. Uniqueness is the repository's job (it appends a number). */
export function slugify(name: string, fallback = 'tailor'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_LENGTH)
    .replace(/-+$/, '');
  return slug || fallback;
}
