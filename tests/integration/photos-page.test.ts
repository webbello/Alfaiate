import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';
import { worker } from './worker';

const addTailor = async (published = false) => {
  const id = (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name, phone_e164) VALUES (?, 'Photos Fake', '+67077123456')",
    )
      .bind(`ph-${unique()}`)
      .run()
  ).meta.last_row_id;
  if (published)
    await env.DB.prepare(
      "UPDATE tailor SET status = 'approved', permission_recorded = 1, contact_publish_consent = 1, is_published = 1 WHERE id = ?",
    )
      .bind(id)
      .run();
  return id;
};
const addImage = async (tailorId: number, alt: string, permission = 0) => {
  const key = unique().toString(16).padStart(32, '0');
  await env.DB.prepare(
    'INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted, permission_date) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(tailorId, key, alt, permission, permission ? '2026-10-01' : null)
    .run();
  return key;
};

describe('photos section on the tailor page', () => {
  it('offers the upload form and loads the script as an external file, with no inline script or style (CSP)', async () => {
    const cookie = await signIn('editor');
    const html = await (
      await get(`/admin/tailors/${await addTailor()}`, cookie)
    ).text();
    expect(html).toContain('data-photo-upload');
    expect(html).toContain('enctype="multipart/form-data"');
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, tag).toMatch(/\bsrc="/);
    expect(html).not.toContain('<style');
  });

  it('serves the upload script itself, and it contains no EXIF-copying shortcut', async () => {
    const cookie = await signIn('editor');
    const html = await (
      await get(`/admin/tailors/${await addTailor()}`, cookie)
    ).text();
    const src = html.match(/<script[^>]*\bsrc="([^"]+)"/)?.[1];
    expect(src).toBeTruthy();
    const script = await worker.fetch(
      new Request(`https://example.test${src}`),
    );
    expect(script.status).toBe(200);
    const code = await script.text();
    expect(code).toContain('toBlob'); // pictures are redrawn on a canvas, which drops metadata
    expect(code).not.toContain('innerHTML');
  });

  it('shows private thumbnails through the admin preview route, with the alt text escaped', async () => {
    const cookie = await signIn('editor');
    const id = await addTailor();
    const key = await addImage(id, '"><img src=x onerror=alert(1)>');
    const html = await (await get(`/admin/tailors/${id}`, cookie)).text();
    expect(html).toContain(`/admin/media/tailor/${id}/${key}/thumb.jpg`);
    expect(html).not.toContain('"><img');
    expect(html).toContain('No permission recorded');
  });

  it('shows permission controls to managers only', async () => {
    const [editor, manager] = [await signIn('editor'), await signIn('manager')];
    const id = await addTailor();
    await addImage(id, 'A suit');
    expect(
      await (await get(`/admin/tailors/${id}`, editor)).text(),
    ).not.toContain('image_permission');
    expect(await (await get(`/admin/tailors/${id}`, manager)).text()).toContain(
      'image_permission',
    );
  });

  it('hides upload and edit controls from an editor on a published tailor, but still lists the photos', async () => {
    const editor = await signIn('editor');
    const id = await addTailor(true);
    await addImage(id, 'Live photo', 1);
    const html = await (await get(`/admin/tailors/${id}`, editor)).text();
    expect(html).not.toContain('data-photo-upload');
    expect(html).not.toContain('name="action" value="delete"');
    expect(html).toContain('Live photo');
  });

  it('stops offering uploads at ten photos', async () => {
    const editor = await signIn('editor');
    const id = await addTailor();
    for (let i = 0; i < 10; i++) {
      await env.DB.prepare(
        'INSERT INTO portfolio_image (tailor_id, file_key, alt_text) VALUES (?, ?, ?)',
      )
        .bind(id, `${i}`.repeat(32), `p${i}`)
        .run();
    }
    const html = await (await get(`/admin/tailors/${id}`, editor)).text();
    expect(html).not.toContain('data-photo-upload');
    expect(html).toContain('maximum of 10 photos');
  });
});
