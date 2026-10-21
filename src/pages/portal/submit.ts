export const prerender = false;
import type { APIRoute } from 'astro';
import { env, waitUntil } from 'cloudflare:workers';
import { requireBindings, siteConfig } from '../../modules/config';
import { verifyCsrf } from '../../modules/auth/csrf';
import { readForm } from '../../modules/http/body';
import { webhookNotifier } from '../../modules/notify/webhook';
import { submitForReview } from '../../modules/portal/checklist';
import { requireTailor } from '../../modules/portal/require';
import { TAILOR_COOKIE } from '../../modules/portal/session';

export const POST: APIRoute = async (context) => {
  const auth = await requireTailor(context);
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(TAILOR_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });
  const result = await submitForReview(requireBindings(env).DB, auth, {
    siteUrl: siteConfig(env).siteUrl,
    notify: webhookNotifier(
      (env as { NOTIFY_WEBHOOK_URL?: string }).NOTIFY_WEBHOOK_URL,
    ),
    waitUntil,
  });
  return context.redirect(
    `/portal?msg=${result.ok ? 'submitted' : result.error}`,
    303,
  );
};
