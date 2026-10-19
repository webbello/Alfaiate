import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { addNote, listNotes } from '../../src/modules/tailors/notes';
import { createDraft } from '../../src/modules/tailors/repo';

const db = env.DB;
let n = 0;
const user = async (email = `n${++n}@example.test`) =>
  (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      )
      .bind(email, 'h', 'editor')
      .run()
  ).meta.last_row_id;
const tailor = async (by: number) => {
  const created = await createDraft(db, by, { display_name: `Notes ${++n}` });
  if (!created.ok) throw new Error('create failed');
  return created.id;
};

describe('internal notes (FR-ADM-08)', () => {
  it('adds a note and lists the newest first with the author', async () => {
    const by = await user('author@example.test');
    const id = await tailor(by);
    await addNote(db, by, id, 'first');
    await addNote(db, by, id, 'second');
    const notes = await listNotes(db, id);
    expect(notes.map((x) => x.body)).toEqual(['second', 'first']);
    expect(notes[0].author_email).toBe('author@example.test');
  });

  it('refuses an empty or very long note and an unknown tailor', async () => {
    const by = await user();
    const id = await tailor(by);
    expect(await addNote(db, by, id, '   ')).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await addNote(db, by, id, 'x'.repeat(2001))).toEqual({
      ok: false,
      error: 'invalid',
    });
    expect(await addNote(db, by, 99999, 'hello')).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('keeps notes per tailor and ties each to exactly that tailor', async () => {
    const by = await user();
    const [a, b] = [await tailor(by), await tailor(by)];
    await addNote(db, by, a, 'only for a');
    expect(await listNotes(db, b)).toHaveLength(0);
    const row = await db
      .prepare(
        'SELECT enquiry_id, referral_id FROM internal_note WHERE tailor_id = ?',
      )
      .bind(a)
      .first();
    expect(row).toEqual({ enquiry_id: null, referral_id: null });
  });

  it('is allowed on a published tailor: notes are internal, never public content', async () => {
    const by = await user();
    const id = await tailor(by);
    await db
      .prepare(
        "UPDATE tailor SET status = 'approved', permission_recorded = 1, is_published = 1 WHERE id = ?",
      )
      .bind(id)
      .run();
    expect(await addNote(db, by, id, 'follow up next week')).toEqual({
      ok: true,
    });
  });

  it('audits by id only', async () => {
    const by = await user();
    const id = await tailor(by);
    await addNote(db, by, id, 'Private words about the tailor');
    const rows = await db
      .prepare(
        "SELECT * FROM audit_log WHERE admin_user_id = ? AND action = 'tailor_updated'",
      )
      .bind(by)
      .all();
    expect(JSON.stringify(rows.results)).not.toContain('Private words');
  });
});
