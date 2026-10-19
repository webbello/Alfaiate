import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, signIn, unique } from './helpers';

// Phase 7b T6: the tailor page says in words what is still needed to publish, and the tailors list says it per tailor.
const db = env.DB;
const tailor = async (
  o: {
    status?: string;
    permission?: number;
    consent?: number;
    whatsapp?: string | null;
    published?: number;
    name?: string;
  } = {},
) => {
  const slug = `cl-${unique()}`;
  const id = (
    await db
      .prepare(
        'INSERT INTO tailor (slug, display_name, status, permission_recorded, contact_publish_consent, whatsapp_e164, is_published) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        slug,
        o.name ?? `Checklist ${unique()}`,
        o.status ?? 'draft',
        o.permission ?? 0,
        o.consent ?? 0,
        o.whatsapp === undefined ? null : o.whatsapp,
        o.published ?? 0,
      )
      .run()
  ).meta.last_row_id as number;
  return { id, slug };
};
const items = (html: string) =>
  [
    ...html.matchAll(
      /<li class="check check--(done|missing)">([\s\S]*?)<\/li>/g,
    ),
  ].map((m) => ({
    state: m[1],
    text: m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  }));

describe('the publish checklist on the tailor page', () => {
  it('lists the three requirements, all missing for a new draft, each with a link to where it is fixed', async () => {
    const t = await tailor();
    const html = await (
      await get(`/admin/tailors/${t.id}`, await signIn('manager'))
    ).text();
    const list = items(html);
    expect(list).toHaveLength(3);
    expect(list.every((i) => i.state === 'missing')).toBe(true);
    expect(list[0].text).toContain('Missing');
    expect(list[0].text).toContain('Approved by a manager');
    expect(html).toContain('href="#publish"');
    expect(html).toContain('href="#profile"');
    expect(html).toContain('id="publish"');
    expect(html).toContain('id="profile"');
    expect(html).toMatch(
      /3 things? (are|is) still missing|Not ready to publish/,
    );
  });

  it('marks each requirement done as it is met, and says the tailor is ready when all are', async () => {
    const partly = await tailor({ status: 'approved' });
    const partial = items(
      await (
        await get(`/admin/tailors/${partly.id}`, await signIn('manager'))
      ).text(),
    );
    expect(partial.map((i) => i.state)).toEqual(['done', 'missing', 'missing']);
    const ready = await tailor({
      status: 'approved',
      permission: 1,
      consent: 1,
      whatsapp: '+67077123456',
    });
    const html = await (
      await get(`/admin/tailors/${ready.id}`, await signIn('manager'))
    ).text();
    expect(items(html).every((i) => i.state === 'done')).toBe(true);
    expect(html).toContain('Ready to publish');
  });

  it('says a published tailor is live, with a link to the public page, and no checklist', async () => {
    const live = await tailor({
      status: 'approved',
      permission: 1,
      consent: 1,
      whatsapp: '+67077123456',
      published: 1,
    });
    const html = await (
      await get(`/admin/tailors/${live.id}`, await signIn('manager'))
    ).text();
    expect(items(html)).toEqual([]);
    expect(html).toContain(`href="/tailors/${live.slug}"`);
    expect(html).toMatch(/Published/);
  });

  it('shows the same list to an editor (who can see but not publish)', async () => {
    const t = await tailor();
    const html = await (
      await get(`/admin/tailors/${t.id}`, await signIn('editor'))
    ).text();
    expect(items(html)).toHaveLength(3);
  });
});

describe('the tailors list', () => {
  it('shows each tailor with status chips, what is missing, and how many are not ready', async () => {
    const draft = await tailor({ name: 'List Draft Fake' });
    await tailor({
      name: 'List Ready Fake',
      status: 'approved',
      permission: 1,
      consent: 1,
      whatsapp: '+67077123456',
    });
    await tailor({
      name: 'List Live Fake',
      status: 'approved',
      permission: 1,
      consent: 1,
      whatsapp: '+67077123456',
      published: 1,
    });
    const html = await (
      await get('/admin/tailors', await signIn('owner'))
    ).text();
    const row = (name: string) =>
      html.slice(html.indexOf(name), html.indexOf('</tr>', html.indexOf(name)));
    expect(row('List Draft Fake')).toContain('Draft');
    expect(row('List Draft Fake')).toContain(
      'Missing: approval, permission, contact',
    );
    expect(row('List Ready Fake')).toContain('Ready to publish');
    expect(row('List Live Fake')).toContain('Published');
    expect(row('List Live Fake')).not.toContain('Missing');
    expect(html).toMatch(/Not ready to publish: \d+/);
    expect(html).toContain(`href="/admin/tailors/${draft.id}"`);
  });
});
