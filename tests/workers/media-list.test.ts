import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { listImages } from '../../src/modules/media/list';

describe('listImages', () => {
  it('lists a tailor’s photos in order, with keys and flags but no private data', async () => {
    const t = (
      await env.DB.prepare(
        "INSERT INTO tailor (slug, display_name) VALUES ('list-img', 'List Fake')",
      ).run()
    ).meta.last_row_id;
    const other = (
      await env.DB.prepare(
        "INSERT INTO tailor (slug, display_name) VALUES ('list-img-2', 'Other')",
      ).run()
    ).meta.last_row_id;
    await env.DB.prepare(
      "INSERT INTO portfolio_image (tailor_id, file_key, alt_text, sort_order) VALUES (?, 'bbbb', 'Second', 2), (?, 'aaaa', 'First', 1), (?, 'cccc', 'Not mine', 0)",
    )
      .bind(t, t, other)
      .run();
    const rows = await listImages(env.DB, t);
    expect(rows.map((r) => r.alt_text)).toEqual(['First', 'Second']);
    expect(rows[0]).toMatchObject({
      file_key: 'aaaa',
      permission_granted: 0,
      is_visible: 1,
      caption: null,
    });
  });
});
