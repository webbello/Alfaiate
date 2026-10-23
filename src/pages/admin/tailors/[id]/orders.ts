export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { parseId, readForm } from '../../../../modules/http/body';
import {
  internationalNumber,
  requireBindings,
} from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { audit, who } from '../../../../modules/auth/audit';

/** Staff decide where the shop orders for a tailor's products go: the admin first, the tailor's own WhatsApp, or another number. A tailor cannot (S6). */
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
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const { DB } = requireBindings(env);
  const back = (code: string) =>
    context.redirect(`/admin/tailors/${id}?msg=${code}#orders`, 303);
  const route = form.get('order_route')?.toString() ?? '';
  if (route !== 'admin' && route !== 'tailor' && route !== 'number')
    return back('invalid');
  const number =
    route === 'number'
      ? internationalNumber(form.get('order_number')?.toString())
      : null;
  if (route === 'number' && !number) return back('invalid');
  const done = await DB.prepare(
    'UPDATE tailor SET order_route = ?, order_number_e164 = ? WHERE id = ?',
  )
    .bind(route, number, id)
    .run();
  if (done.meta.changes === 0)
    return new Response('Not found', { status: 404 });
  await audit(DB, {
    ...who(auth.userId),
    action: 'tailor_order_route_changed',
    entityType: 'tailor',
    entityId: id,
  });
  return back('saved');
};
