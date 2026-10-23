import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { csrfOf, get, post, signIn, unique } from './helpers';
import {
  grantsFor,
  PERMISSIONS,
  ROLES,
} from '../../src/modules/auth/permissions';
import { ABILITIES } from '../../src/modules/admin-ui/roles';
import { hashPassword } from '../../src/modules/auth/password';

const mk = async (role = 'viewer') => {
  const email = `us${unique()}-${Date.now()}@example.test`;
  const id = (
    await env.DB.prepare(
      'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
    )
      .bind(
        email,
        await hashPassword('a-long-fake-test-passphrase', 1000),
        role,
      )
      .run()
  ).meta.last_row_id;
  return { id, email };
};

describe('the users section (QuizCub-style)', () => {
  it('lists people with role and status, filters them, and links each to their page', async () => {
    const person = await mk('manager');
    const cookie = await signIn('owner');
    const html = await (
      await get(
        `/admin/users?q=${encodeURIComponent(person.email.slice(0, 12))}&role=manager`,
        cookie,
      )
    ).text();
    expect(html).toContain(person.email);
    expect(html).toContain(`href="/admin/users/${person.id}"`);
    expect(html).toContain('Can sign in');
    const none = await (
      await get('/admin/users?q=nobody-at-all-xyz', cookie)
    ).text();
    expect(none).toContain('No one matches');
  });

  it('shows a read-only roles table that matches the permissions the server enforces', async () => {
    const html = await (
      await get('/admin/users?tab=roles', await signIn('owner'))
    ).text();
    expect(html).toContain('Roles and permissions');
    expect(ABILITIES.map((a) => a.permission).sort()).toEqual(
      [...PERMISSIONS].sort(),
    );
    for (const a of ABILITIES) {
      const row =
        html.match(
          new RegExp(
            `<th scope="row">${a.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</th>([\\s\\S]*?)</tr>`,
          ),
        )?.[1] ?? '';
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) =>
        m[1].includes('>Yes<'),
      );
      expect(cells, a.label).toEqual(
        ROLES.map((r) => grantsFor(r).includes(a.permission)),
      );
    }
  });

  it('shows a person page with role, access, sign-in tools and activity, but not for yourself', async () => {
    const person = await mk('editor');
    const cookie = await signIn('owner');
    const html = await (await get(`/admin/users/${person.id}`, cookie)).text();
    expect(html).toContain('Make a new password');
    expect(html).toContain('Sign out everywhere');
    expect(html).toContain('Switch off');
    expect(html).toContain('Recent activity');
    const meId = (await env.DB.prepare(
      'SELECT id FROM admin_user ORDER BY id DESC LIMIT 1',
    ).first<{ id: number }>())!.id;
    const own = await (await get(`/admin/users/${meId}`, cookie)).text();
    expect(own).toContain('This is you');
    expect(own).not.toContain('Make a new password');
    expect((await get('/admin/users/99999999', cookie)).status).toBe(404);
  });

  it('makes a password when the field is left empty, shows it once without caching, and it signs in', async () => {
    const cookie = await signIn('owner');
    const email = `gen${unique()}-${Date.now()}@example.test`;
    const res = await post('/admin/users/new', cookie, {
      csrf: await csrfOf(cookie),
      email,
      role: 'viewer',
      password: '',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const html = await res.text();
    const password =
      html.match(/id="cred-password"[^>]*value="([^"]+)"/)?.[1] ?? '';
    expect(password).toHaveLength(16);
    expect(html).toContain('only time the password is shown');
    const login = await post('/admin/login', undefined, { email, password });
    expect(login.status).toBe(303);
    // the password is not kept anywhere readable
    expect(
      JSON.stringify(
        (
          await env.DB.prepare('SELECT * FROM admin_user WHERE email = ?')
            .bind(email)
            .all()
        ).results,
      ),
    ).not.toContain(password);
  });

  it('keeps a typed password private and goes to the new person instead', async () => {
    const cookie = await signIn('owner');
    const res = await post('/admin/users/new', cookie, {
      csrf: await csrfOf(cookie),
      email: `typed${unique()}-${Date.now()}@example.test`,
      role: 'viewer',
      password: 'a-typed-fake-passphrase',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(
      /^\/admin\/users\/\d+\?msg=created$/,
    );
  });

  it('resets a password: shown once, old one stops working, new one works, and only an owner may', async () => {
    const person = await mk('manager');
    const cookie = await signIn('owner');
    const res = await post(`/admin/users/${person.id}/reset`, cookie, {
      csrf: await csrfOf(cookie),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const password =
      (await res.text()).match(/id="cred-password"[^>]*value="([^"]+)"/)?.[1] ??
      '';
    expect(password).toHaveLength(16);
    expect(
      (
        await post('/admin/login', undefined, {
          email: person.email,
          password: 'a-long-fake-test-passphrase',
        })
      ).status,
    ).toBe(401);
    expect(
      (await post('/admin/login', undefined, { email: person.email, password }))
        .status,
    ).toBe(303);
    const manager = await signIn('manager');
    expect(
      (
        await post(`/admin/users/${person.id}/reset`, manager, {
          csrf: await csrfOf(manager),
        })
      ).status,
    ).toBe(403);
    expect((await get(`/admin/users/${person.id}`, manager)).status).toBe(403);
    expect((await get('/admin/users/new', manager)).status).toBe(403);
  });

  it('will not change your own role or access, or sign yourself out everywhere', async () => {
    const cookie = await signIn('owner');
    const csrf = await csrfOf(cookie);
    const me = (await env.DB.prepare(
      'SELECT id FROM admin_user ORDER BY id DESC LIMIT 1',
    ).first<{ id: number }>())!.id;
    for (const action of ['set_role', 'deactivate', 'sign_out']) {
      const res = await post('/admin/users/actions', cookie, {
        csrf,
        action,
        user_id: String(me),
        role: 'viewer',
      });
      expect(res.headers.get('location'), action).toBe(
        `/admin/users/${me}?msg=invalid`,
      );
    }
    expect(
      await env.DB.prepare(
        'SELECT role, is_active FROM admin_user WHERE id = ?',
      )
        .bind(me)
        .first<{ role: string; is_active: number }>(),
    ).toEqual({ role: 'owner', is_active: 1 });
  });
});
