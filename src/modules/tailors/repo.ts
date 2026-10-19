import { audit } from '../auth/audit';
import { can } from '../auth/permissions';
import { uniqueSlug } from '../db/unique-slug';
import {
  createSchema,
  failedFields,
  updateSchema,
  type ProfileInput,
} from './schemas';

export type TailorRow = {
  id: number;
  slug: string;
  display_name: string;
  description: string | null;
  profile_photo_id: number | null;
  shop_address_text: string | null;
  home_visits: 'yes' | 'no' | 'unknown';
  languages: string | null;
  price_note: string | null;
  price_confirmed_on: string | null;
  whatsapp_e164: string | null;
  phone_e164: string | null;
  status: 'draft' | 'approved' | 'suspended' | 'archived';
  is_published: number;
  published_at: string | null;
  permission_recorded: number;
  permission_note: string | null;
  permission_date: string | null;
  contact_publish_consent: number;
  verified_fields: string;
  fee_terms_text: string | null;
  fee_terms_agreed_on: string | null;
  private_contact_name: string | null;
  private_phone: string | null;
};

export type ListRow = Pick<
  TailorRow,
  | 'id'
  | 'slug'
  | 'display_name'
  | 'status'
  | 'is_published'
  | 'permission_recorded'
  | 'home_visits'
> & { updated_at: string };

export type CreateResult =
  | { ok: true; id: number; slug: string }
  | { ok: false; error: 'invalid'; fields: string[] };
export type UpdateResult =
  | { ok: true }
  | { ok: false; error: 'invalid'; fields: string[] }
  | { ok: false; error: 'locked' | 'not_found' | 'slug_locked' | 'slug_taken' };

const STATUSES = ['draft', 'approved', 'suspended', 'archived'] as const;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// Form field -> column. The only columns the profile form may write.
const COLUMN = {
  display_name: 'display_name',
  slug: 'slug',
  description: 'description',
  shop_address_text: 'shop_address_text',
  home_visits: 'home_visits',
  languages: 'languages',
  price_note: 'price_note',
  price_confirmed_on: 'price_confirmed_on',
  whatsapp: 'whatsapp_e164',
  phone: 'phone_e164',
  private_contact_name: 'private_contact_name',
  private_phone: 'private_phone',
} as const;

/** Editors may edit drafts and unpublished tailors; a published tailor needs tailor.publish (SPEC-phase-3 assumption 2). */
export function canEdit(
  role: string,
  tailor: Pick<TailorRow, 'is_published'>,
): boolean {
  return (
    can(role, 'tailor.publish') ||
    (can(role, 'tailor.edit') && !tailor.is_published)
  );
}

export async function getTailor(
  db: D1Database,
  id: number,
): Promise<TailorRow | null> {
  return db
    .prepare('SELECT * FROM tailor WHERE id = ?')
    .bind(id)
    .first<TailorRow>();
}

export async function listTailors(
  db: D1Database,
  filter: { status?: (typeof STATUSES)[number]; published?: boolean },
): Promise<ListRow[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (filter.status !== undefined) {
    if (!STATUSES.includes(filter.status)) throw new Error('Unknown status');
    where.push('status = ?');
    binds.push(filter.status);
  }
  if (filter.published !== undefined) {
    where.push('is_published = ?');
    binds.push(filter.published ? 1 : 0);
  }
  const { results } = await db
    .prepare(
      `SELECT id, slug, display_name, status, is_published, permission_recorded, home_visits, updated_at FROM tailor ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY display_name`,
    )
    .bind(...binds)
    .all<ListRow>();
  return results;
}

export async function createDraft(
  db: D1Database,
  actorId: number,
  input: ProfileInput,
): Promise<CreateResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fields: failedFields(parsed.error) };
  const data = parsed.data;
  const slug = await uniqueSlug(db, 'tailor', data.display_name);
  const created = await db
    .prepare(
      `INSERT INTO tailor (slug, display_name, description, shop_address_text, home_visits, languages, price_note, price_confirmed_on, whatsapp_e164, phone_e164, private_contact_name, private_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      slug,
      data.display_name,
      data.description ?? null,
      data.shop_address_text ?? null,
      data.home_visits,
      data.languages ?? null,
      data.price_note ?? null,
      data.price_confirmed_on ?? null,
      data.whatsapp ?? null,
      data.phone ?? null,
      data.private_contact_name ?? null,
      data.private_phone ?? null,
    )
    .run();
  const id = created.meta.last_row_id;
  await audit(db, {
    userId: actorId,
    action: 'tailor_created',
    entityType: 'tailor',
    entityId: id,
  });
  return { ok: true, id, slug };
}

export async function updateProfile(
  db: D1Database,
  actorId: number,
  role: string,
  id: number,
  input: ProfileInput,
): Promise<UpdateResult> {
  const tailor = await getTailor(db, id);
  if (!tailor) return { ok: false, error: 'not_found' };
  if (!canEdit(role, tailor)) return { ok: false, error: 'locked' };
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: 'invalid', fields: failedFields(parsed.error) };

  const sets: string[] = [];
  const binds: unknown[] = [];
  for (const [field, value] of Object.entries(parsed.data) as [
    keyof typeof COLUMN,
    unknown,
  ][]) {
    if (value === undefined) continue;
    if (field === 'slug' && value !== tailor.slug) {
      if (tailor.is_published || tailor.published_at)
        return { ok: false, error: 'slug_locked' };
      if (
        await db
          .prepare('SELECT 1 FROM tailor WHERE slug = ? AND id <> ?')
          .bind(value, id)
          .first()
      )
        return { ok: false, error: 'slug_taken' };
    }
    sets.push(`${COLUMN[field]} = ?`);
    binds.push(value);
  }
  if (sets.length > 0) {
    await db
      .prepare(
        `UPDATE tailor SET ${sets.join(', ')}, updated_at = ${NOW} WHERE id = ?`,
      )
      .bind(...binds, id)
      .run();
  }
  await audit(db, {
    userId: actorId,
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: id,
  });
  return { ok: true };
}
