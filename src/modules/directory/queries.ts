import { fitLike, likeAnywhere } from '../db/like';
import { isVerifiable } from '../tailors/verification';
import type { DirectoryFilters } from './filters';
import type { CardView, Choice, PhotoView, Price, ProfileView } from './view';

// Every statement here names its columns. There is deliberately no `SELECT *` and no join to notes, fees or permission data.
export const MAX_CARDS = 200;

type Db = D1Database;
const asJson = (ids: number[]) => JSON.stringify(ids);
const photoView = (
  tailorId: number,
  row: { file_key: string; alt_text: string; caption?: string | null },
): PhotoView => ({
  base: `tailor/${tailorId}/${row.file_key}`,
  alt: row.alt_text,
  caption: row.caption ?? null,
});

function verifiedSet(json: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(json);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter(
            (f): f is string => typeof f === 'string' && isVerifiable(f),
          )
        : [],
    );
  } catch {
    return new Set(); // a damaged list verifies nothing
  }
}

function priceHint(
  prices: { price_from: number | null; price_to: number | null }[],
): Price | null {
  const from = prices
    .map((p) => p.price_from)
    .filter((v): v is number => v !== null);
  const to = prices
    .map((p) => p.price_to)
    .filter((v): v is number => v !== null);
  if (from.length === 0 && to.length === 0) return null;
  return {
    from: from.length ? Math.min(...from) : null,
    to: to.length ? Math.max(...to) : null,
  };
}

type CatRow = {
  tailor_id: number;
  slug: string;
  name: string;
  price_from: number | null;
  price_to: number | null;
  price_unit_note: string | null;
  price_source: string;
  price_confirmed_on: string | null;
};
async function categoriesFor(db: Db, ids: number[]): Promise<CatRow[]> {
  const { results } = await db
    .prepare(
      `SELECT tc.tailor_id, c.slug, c.name, tc.price_from, tc.price_to, tc.price_unit_note, tc.price_source, tc.price_confirmed_on
       FROM tailor_category tc JOIN garment_category c ON c.id = tc.category_id
       WHERE c.is_active = 1 AND tc.tailor_id IN (SELECT value FROM json_each(?)) ORDER BY c.sort_order, c.name`,
    )
    .bind(asJson(ids))
    .all<CatRow>();
  return results;
}

type AreaRow = {
  tailor_id: number;
  slug: string;
  name: string;
  kind: 'shop_location' | 'serves';
};
async function areasFor(db: Db, ids: number[]): Promise<AreaRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ta.tailor_id, a.slug, a.name, ta.kind FROM tailor_area ta JOIN service_area a ON a.id = ta.area_id
       WHERE a.is_active = 1 AND ta.tailor_id IN (SELECT value FROM json_each(?)) ORDER BY a.sort_order, a.name, ta.kind`,
    )
    .bind(asJson(ids))
    .all<AreaRow>();
  return results;
}

type PhotoRow = {
  id: number;
  tailor_id: number;
  file_key: string;
  alt_text: string;
  caption: string | null;
};
/** Photos that may be shown: permission recorded, not hidden. (Tailor publication is checked by every caller's own query.) */
async function permittedPhotos(
  db: Db,
  where: 'tailor' | 'ids',
  ids: number[],
): Promise<PhotoRow[]> {
  const filter =
    where === 'tailor'
      ? 'i.tailor_id IN (SELECT value FROM json_each(?))'
      : 'i.id IN (SELECT value FROM json_each(?))';
  const { results } = await db
    .prepare(
      `SELECT i.id, i.tailor_id, i.file_key, i.alt_text, i.caption FROM portfolio_image i
       WHERE i.permission_granted = 1 AND i.is_visible = 1 AND ${filter} ORDER BY i.sort_order, i.id`,
    )
    .bind(asJson(ids))
    .all<PhotoRow>();
  return results;
}

export async function listPublished(
  db: Db,
  filters: DirectoryFilters,
): Promise<{ tailors: CardView[]; truncated: boolean }> {
  const where = ['t.is_published = 1 AND t.permission_recorded = 1'];
  const binds: unknown[] = [];
  if (filters.category) {
    where.push(
      'EXISTS (SELECT 1 FROM tailor_category tc JOIN garment_category c ON c.id = tc.category_id WHERE tc.tailor_id = t.id AND c.slug = ? AND c.is_active = 1)',
    );
    binds.push(filters.category);
  }
  if (filters.area) {
    where.push(
      'EXISTS (SELECT 1 FROM tailor_area ta JOIN service_area a ON a.id = ta.area_id WHERE ta.tailor_id = t.id AND a.slug = ? AND a.is_active = 1)',
    );
    binds.push(filters.area);
  }
  if (filters.homeVisit) where.push("t.home_visits = 'yes'");
  const q = fitLike(filters.q ?? '');
  if (q) {
    where.push("t.display_name LIKE ? ESCAPE '\\'");
    binds.push(likeAnywhere(q));
  }

  const { results } = await db
    .prepare(
      `SELECT t.id, t.slug, t.display_name, t.home_visits, t.profile_photo_id, t.description, t.whatsapp_e164, t.contact_publish_consent FROM tailor t
       WHERE ${where.join(' AND ')} ORDER BY t.display_name COLLATE NOCASE, t.id LIMIT ?`,
    )
    .bind(...binds, MAX_CARDS + 1)
    .all<{
      id: number;
      slug: string;
      display_name: string;
      home_visits: string;
      profile_photo_id: number | null;
      description: string | null;
      whatsapp_e164: string | null;
      contact_publish_consent: number;
    }>();
  const truncated = results.length > MAX_CARDS;
  const rows = results.slice(0, MAX_CARDS);
  if (rows.length === 0) return { tailors: [], truncated };

  const ids = rows.map((r) => r.id);
  const [cats, areas, photos] = await Promise.all([
    categoriesFor(db, ids),
    areasFor(db, ids),
    permittedPhotos(
      db,
      'ids',
      rows
        .map((r) => r.profile_photo_id)
        .filter((v): v is number => v !== null),
    ),
  ]);
  const photoById = new Map(photos.map((p) => [p.id, p]));

  return {
    truncated,
    tailors: rows.map((r) => {
      const own = cats.filter((c) => c.tailor_id === r.id);
      const found =
        r.profile_photo_id !== null
          ? photoById.get(r.profile_photo_id)
          : undefined;
      const photo = found?.tailor_id === r.id ? found : undefined;
      return {
        slug: r.slug,
        name: r.display_name,
        photo: photo ? photoView(r.id, photo) : null,
        specialties: own.map((c) => c.name),
        areas: areas.filter((a) => a.tailor_id === r.id).map((a) => a.name),
        homeVisits:
          r.home_visits === 'yes' || r.home_visits === 'no'
            ? r.home_visits
            : null,
        priceHint: priceHint(own),
        description: shorten(r.description, 110),
        whatsapp: r.contact_publish_consent === 1 ? r.whatsapp_e164 : null,
      };
    }),
  };
}

/** A card shows the start of the description, cut at a word. */
function shorten(text: string | null, max: number): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : max).trimEnd()}…`;
}

export async function getPublishedBySlug(
  db: Db,
  slug: string,
): Promise<ProfileView | null> {
  const t = await db
    .prepare(
      `SELECT id, slug, display_name, description, shop_address_text, home_visits, languages, price_note, whatsapp_e164, phone_e164,
              contact_publish_consent, verified_fields, profile_photo_id
       FROM tailor WHERE slug = ? AND is_published = 1 AND permission_recorded = 1`,
    )
    .bind(slug)
    .first<{
      id: number;
      slug: string;
      display_name: string;
      description: string | null;
      shop_address_text: string | null;
      home_visits: string;
      languages: string | null;
      price_note: string | null;
      whatsapp_e164: string | null;
      phone_e164: string | null;
      contact_publish_consent: number;
      verified_fields: string;
      profile_photo_id: number | null;
    }>();
  if (!t) return null;

  const [cats, areas, photos] = await Promise.all([
    categoriesFor(db, [t.id]),
    areasFor(db, [t.id]),
    permittedPhotos(db, 'tailor', [t.id]),
  ]);
  const verified = verifiedSet(t.verified_fields);
  const fact = <V>(
    value: V | null | undefined,
    field: string,
  ): { value: V; verified: boolean } | null =>
    value === null || value === undefined || value === ''
      ? null
      : { value, verified: verified.has(field) };
  const consented = t.contact_publish_consent === 1;
  const gallery = photos.map((p) => photoView(t.id, p));
  const profilePhoto = photos.find((p) => p.id === t.profile_photo_id);

  return {
    slug: t.slug,
    name: t.display_name,
    description: fact(t.description, 'description'),
    address: consented ? fact(t.shop_address_text, 'shop_address_text') : null,
    languages: verified.has('languages')
      ? fact(t.languages, 'languages')
      : null,
    homeVisits:
      t.home_visits === 'yes' || t.home_visits === 'no'
        ? { value: t.home_visits, verified: verified.has('home_visits') }
        : null,
    priceNote: fact(t.price_note, 'price_note'),
    contacts: {
      whatsapp: consented ? fact(t.whatsapp_e164, 'whatsapp') : null,
      phone: consented ? fact(t.phone_e164, 'phone') : null,
    },
    categories: cats.map((c) => ({
      slug: c.slug,
      name: c.name,
      priceFrom: c.price_from,
      priceTo: c.price_to,
      unit: c.price_unit_note,
      confirmedOn: c.price_confirmed_on,
      verified: c.price_source === 'verified',
    })),
    areas: areas.map((a) => ({ slug: a.slug, name: a.name, kind: a.kind })),
    photos: gallery,
    profilePhoto: profilePhoto ? photoView(t.id, profilePhoto) : null,
    priceHint: priceHint(cats),
  };
}

/** Active categories for filters and links; `onlyWithTailors` keeps just those with at least one published tailor. */
export async function listActiveCategories(
  db: Db,
  { onlyWithTailors = false } = {},
): Promise<Choice[]> {
  const used = onlyWithTailors
    ? 'AND EXISTS (SELECT 1 FROM tailor_category tc JOIN tailor t ON t.id = tc.tailor_id WHERE tc.category_id = c.id AND t.is_published = 1 AND t.permission_recorded = 1)'
    : '';
  const { results } = await db
    .prepare(
      `SELECT c.slug, c.name FROM garment_category c WHERE c.is_active = 1 ${used} ORDER BY c.sort_order, c.name`,
    )
    .all<Choice>();
  return results;
}

export async function listActiveAreas(
  db: Db,
  { onlyWithTailors = false } = {},
): Promise<Choice[]> {
  const used = onlyWithTailors
    ? 'AND EXISTS (SELECT 1 FROM tailor_area ta JOIN tailor t ON t.id = ta.tailor_id WHERE ta.area_id = a.id AND t.is_published = 1 AND t.permission_recorded = 1)'
    : '';
  const { results } = await db
    .prepare(
      `SELECT a.slug, a.name FROM service_area a WHERE a.is_active = 1 ${used} ORDER BY a.sort_order, a.name`,
    )
    .all<Choice>();
  return results;
}

export async function getActiveCategory(
  db: Db,
  slug: string,
): Promise<Choice | null> {
  return db
    .prepare(
      'SELECT slug, name FROM garment_category WHERE slug = ? AND is_active = 1',
    )
    .bind(slug)
    .first<Choice>();
}

/** Pages that belong in the sitemap: the home page, the directory, categories that have a published tailor and every published tailor. */
export async function listSitemapPaths(db: Db): Promise<string[]> {
  const [tailors, categories] = await Promise.all([
    db
      .prepare(
        'SELECT slug FROM tailor WHERE is_published = 1 AND permission_recorded = 1 ORDER BY slug LIMIT 50000',
      )
      .all<{ slug: string }>(),
    listActiveCategories(db, { onlyWithTailors: true }),
  ]);
  return [
    '/',
    '/tailors',
    ...categories.map((c) => `/categories/${c.slug}`),
    ...tailors.results.map((t) => `/tailors/${t.slug}`),
  ];
}
