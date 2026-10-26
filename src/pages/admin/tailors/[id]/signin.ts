export const prerender = false;
import { rememberTab } from '../../../../modules/admin-ui/tabs';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { parseId, readForm } from '../../../../modules/http/body';
import { setTailorSignIn } from '../../../../modules/portal/approve';

/** Switch a tailor's sign-in off or on. Publish permission, like approving it. */
export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'tailor.publish');
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });
  const id = parseId(context.params.id);
  if (!Number.isInteger(id) || id < 1)
    return new Response('Not found', { status: 404 });
  rememberTab(context.cookies, 'more');
  const action = form.get('action')?.toString();
  if (action !== 'deactivate' && action !== 'activate')
    return context.redirect(`/admin/tailors/${id}?msg=invalid`, 303);
  const done = await setTailorSignIn(requireBindings(env).DB, {
    tailorId: id,
    actorId: auth.userId,
    active: action === 'activate',
  });
  return done
    ? context.redirect(`/admin/tailors/${id}?msg=saved`, 303)
    : new Response('Not found', { status: 404 });
};
