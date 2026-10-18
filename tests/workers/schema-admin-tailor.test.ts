import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';

const db = env.DB;
const run = (sql: string, ...binds: unknown[]) =>
  db
    .prepare(sql)
    .bind(...binds)
    .run();
const first = <T>(sql: string, ...binds: unknown[]) =>
  db
    .prepare(sql)
    .bind(...binds)
    .first<T>();

const addUser = async (email: string, role = 'owner') =>
  (
    await run(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
      email,
      'hash',
      role,
    )
  ).meta.last_row_id;
const addTailor = async (slug: string) =>
  (
    await run(
      'INSERT INTO tailor (slug, display_name) VALUES (?, ?)',
      slug,
      'Fake Tailor',
    )
  ).meta.last_row_id;
const addCategory = async (slug: string) =>
  (
    await run(
      'INSERT INTO garment_category (slug, name) VALUES (?, ?)',
      slug,
      slug,
    )
  ).meta.last_row_id;

describe('admin_user', () => {
  it('rejects a duplicate email regardless of case', async () => {
    await addUser('a@example.test');
    await expect(addUser('A@Example.test')).rejects.toThrow();
  });

  it('rejects a role outside owner, manager, editor, viewer', async () => {
    await expect(addUser('b@example.test', 'admin')).rejects.toThrow();
  });

  it('defaults to active', async () => {
    const id = await addUser('c@example.test');
    expect(
      (
        await first<{ is_active: number }>(
          'SELECT is_active FROM admin_user WHERE id = ?',
          id,
        )
      )?.is_active,
    ).toBe(1);
  });
});

describe('session', () => {
  it('rejects a session for a user that does not exist (foreign keys on)', async () => {
    await expect(
      run(
        'INSERT INTO session (token_hash, admin_user_id, expires_at) VALUES (?, ?, ?)',
        't1',
        99999,
        '2030-01-01T00:00:00Z',
      ),
    ).rejects.toThrow();
  });

  it('rejects a duplicate token hash', async () => {
    const id = await addUser('d@example.test');
    await run(
      'INSERT INTO session (token_hash, admin_user_id, expires_at) VALUES (?, ?, ?)',
      't2',
      id,
      '2030-01-01T00:00:00Z',
    );
    await expect(
      run(
        'INSERT INTO session (token_hash, admin_user_id, expires_at) VALUES (?, ?, ?)',
        't2',
        id,
        '2030-01-01T00:00:00Z',
      ),
    ).rejects.toThrow();
  });

  it('is deleted with its user', async () => {
    const id = await addUser('e@example.test');
    await run(
      'INSERT INTO session (token_hash, admin_user_id, expires_at) VALUES (?, ?, ?)',
      't3',
      id,
      '2030-01-01T00:00:00Z',
    );
    await run('DELETE FROM admin_user WHERE id = ?', id);
    expect(
      await first('SELECT 1 FROM session WHERE token_hash = ?', 't3'),
    ).toBeNull();
  });
});

describe('audit_log', () => {
  it('accepts an entry with no user (failed sign-in) and requires an action', async () => {
    await run('INSERT INTO audit_log (action) VALUES (?)', 'login_failed');
    await expect(
      run('INSERT INTO audit_log (action) VALUES (NULL)'),
    ).rejects.toThrow();
  });
});

describe('tailor', () => {
  it('rejects a duplicate slug', async () => {
    await addTailor('dup-slug');
    await expect(addTailor('dup-slug')).rejects.toThrow();
  });

  it('refuses to publish a draft tailor even with permission recorded (BR-05)', async () => {
    const id = await addTailor('draft-pub');
    await expect(
      run(
        'UPDATE tailor SET is_published = 1, permission_recorded = 1 WHERE id = ?',
        id,
      ),
    ).rejects.toThrow();
  });

  it('refuses to publish an approved tailor without recorded permission (BR-06)', async () => {
    const id = await addTailor('no-permission');
    await expect(
      run(
        "UPDATE tailor SET is_published = 1, status = 'approved' WHERE id = ?",
        id,
      ),
    ).rejects.toThrow();
  });

  it('publishes an approved tailor with recorded permission', async () => {
    const id = await addTailor('ok-pub');
    await run(
      "UPDATE tailor SET is_published = 1, status = 'approved', permission_recorded = 1 WHERE id = ?",
      id,
    );
    expect(
      (
        await first<{ is_published: number }>(
          'SELECT is_published FROM tailor WHERE id = ?',
          id,
        )
      )?.is_published,
    ).toBe(1);
  });

  it('rejects a status outside draft, approved, suspended, archived', async () => {
    const id = await addTailor('bad-status');
    await expect(
      run("UPDATE tailor SET status = 'live' WHERE id = ?", id),
    ).rejects.toThrow();
  });

  it('rejects home_visits outside yes, no, unknown', async () => {
    const id = await addTailor('bad-home');
    await expect(
      run("UPDATE tailor SET home_visits = 'maybe' WHERE id = ?", id),
    ).rejects.toThrow();
  });

  it('rejects phone numbers that are not E.164', async () => {
    const id = await addTailor('bad-phone');
    await expect(
      run("UPDATE tailor SET phone_e164 = '77123456' WHERE id = ?", id),
    ).rejects.toThrow();
    await expect(
      run(
        "UPDATE tailor SET whatsapp_e164 = '+670 7712 3456' WHERE id = ?",
        id,
      ),
    ).rejects.toThrow();
    await run("UPDATE tailor SET phone_e164 = '+67077123456' WHERE id = ?", id);
  });

  it('rejects an empty display name and invalid verified_fields JSON', async () => {
    await expect(
      run("INSERT INTO tailor (slug, display_name) VALUES ('empty-name', '')"),
    ).rejects.toThrow();
    const id = await addTailor('bad-json');
    await expect(
      run("UPDATE tailor SET verified_fields = 'not json' WHERE id = ?", id),
    ).rejects.toThrow();
  });
});

describe('garment_category and tailor_category', () => {
  it('rejects a duplicate category slug', async () => {
    await addCategory('dup-cat');
    await expect(addCategory('dup-cat')).rejects.toThrow();
  });

  it('blocks deleting a category that is in use and allows deleting an unused one', async () => {
    const tailor = await addTailor('cat-user');
    const used = await addCategory('used-cat');
    const unused = await addCategory('unused-cat');
    await run(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      tailor,
      used,
    );
    await expect(
      run('DELETE FROM garment_category WHERE id = ?', used),
    ).rejects.toThrow();
    await run('DELETE FROM garment_category WHERE id = ?', unused);
  });

  it('allows one row per tailor-category pair', async () => {
    const tailor = await addTailor('pair-t');
    const cat = await addCategory('pair-c');
    await run(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      tailor,
      cat,
    );
    await expect(
      run(
        'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
        tailor,
        cat,
      ),
    ).rejects.toThrow();
  });

  it('rejects price_to below price_from and unknown price_source', async () => {
    const tailor = await addTailor('price-t');
    const cat = await addCategory('price-c');
    await expect(
      run(
        'INSERT INTO tailor_category (tailor_id, category_id, price_from, price_to) VALUES (?, ?, 50, 10)',
        tailor,
        cat,
      ),
    ).rejects.toThrow();
    await expect(
      run(
        "INSERT INTO tailor_category (tailor_id, category_id, price_source) VALUES (?, ?, 'guess')",
        tailor,
        cat,
      ),
    ).rejects.toThrow();
  });

  it('defaults price_source to tailor_supplied (BR-11: not verified unless the owner says so)', async () => {
    const tailor = await addTailor('src-t');
    const cat = await addCategory('src-c');
    await run(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
      tailor,
      cat,
    );
    expect(
      (
        await first<{ price_source: string }>(
          'SELECT price_source FROM tailor_category WHERE tailor_id = ?',
          tailor,
        )
      )?.price_source,
    ).toBe('tailor_supplied');
  });
});

describe('service_area and tailor_area', () => {
  it('rejects a duplicate area slug, a duplicate triple and an unknown kind', async () => {
    const area = (
      await run(
        "INSERT INTO service_area (slug, name) VALUES ('a-one', 'A one')",
      )
    ).meta.last_row_id;
    await expect(
      run("INSERT INTO service_area (slug, name) VALUES ('a-one', 'again')"),
    ).rejects.toThrow();
    const tailor = await addTailor('area-t');
    await run(
      "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'serves')",
      tailor,
      area,
    );
    await expect(
      run(
        "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'serves')",
        tailor,
        area,
      ),
    ).rejects.toThrow();
    await expect(
      run(
        "INSERT INTO tailor_area (tailor_id, area_id, kind) VALUES (?, ?, 'lives')",
        tailor,
        area,
      ),
    ).rejects.toThrow();
  });
});

describe('portfolio_image', () => {
  it('requires alt text and a unique file key, and defaults to no permission (BR-06)', async () => {
    const tailor = await addTailor('img-t');
    await expect(
      run(
        "INSERT INTO portfolio_image (tailor_id, file_key, alt_text) VALUES (?, 'k1', '')",
        tailor,
      ),
    ).rejects.toThrow();
    await run(
      "INSERT INTO portfolio_image (tailor_id, file_key, alt_text) VALUES (?, 'k2', 'A jacket')",
      tailor,
    );
    await expect(
      run(
        "INSERT INTO portfolio_image (tailor_id, file_key, alt_text) VALUES (?, 'k2', 'Again')",
        tailor,
      ),
    ).rejects.toThrow();
    expect(
      (
        await first<{ permission_granted: number }>(
          "SELECT permission_granted FROM portfolio_image WHERE file_key = 'k2'",
        )
      )?.permission_granted,
    ).toBe(0);
  });
});
