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
  updateRole,
  type Outcome,
} from '../../../modules/auth/admin-users';

const done = (context: Parameters<APIRoute>[0], code: string) =>
  context.redirect(`/admin/users?msg=${code}`, 303);

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
    }[field('action')] ?? 'invalid';
  return done(context, result.ok ? success : result.error);
};
