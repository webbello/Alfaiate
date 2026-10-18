import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { authorize } from '../../src/modules/auth/guard';
import { createSession } from '../../src/modules/auth/session';

const db = env.DB;
let n = 0;
const signIn = async (role: string, active = 1) => {
  const id = (
    await db
      .prepare(
        'INSERT INTO admin_user (email, password_hash, role, is_active) VALUES (?, ?, ?, ?)',
      )
      .bind(`g${++n}@example.test`, 'h', role, active)
      .run()
  ).meta.last_row_id;
  return (await createSession(db, id)).token;
};

describe('authorize', () => {
  it('treats a missing, empty or unknown token as anonymous', async () => {
    expect(await authorize(db, undefined, 'dashboard.view')).toEqual({
      status: 'anonymous',
    });
    expect(await authorize(db, '', 'dashboard.view')).toEqual({
      status: 'anonymous',
    });
    expect(await authorize(db, 'forged-token', 'dashboard.view')).toEqual({
      status: 'anonymous',
    });
  });

  it('treats a deactivated user as anonymous', async () => {
    const token = await signIn('owner', 0);
    expect(await authorize(db, token, 'dashboard.view')).toEqual({
      status: 'anonymous',
    });
  });

  it('allows a role that has the permission and returns the session', async () => {
    const token = await signIn('editor');
    const result = await authorize(db, token, 'tailor.edit');
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.session.role).toBe('editor');
  });

  it('refuses a signed-in role that lacks the permission (403, not a redirect)', async () => {
    expect(await authorize(db, await signIn('editor'), 'enquiry.view')).toEqual(
      { status: 'forbidden' },
    );
    expect(await authorize(db, await signIn('viewer'), 'tailor.edit')).toEqual({
      status: 'forbidden',
    });
    expect(await authorize(db, await signIn('manager'), 'user.manage')).toEqual(
      { status: 'forbidden' },
    );
  });

  it('refuses an unmapped permission even for the owner (deny by default)', async () => {
    expect(await authorize(db, await signIn('owner'), 'tailor.nuke')).toEqual({
      status: 'forbidden',
    });
  });

  it('allows the owner everything that is mapped', async () => {
    expect(
      (await authorize(db, await signIn('owner'), 'user.manage')).status,
    ).toBe('ok');
  });
});
