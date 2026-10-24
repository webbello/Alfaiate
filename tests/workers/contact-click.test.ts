import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  CLICK_LIMIT,
  recordContactClick,
} from '../../src/modules/analytics/contact-click';

const db = env.DB;
let n = 0;
const T0 = new Date('2026-06-01T09:00:00.000Z');
const tailor = async (
  o: {
    published?: boolean;
    consent?: boolean;
    whatsapp?: string | null;
    phone?: string | null;
  } = {},
) => {
  const slug = `cc-${++n}`;
  const id = (
    await db
      .prepare(
        'INSERT INTO tailor (slug, display_name, whatsapp_e164, phone_e164, status, is_published, permission_recorded, contact_publish_consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .bind(
        slug,
        `CC Fake ${n}`,
        o.whatsapp === undefined ? '+67077123456' : o.whatsapp,
        o.phone === undefined ? '+67033123456' : o.phone,
        (o.published ?? true) ? 'approved' : 'draft',
        (o.published ?? true) ? 1 : 0,
        (o.published ?? true) ? 1 : 0,
        (o.consent ?? true) ? 1 : 0,
      )
      .run()
  ).meta.last_row_id;
  return { id, slug };
};
const rows = async (id: number) =>
  (
    await db
      .prepare(
        'SELECT channel, day, count FROM contact_click_daily WHERE tailor_id = ? ORDER BY channel, day',
      )
      .bind(id)
      .all()
  ).results;
const ip = () => `203.0.113.${(++n % 250) + 1}`;

describe('recordContactClick (ANA-02, M6)', () => {
  it('counts a tap per tailor, channel and UTC day', async () => {
    const t = await tailor();
    const address = ip();
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'whatsapp' },
        address,
        T0,
      ),
    ).toBe('recorded');
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'whatsapp' },
        address,
        T0,
      ),
    ).toBe('recorded');
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        address,
        T0,
      ),
    ).toBe('recorded');
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'whatsapp' },
        address,
        new Date('2026-06-02T00:00:01.000Z'),
      ),
    ).toBe('recorded');
    expect(await rows(t.id)).toEqual([
      { channel: 'phone', day: '2026-06-01', count: 1 },
      { channel: 'whatsapp', day: '2026-06-01', count: 2 },
      { channel: 'whatsapp', day: '2026-06-02', count: 1 },
    ]);
  });

  it('uses the UTC date, not the local one', async () => {
    const t = await tailor();
    await recordContactClick(
      db,
      { slug: t.slug, channel: 'phone' },
      ip(),
      new Date('2026-06-01T23:59:59.000Z'),
    );
    expect((await rows(t.id))[0].day).toBe('2026-06-01');
  });

  it('ignores taps for tailors that are not published, did not consent, or lack that channel', async () => {
    const draft = await tailor({ published: false });
    const noConsent = await tailor({ consent: false });
    const noWhatsapp = await tailor({ whatsapp: null });
    expect(
      await recordContactClick(
        db,
        { slug: draft.slug, channel: 'phone' },
        ip(),
        T0,
      ),
    ).toBe('not_found');
    expect(
      await recordContactClick(
        db,
        { slug: noConsent.slug, channel: 'phone' },
        ip(),
        T0,
      ),
    ).toBe('not_found');
    expect(
      await recordContactClick(
        db,
        { slug: noWhatsapp.slug, channel: 'whatsapp' },
        ip(),
        T0,
      ),
    ).toBe('not_found');
    expect(
      await recordContactClick(
        db,
        { slug: noWhatsapp.slug, channel: 'phone' },
        ip(),
        T0,
      ),
    ).toBe('recorded');
    for (const t of [draft, noConsent]) expect(await rows(t.id)).toEqual([]);
    expect(await rows(noWhatsapp.id)).toEqual([
      { channel: 'phone', day: '2026-06-01', count: 1 },
    ]);
  });

  it('refuses malformed input without touching the database', async () => {
    const t = await tailor();
    for (const bad of [
      { slug: t.slug, channel: 'email' },
      { slug: t.slug, channel: '' },
      { slug: '', channel: 'phone' },
      { slug: "x' OR 1=1 --", channel: 'phone' },
      { slug: 'a'.repeat(200), channel: 'phone' },
      { slug: t.slug, channel: 'phone ' },
    ])
      expect(
        await recordContactClick(db, bad, ip(), T0),
        JSON.stringify(bad),
      ).toBe('invalid');
    expect(
      await recordContactClick(
        db,
        { slug: 'no-such-tailor', channel: 'phone' },
        ip(),
        T0,
      ),
    ).toBe('not_found');
    expect(await rows(t.id)).toEqual([]);
  });

  it('stores nothing about the visitor: only tailor, channel, day and a count', async () => {
    const t = await tailor();
    await recordContactClick(
      db,
      { slug: t.slug, channel: 'phone' },
      '198.51.100.77',
      T0,
    );
    const columns = (
      await db
        .prepare("SELECT name FROM pragma_table_info('contact_click_daily')")
        .all<{ name: string }>()
    ).results
      .map((c) => c.name)
      .sort();
    expect(columns).toEqual(['channel', 'count', 'day', 'tailor_id']);
    const limiter = (
      await db
        .prepare('SELECT key_hash FROM rate_limit')
        .all<{ key_hash: string }>()
    ).results;
    expect(limiter.some((r) => r.key_hash.includes('198.51.100.77'))).toBe(
      false,
    );
  });

  it('still limits taps when no client address is available (shared bucket)', async () => {
    const t = await tailor();
    let last = 'recorded';
    for (let i = 0; i <= CLICK_LIMIT; i++)
      last = await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        undefined,
        T0,
      );
    expect(last).toBe('limited');
  });

  it('limits one address to a fixed number of taps per hour, without affecting others', async () => {
    const t = await tailor();
    const busy = '192.0.2.200';
    for (let i = 0; i < CLICK_LIMIT; i++)
      expect(
        await recordContactClick(
          db,
          { slug: t.slug, channel: 'phone' },
          busy,
          T0,
        ),
      ).toBe('recorded');
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        busy,
        T0,
      ),
    ).toBe('limited');
    expect((await rows(t.id))[0].count).toBe(CLICK_LIMIT);
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        '192.0.2.201',
        T0,
      ),
    ).toBe('recorded');
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        busy,
        new Date(T0.getTime() + 61 * 60_000),
      ),
    ).toBe('recorded');
  });

  it('counts every address in one IPv6 /64 as one visitor for the limit', async () => {
    const t = await tailor();
    for (let i = 0; i < CLICK_LIMIT; i++)
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        `2001:db8:1:2::${i + 1}`,
        T0,
      );
    expect(
      await recordContactClick(
        db,
        { slug: t.slug, channel: 'phone' },
        '2001:db8:1:2:ffff::9',
        T0,
      ),
    ).toBe('limited');
  });
});
