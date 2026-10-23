export const prerender = false;
import { readForm } from '../../../modules/http/body';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../modules/config';
import { requirePermission } from '../../../modules/auth/require';
import { verifyCsrf } from '../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../modules/auth/session';
import {
  createUser,
  deactivateUser,
  reactivateUser,
  signOutEverywhere,
  updateRole,
  type Outcome,
} from '../../../modules/auth/admin-users';

// Back to the person's own page when the action was about one person, to the list otherwise.
const done = (
  context: Parameters<APIRoute>[0],
  code: string,
  userId?: number,
) =>
  context.redirect(
    Number.isInteger(userId) && (userId as number) > 0
      ? `/admin/users/${userId}?msg=${code}`
      : `/admin/users?msg=${code}`,
    303,
  );

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'user.manage');
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  const { DB } = requireBindings(env);
  const field = (name: string) => form.get(name)?.toString() ?? '';
  const targetId = Number(field('user_id'));
  const outcome = async (): Promise<Outcome> => {
    // Your own role and access are not changed here: another owner does that, so you cannot lock yourself out or promote yourself.
    if (
      targetId === auth.userId &&
      ['set_role', 'deactivate', 'reactivate', 'sign_out'].includes(
        field('action'),
      )
    )
      return { ok: false, error: 'invalid' };
    switch (field('action')) {
      case 'create':
        return createUser(DB, auth.userId, {
          email: field('email'),
          role: field('role'),
          password: field('password'),
        });
      case 'set_role':
        return Number.isInteger(targetId)
          ? updateRole(DB, auth.userId, targetId, field('role'))
          : { ok: false, error: 'invalid' };
      case 'deactivate':
        return Number.isInteger(targetId)
          ? deactivateUser(DB, auth.userId, targetId)
          : { ok: false, error: 'invalid' };
      case 'reactivate':
        return Number.isInteger(targetId)
          ? reactivateUser(DB, auth.userId, targetId)
          : { ok: false, error: 'invalid' };
      case 'sign_out':
        return Number.isInteger(targetId)
          ? signOutEverywhere(DB, auth.userId, targetId)
          : { ok: false, error: 'invalid' };
      default:
        return { ok: false, error: 'invalid' };
    }
  };

  const result = await outcome();
  const success =
    {
      create: 'created',
      set_role: 'role_changed',
      deactivate: 'deactivated',
      reactivate: 'reactivated',
      sign_out: 'signed_out',
    }[field('action')] ?? 'invalid';
  return done(
    context,
    result.ok ? success : result.error,
    field('action') === 'create' ? undefined : targetId,
  );
};
