import { z } from 'zod';
import { audit, who, type Actor } from '../auth/audit';
import { can } from '../auth/permissions';
import { canEdit, getTailor } from '../tailors/repo';
import { isRealDate } from '../tailors/schemas';
import type { Variant } from './keys';
import { reconcileImages } from './reconcile';
import {
  deleteImage,
  storeImage,
  type MediaBindings,
  type StoreResult,
} from './store';

type Failure =
  'locked' | 'not_found' | 'invalid' | 'forbidden' | 'not_permitted';
export type Result = { ok: true } | { ok: false; error: Failure };

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;
const details = z.object({
  alt_text: z.string().trim().min(1).max(200),
  caption: z.string().trim().max(200).optional(),
});

/** Photos are public content, so the same edit lock as the profile applies (editors: unpublished tailors only). */
async function editableTailor(
  b: MediaBindings,
  role: string,
  tailorId: number,
): Promise<{ ok: false; error: 'locked' | 'not_found' } | { ok: true }> {
  const tailor = await getTailor(b.DB, tailorId);
  if (!tailor) return { ok: false, error: 'not_found' };
  return canEdit(role, tailor) ? { ok: true } : { ok: false, error: 'locked' };
}

async function ownsImage(b: MediaBindings, tailorId: number, imageId: number) {
  return b.DB.prepare(
    'SELECT id, permission_granted, is_visible FROM portfolio_image WHERE id = ? AND tailor_id = ?',
  )
    .bind(imageId, tailorId)
    .first<{ id: number; permission_granted: number; is_visible: number }>();
}

export async function uploadPhoto(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  input: {
    alt_text: string;
    caption?: string;
    variants: Record<Variant, Uint8Array>;
  },
): Promise<StoreResult | { ok: false; error: 'locked' }> {
  const gate = await editableTailor(b, role, tailorId);
  if (!gate.ok) return gate;
  return storeImage(b, actorId, tailorId, input);
}

/** Runs a guarded change to one image and audits it. */
async function change(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
  run: () => Promise<Result>,
  after?: () => Promise<unknown>,
): Promise<Result> {
  const gate = await editableTailor(b, role, tailorId);
  if (!gate.ok) return gate;
  if (!(await ownsImage(b, tailorId, imageId)))
    return { ok: false, error: 'not_found' };
  const result = await run();
  if (!result.ok) return result;
  await audit(b.DB, {
    ...who(actorId),
    action: 'image_changed',
    entityType: 'portfolio_image',
    entityId: imageId,
  });
  await after?.();
  return { ok: true };
}

export function updateDetails(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
  input: { alt_text: string; caption?: string },
): Promise<Result> {
  const parsed = details.safeParse(input);
  return change(b, actorId, role, tailorId, imageId, async () => {
    if (!parsed.success) return { ok: false, error: 'invalid' };
    await b.DB.prepare(
      `UPDATE portfolio_image SET alt_text = ?, caption = ?, updated_at = ${NOW} WHERE id = ?`,
    )
      .bind(parsed.data.alt_text, parsed.data.caption || null, imageId)
      .run();
    return { ok: true };
  });
}

export function setOrder(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
  sortOrder: number,
): Promise<Result> {
  return change(b, actorId, role, tailorId, imageId, async () => {
    if (!Number.isInteger(sortOrder)) return { ok: false, error: 'invalid' };
    await b.DB.prepare(
      `UPDATE portfolio_image SET sort_order = ?, updated_at = ${NOW} WHERE id = ?`,
    )
      .bind(sortOrder, imageId)
      .run();
    return { ok: true };
  });
}

export function setVisibility(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
  visible: boolean,
): Promise<Result> {
  return change(
    b,
    actorId,
    role,
    tailorId,
    imageId,
    async () => {
      await b.DB.prepare(
        `UPDATE portfolio_image SET is_visible = ?, updated_at = ${NOW} WHERE id = ?`,
      )
        .bind(visible ? 1 : 0, imageId)
        .run();
      return { ok: true };
    },
    () => reconcileImages(b, tailorId),
  );
}

/** Whether the tailor has allowed this photo to be shown (BR-06). Managers and owners only; applies to the public bucket at once. */
export async function setImagePermission(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
  input: { granted: boolean; date?: string },
): Promise<Result> {
  if (!can(role, 'tailor.publish')) return { ok: false, error: 'forbidden' };
  if (!(await getTailor(b.DB, tailorId)))
    return { ok: false, error: 'not_found' };
  if (!(await ownsImage(b, tailorId, imageId)))
    return { ok: false, error: 'not_found' };
  const date = input.date ?? '';
  if (input.granted && !(/^\d{4}-\d{2}-\d{2}$/.test(date) && isRealDate(date)))
    return { ok: false, error: 'invalid' };
  await b.DB.prepare(
    `UPDATE portfolio_image SET permission_granted = ?, permission_date = ?, updated_at = ${NOW} WHERE id = ?`,
  )
    .bind(input.granted ? 1 : 0, input.granted ? date : null, imageId)
    .run();
  await audit(b.DB, {
    ...who(actorId),
    action: 'image_changed',
    entityType: 'portfolio_image',
    entityId: imageId,
  });
  await reconcileImages(b, tailorId);
  return { ok: true };
}

export async function setProfilePhoto(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
): Promise<Result> {
  const gate = await editableTailor(b, role, tailorId);
  if (!gate.ok) return gate;
  const image = await ownsImage(b, tailorId, imageId);
  if (!image) return { ok: false, error: 'not_found' };
  if (!image.permission_granted || !image.is_visible)
    return { ok: false, error: 'not_permitted' };
  await b.DB.batch([
    b.DB.prepare(
      'UPDATE portfolio_image SET is_profile_photo = 0 WHERE tailor_id = ? AND is_profile_photo = 1 AND id <> ?',
    ).bind(tailorId, imageId),
    b.DB.prepare(
      'UPDATE portfolio_image SET is_profile_photo = 1 WHERE id = ? AND tailor_id = ?',
    ).bind(imageId, tailorId),
    b.DB.prepare(`UPDATE tailor SET updated_at = ${NOW} WHERE id = ?`).bind(
      tailorId,
    ),
  ]);
  await audit(b.DB, {
    ...who(actorId),
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: tailorId,
  });
  return { ok: true };
}

export async function removePhoto(
  b: MediaBindings,
  actorId: Actor,
  role: string,
  tailorId: number,
  imageId: number,
): Promise<Result> {
  const gate = await editableTailor(b, role, tailorId);
  if (!gate.ok) return gate;
  return deleteImage(b, actorId, tailorId, imageId);
}
