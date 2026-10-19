import { z } from 'zod';
import { audit } from '../auth/audit';

export type Note = {
  id: number;
  body: string;
  created_at: string;
  author_email: string;
};

const body = z.string().trim().min(1).max(2000);

/** Internal notes are never public. They are allowed on published tailors too: a note changes nothing the public sees. */
export async function addNote(
  db: D1Database,
  authorId: number,
  tailorId: number,
  text: string,
): Promise<{ ok: true } | { ok: false; error: 'invalid' | 'not_found' }> {
  const parsed = body.safeParse(text);
  if (!parsed.success) return { ok: false, error: 'invalid' };
  if (
    !(await db
      .prepare('SELECT 1 FROM tailor WHERE id = ?')
      .bind(tailorId)
      .first())
  )
    return { ok: false, error: 'not_found' };
  await db
    .prepare(
      'INSERT INTO internal_note (body, author_id, tailor_id) VALUES (?, ?, ?)',
    )
    .bind(parsed.data, authorId, tailorId)
    .run();
  await audit(db, {
    userId: authorId,
    action: 'tailor_updated',
    entityType: 'tailor',
    entityId: tailorId,
  });
  return { ok: true };
}

export async function listNotes(
  db: D1Database,
  tailorId: number,
): Promise<Note[]> {
  const { results } = await db
    .prepare(
      'SELECT n.id, n.body, n.created_at, u.email AS author_email FROM internal_note n JOIN admin_user u ON u.id = n.author_id WHERE n.tailor_id = ? ORDER BY n.id DESC',
    )
    .bind(tailorId)
    .all<Note>();
  return results;
}
