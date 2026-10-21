import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ORIGIN, get, signIn, unique } from './helpers';
import { worker } from './worker';
import {
  ADMIN_ROUTES,
  concretePath,
} from '../../src/modules/auth/admin-routes';
import { PORTAL_ROUTES } from '../../src/modules/portal/routes';
import { createTailorSession } from '../../src/modules/portal/session';

// FR-TPO-03: a tailor reaches only the portal and only their own record; staff and visitors do not reach the portal.
const db = env.DB;
const SECRET = {
  phone: '+67077555123',
  terms: 'ISOLATION-SECRET-FEE-TERMS',
  note: 'ISOLATION-SECRET-INTERNAL-NOTE',
  contact: 'Isolation Secret Contact',
};
const tailor = async (name: string, secrets = false) => {
  const tailorId = (
    await db
      .prepare(
        'INSERT INTO tailor (slug, display_name, private_phone, private_contact_name, fee_terms_text) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(
        `iso-${unique()}`,
        name,
        secrets ? SECRET.phone : null,
        secrets ? SECRET.contact : null,
        secrets ? SECRET.terms : null,
      )
      .run()
  ).meta.last_row_id;
  const staff = (
    await db
      .prepare(
        "INSERT INTO admin_user (email, password_hash, role) VALUES (?, 'x', 'owner')",
      )
      .bind(`iso${unique()}@example.test`)
      .run()
  ).meta.last_row_id;
  if (secrets)
    await db
      .prepare(
        'INSERT INTO internal_note (tailor_id, author_id, body) VALUES (?, ?, ?)',
      )
      .bind(tailorId, staff, SECRET.note)
      .run();
  const accountId = (
    await db
      .prepare(
        'INSERT INTO tailor_account (tailor_id, email, password_hash, consent_at) VALUES (?, ?, ?, ?)',
      )
      .bind(tailorId, `iso${unique()}@example.test`, 'x', 'now')
      .run()
  ).meta.last_row_id;
  const cookie = `__Host-alfaiate_tailor=${(await createTailorSession(db, accountId)).token}`;
  return { tailorId, accountId, cookie };
};
const request = (path: string, method: string, cookie?: string) =>
  worker.fetch(
    new Request(`${ORIGIN}${path}`, {
      method,
      headers: { Origin: ORIGIN, ...(cookie ? { Cookie: cookie } : {}) },
      body: method === 'POST' ? new URLSearchParams({ csrf: 'x' }) : undefined,
      redirect: 'manual',
    }),
  );
const concrete = (path: string) =>
  concretePath(path, { id: 1, key: 'x' }).replace('[...key]', 'x');

describe('a tailor session on every admin route', () => {
  for (const route of ADMIN_ROUTES)
    for (const method of route.methods)
      it(`${method} ${route.path} is treated as not signed in`, async () => {
        const a = await tailor('Iso Tailor');
        const res = await request(concrete(route.path), method, a.cookie);
        if (route.permission === null) {
          expect(res.status).not.toBe(500);
          return;
        }
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/admin/login');
      });
});

describe('staff and visitors on every protected portal route', () => {
  for (const route of PORTAL_ROUTES.filter((r) => r.access === 'tailor'))
    for (const method of route.methods)
      it(`${method} ${route.path} sends staff and visitors to the tailor sign-in`, async () => {
        for (const cookie of [undefined, await signIn('owner')]) {
          const res = await request(concrete(route.path), method, cookie);
          expect(res.status).toBe(302);
          expect(res.headers.get('location')).toBe('/portal/login');
        }
      });
});

describe('two tailors', () => {
  it('each portal page shows only the signed-in tailor, and never an owner-only value', async () => {
    const a = await tailor('Iso Alpha Fake', true);
    const b = await tailor('Iso Beta Fake', true);
    for (const path of [
      '/portal',
      '/portal/profile',
      '/portal/work',
      '/portal/photos',
    ]) {
      const html = await (await get(path, a.cookie)).text();
      expect(html, path).not.toContain('Iso Beta Fake');
      for (const secret of Object.values(SECRET))
        expect(html, `${path} ${secret}`).not.toContain(secret);
    }
    expect(await (await get('/portal/profile', b.cookie)).text()).toContain(
      'Iso Beta Fake',
    );
    expect(await (await get('/portal/profile', a.cookie)).text()).toContain(
      'Iso Alpha Fake',
    );
  });
  it("a sign-in belongs to one tailor: another tailor's id in the address, query or form changes nothing", async () => {
    const a = await tailor('Iso A Fake');
    const b = await tailor('Iso B Fake');
    const res = await worker.fetch(
      new Request(
        `${ORIGIN}/portal/profile?tailor_id=${b.tailorId}&id=${b.tailorId}`,
        {
          method: 'POST',
          headers: { Cookie: a.cookie, Origin: ORIGIN },
          body: new URLSearchParams({
            display_name: 'A renamed',
            tailor_id: String(b.tailorId),
            id: String(b.tailorId),
            account_id: String(b.accountId),
          }),
          redirect: 'manual',
        },
      ),
    );
    expect(res.status).toBe(303);
    const names = (
      await db
        .prepare('SELECT id, display_name FROM tailor WHERE id IN (?, ?)')
        .bind(a.tailorId, b.tailorId)
        .all<{ id: number; display_name: string }>()
    ).results;
    expect(names.find((x) => x.id === a.tailorId)!.display_name).toBe(
      'A renamed',
    );
    expect(names.find((x) => x.id === b.tailorId)!.display_name).toBe(
      'Iso B Fake',
    );
  });
  it("signing out or deactivating one tailor does not end the other's session", async () => {
    const a = await tailor('Iso Keep A');
    const b = await tailor('Iso Keep B');
    await db
      .prepare('UPDATE tailor_account SET is_active = 0 WHERE id = ?')
      .bind(a.accountId)
      .run();
    expect((await get('/portal', a.cookie)).status).toBe(302);
    expect((await get('/portal', b.cookie)).status).toBe(200);
  });
});
