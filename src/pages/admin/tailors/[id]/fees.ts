export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { setFeeTerms } from '../../../../modules/tailors/fees';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'fee.view');
  if (auth instanceof Response) return auth;
  const form = await context.request.formData().catch(() => new FormData());
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });

  const result = await setFeeTerms(
    requireBindings(env).DB,
    auth.userId,
    auth.role,
    id,
    {
      text: form.get('fee_terms_text')?.toString() ?? '',
      agreed_on: form.get('fee_terms_agreed_on')?.toString() ?? '',
    },
  );
  if (!result.ok && result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  return context.redirect(
    `/admin/tailors/${id}?msg=${result.ok ? 'saved' : 'invalid'}`,
    303,
  );
};
