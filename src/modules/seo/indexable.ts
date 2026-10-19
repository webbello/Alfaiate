/** Search engines may index the site only when `SITE_INDEXABLE` is exactly "true". Missing, empty or anything else means not indexable (staging, local). */
export const isIndexable = (value: string | undefined): boolean =>
  value === 'true';
