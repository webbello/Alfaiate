import { SLUG } from '../tailors/schemas';

export type DirectoryFilters = {
  category: string | undefined;
  area: string | undefined;
  homeVisit: boolean;
};

const slug = (value: string | null): string | undefined =>
  value !== null && value.length <= 60 && SLUG.test(value) ? value : undefined;

/** Reads the directory filters from a query string. Only plain slugs and `home_visit=1` are accepted; everything else is ignored. */
export function parseDirectoryFilters(
  params: URLSearchParams,
): DirectoryFilters {
  return {
    category: slug(params.get('category')),
    area: slug(params.get('area')),
    homeVisit: params.get('home_visit') === '1',
  };
}

/** Stable query string for links ("" when no filter is set). */
export function directoryQuery(filters: DirectoryFilters): string {
  const parts = [
    filters.category && `category=${filters.category}`,
    filters.area && `area=${filters.area}`,
    filters.homeVisit && 'home_visit=1',
  ].filter(Boolean);
  return parts.length ? `?${parts.join('&')}` : '';
}
