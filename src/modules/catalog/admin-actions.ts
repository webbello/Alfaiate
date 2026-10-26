import {
  createEntry,
  renameEntry,
  setActive,
  setOrder,
  type Kind,
} from './index';

/** Applies one submitted catalog form and returns the message code to show (an allow-listed key of adminMessages). */
export async function applyCatalogForm(
  db: D1Database,
  actorId: number,
  kind: Kind,
  form: FormData,
): Promise<'added' | 'saved' | 'invalid' | 'not_found'> {
  const field = (name: string) => form.get(name)?.toString() ?? '';
  const id = Number(field('id'));
  const done = (
    result: { ok: true } | { ok: false; error: 'invalid' | 'not_found' },
  ) => (result.ok ? 'saved' : result.error);
  const data = {
    name: field('name'),
    description: field('description') || undefined,
  };
  switch (field('action')) {
    case 'create': {
      const created = await createEntry(db, actorId, kind, data);
      return created.ok ? 'added' : created.error;
    }
    case 'rename':
      return Number.isInteger(id)
        ? done(await renameEntry(db, actorId, kind, id, data))
        : 'invalid';
    // one Save for a whole row: the name (and description) and the order together; the single-purpose actions below stay for older forms
    case 'update': {
      // check the order first, so a bad one cannot leave the rename saved
      if (
        !Number.isInteger(id) ||
        field('sort_order') === '' ||
        !Number.isInteger(Number(field('sort_order')))
      )
        return 'invalid';
      const renamed = await renameEntry(db, actorId, kind, id, data);
      if (!renamed.ok) return renamed.error;
      return done(
        await setOrder(db, actorId, kind, id, Number(field('sort_order'))),
      );
    }
    case 'set_order':
      return Number.isInteger(id) && field('sort_order') !== ''
        ? done(
            await setOrder(db, actorId, kind, id, Number(field('sort_order'))),
          )
        : 'invalid';
    case 'set_active':
      return Number.isInteger(id)
        ? done(await setActive(db, actorId, kind, id, field('active') === '1'))
        : 'invalid';
    default:
      return 'invalid';
  }
}
