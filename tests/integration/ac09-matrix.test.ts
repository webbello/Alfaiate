import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { worker } from './worker';
import {
  ADMIN_ROUTES,
  concretePath,
} from '../../src/modules/auth/admin-routes';
import { can, ROLES } from '../../src/modules/auth/permissions';
import { hashPassword } from '../../src/modules/auth/password';

// AC-09: for every admin route and handler, each role gets exactly what the permission map allows.
const ORIGIN = 'https://example.test';
const PASSWORD = 'a-long-fake-test-passphrase';
let n = 0;

async function signIn(role: string) {
  const email = `m${++n}@example.test`;
  await env.DB.prepare(
    'INSERT INTO admin_user (email, password_hash, role) VALUES (?, ?, ?)',
  )
    .bind(email, await hashPassword(PASSWORD, 1000), role)
    .run();
  const response = await worker.fetch(
    new Request(`${ORIGIN}/admin/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'cf-connecting-ip': `203.0.113.${++n}` },
      body: new URLSearchParams({ email, password: PASSWORD }),
      redirect: 'manual',
    }),
  );
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

const csrfOf = async (cookie: string) => {
  const html = await (
    await worker.fetch(
      new Request(`${ORIGIN}/admin`, {
        headers: { Cookie: cookie },
        redirect: 'manual',
      }),
    )
  ).text();
  return html.match(/name="csrf" value="([^"]+)"/)?.[1] ?? '';
};

// A valid request for each POST route, so a role that IS allowed gets a non-403 answer.
const validForm: Record<string, (csrf: string) => Record<string, string>> = {
  '/admin/logout': (csrf) => ({ csrf }),
  '/admin/account': (csrf) => ({
    csrf,
    current_password: 'wrong-but-well-formed',
    new_password: 'another-long-passphrase',
  }),
  '/admin/categories': (csrf) => ({
    csrf,
    action: 'create',
    name: `Matrix ${Date.now()}${n++}`,
  }),
  '/admin/areas': (csrf) => ({
    csrf,
    action: 'create',
    name: `Matrix ${Date.now()}${n++}`,
  }),
  '/admin/tailors/new': (csrf) => ({
    csrf,
    display_name: `Matrix Tailor ${Date.now()}${n++}`,
  }),
  '/admin/enquiries/[id]/anonymise': (csrf) => ({
    csrf,
    confirm_reference: 'AT-MATRIX',
  }),
  '/admin/enquiries/[id]/referrals': (csrf) => ({ csrf, tailor_id: '1' }),
  '/admin/enquiries/[id]/referrals/[rid]': (csrf) => ({
    csrf,
    tailor_response: 'pending',
  }),
  '/admin/enquiries/[id]/referrals/[rid]/fee': (csrf) => ({
    csrf,
    fee_status: 'not_due',
  }),
  '/admin/enquiries/[id]/actions': (csrf) => ({
    csrf,
    action: 'add_note',
    body: 'matrix note',
  }),
  '/admin/tailors/[id]/actions': (csrf) => ({
    csrf,
    action: 'add_note',
    body: 'matrix note',
  }),
  '/admin/tailors/[id]/publish': (csrf) => ({ csrf, action: 'approve' }),
  '/admin/tailors/[id]/fees': (csrf) => ({
    csrf,
    fee_terms_text: 'matrix terms',
    fee_terms_agreed_on: '2026-01-01',
  }),
  '/admin/tailors/[id]/images': (csrf) => ({ csrf, alt_text: 'matrix' }),
  '/admin/tailors/[id]/images/actions': (csrf) => ({
    csrf,
    action: 'visibility',
    image_id: '999999',
    visible: '1',
  }),
  '/admin/interest/[id]/anonymise': (csrf) => ({
    csrf,
    confirm_reference: 'JN-MATRIX00',
  }),
  '/admin/interest/[id]/approve': (csrf) => ({ csrf }),
  '/admin/interest/[id]/decline': (csrf) => ({ csrf }),
  '/admin/tailors/[id]/invite': (csrf) => ({ csrf }),
  '/admin/tailors/[id]/signin': (csrf) => ({ csrf, action: 'deactivate' }),
  '/admin/newsletter/[id]/remove': (csrf) => ({ csrf }),
  '/admin/users/actions': (csrf) => ({
    csrf,
    action: 'create',
    email: `new${Date.now()}${n++}@example.test`,
    role: 'viewer',
    password: 'a-long-fake-test-passphrase',
  }),
};

let tailorId = 0;
beforeAll(async () => {
  tailorId = (
    await env.DB.prepare(
      "INSERT INTO tailor (slug, display_name) VALUES ('matrix-tailor', 'Matrix Tailor')",
    ).run()
  ).meta.last_row_id;
});

const protectedRoutes = ADMIN_ROUTES.filter((r) => r.permission !== null);

describe('AC-09 role matrix', () => {
  for (const role of ROLES) {
    for (const route of protectedRoutes) {
      for (const method of route.methods) {
        const allowed = can(role, route.permission as string);
        it(`${role} ${allowed ? 'may' : 'may not'} ${method} ${route.path}`, async () => {
          const cookie = await signIn(role);
          const csrf = await csrfOf(cookie);
          const form =
            method === 'POST' ? validForm[route.path]?.(csrf) : undefined;
          const response = await worker.fetch(
            new Request(
              `${ORIGIN}${concretePath(route.path, { id: tailorId, key: 'x' })}`,
              {
                method,
                headers: { Cookie: cookie, Origin: ORIGIN },
                body: form ? new URLSearchParams(form) : undefined,
                redirect: 'manual',
              },
            ),
          );
          if (allowed) {
            expect(response.status).not.toBe(403);
            expect(response.status).toBeLessThan(500);
          } else {
            expect(response.status).toBe(403);
            expect(await response.text()).toBe('Forbidden');
          }
        });
      }
    }
  }
});

describe('user management through the real handlers', () => {
  it('refuses a state-changing request without the csrf token, even for the owner', async () => {
    const cookie = await signIn('owner');
    const response = await worker.fetch(
      new Request(`${ORIGIN}/admin/users/actions`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: ORIGIN },
        body: new URLSearchParams({
          action: 'create',
          email: 'x@example.test',
          role: 'owner',
          password: 'a-long-fake-test-passphrase',
        }),
        redirect: 'manual',
      }),
    );
    expect(response.status).toBe(403);
    expect(
      await env.DB.prepare(
        "SELECT 1 FROM admin_user WHERE email = 'x@example.test'",
      ).first(),
    ).toBeNull();
  });

  it('lets an owner create a user who can then sign in, and audits it', async () => {
    const cookie = await signIn('owner');
    const csrf = await csrfOf(cookie);
    const email = `created${++n}@example.test`;
    const created = await worker.fetch(
      new Request(`${ORIGIN}/admin/users/actions`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: ORIGIN },
        body: new URLSearchParams({
          csrf,
          action: 'create',
          email,
          role: 'editor',
          password: 'a-long-fake-test-passphrase',
        }),
        redirect: 'manual',
      }),
    );
    expect(created.status).toBe(303);
    expect(created.headers.get('location')).toBe('/admin/users?msg=created');
    const login = await worker.fetch(
      new Request(`${ORIGIN}/admin/login`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'cf-connecting-ip': `203.0.113.${++n}` },
        body: new URLSearchParams({
          email,
          password: 'a-long-fake-test-passphrase',
        }),
        redirect: 'manual',
      }),
    );
    expect(login.status).toBe(303);
    expect(
      (
        await env.DB.prepare(
          "SELECT count(*) AS c FROM audit_log WHERE action = 'user_created'",
        ).first<{ c: number }>()
      )?.c,
    ).toBeGreaterThan(0);
  });

  it('refuses to demote the only active owner through the handler', async () => {
    await env.DB.prepare('DELETE FROM internal_note').run();
    await env.DB.prepare('DELETE FROM admin_user').run();
    const cookie = await signIn('owner');
    const csrf = await csrfOf(cookie);
    const owner = await env.DB.prepare(
      "SELECT id FROM admin_user WHERE role = 'owner'",
    ).first<{ id: number }>();
    const response = await worker.fetch(
      new Request(`${ORIGIN}/admin/users/actions`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: ORIGIN },
        body: new URLSearchParams({
          csrf,
          action: 'set_role',
          user_id: String(owner!.id),
          role: 'viewer',
        }),
        redirect: 'manual',
      }),
    );
    expect(response.headers.get('location')).toBe(
      '/admin/users?msg=last_owner',
    );
    expect(
      (
        await env.DB.prepare('SELECT role FROM admin_user WHERE id = ?')
          .bind(owner!.id)
          .first<{ role: string }>()
      )?.role,
    ).toBe('owner');
  });

  it('shows the users page only to the owner and never exposes password hashes', async () => {
    const cookie = await signIn('owner');
    const html = await (
      await worker.fetch(
        new Request(`${ORIGIN}/admin/users`, { headers: { Cookie: cookie } }),
      )
    ).text();
    expect(html).toContain('Admin users');
    expect(html).not.toContain('pbkdf2-sha256');
  });
});
