import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import seed from '../../seeds/staging-shop.sql?raw';
import remove from '../../seeds/staging-shop-remove.sql?raw';
import { SCENES } from '../../src/components/home/images';
import { parseProductKey } from '../../src/modules/media/keys';
import { standInPrefix, standInUrl } from '../../src/modules/media/stand-in';

const statements = (sql: string) =>
  sql
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n')
    .split(';\n')
    .map((s) => s.trim())
    .filter(Boolean);

describe('staging sample shop (photo storage off)', () => {
  it('turns a scene key into the site image for each size, and knows nothing else', async () => {
    const key = `${await standInPrefix('shirts')}0001`;
    expect(parseProductKey(`product/7/${key}/thumb.jpg`)).not.toBeNull();
    const [small, large] = SCENES.shirts.widths;
    expect(await standInUrl(key, 'thumb')).toBe(
      `/images/site/shirts-${small}.webp`,
    );
    expect(await standInUrl(key, 'medium')).toBe(
      `/images/site/shirts-${large}.webp`,
    );
    expect(await standInUrl('0'.repeat(32), 'medium')).toBeNull();
  });

  it('every photo in the seed points at a real scene, and every key is unique', async () => {
    const keys = [...seed.matchAll(/'([0-9a-f]{32})' ,/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThanOrEqual(10);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys)
      expect(await standInUrl(key, 'medium'), key).not.toBeNull();
  });

  it('loads into the database, shows 10 published products with photos, and removes cleanly', async () => {
    for (const run of [seed, seed])
      for (const s of statements(run)) await env.DB.prepare(s).run(); // twice: safe to repeat
    const count = (sql: string) =>
      env.DB.prepare(sql)
        .first<{ c: number }>()
        .then((r) => r!.c);
    expect(
      await count(
        "SELECT count(*) AS c FROM product WHERE slug LIKE 'sample-%' AND is_published = 1",
      ),
    ).toBe(10);
    expect(
      await count(
        "SELECT count(*) AS c FROM product p WHERE slug LIKE 'sample-%' AND (SELECT count(*) FROM product_image i WHERE i.product_id = p.id) >= 1",
      ),
    ).toBe(10);
    expect(
      await count(
        "SELECT count(*) AS c FROM product WHERE slug LIKE 'sample-%' AND category_id IS NULL",
      ),
    ).toBe(0);
    for (const s of statements(remove)) await env.DB.prepare(s).run();
    expect(
      await count(
        "SELECT count(*) AS c FROM product WHERE slug LIKE 'sample-%'",
      ),
    ).toBe(0);
    expect(await count('SELECT count(*) AS c FROM product_image')).toBe(0);
  });
});
