import { env, waitUntil } from 'cloudflare:workers';
import type { Lang } from '../../i18n/lang';
import { formSecret, requireBindings, siteConfig } from '../config';
import { webhookNotifier } from '../notify/webhook';
import { showForm, submitForm, type Outcome } from './submit';

/** What the request pages share between English and Tetum: reads the bindings and runs the right step for the method. */
export async function runRequestPage(
  request: Request,
  lang: Lang,
  kind: 'request' | 'business' = 'request',
): Promise<Outcome | Response> {
  if (
    request.method !== 'GET' &&
    request.method !== 'POST' &&
    request.method !== 'HEAD'
  )
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  // Browsers always send Origin on a form POST; a missing or different one is a cross-site or scripted post.
  if (
    request.method === 'POST' &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return { kind: 'message', status: 403, which: 'forbidden' };
  const deps = {
    db: requireBindings(env).DB,
    secret: formSecret(env as { FORM_TOKEN_SECRET?: string }),
    lang,
    kind,
    notify: webhookNotifier(
      (env as { NOTIFY_WEBHOOK_URL?: string }).NOTIFY_WEBHOOK_URL,
    ),
    siteUrl: siteConfig(env).siteUrl,
    waitUntil,
  };
  if (request.method === 'POST')
    return submitForm(
      deps,
      request,
      request.headers.get('cf-connecting-ip') ?? undefined,
    );
  const query = new URL(request.url).searchParams;
  return showForm(deps, query.getAll('tailor'), query.getAll('product'));
}

const REFERENCE = /^AT-[A-HJ-NP-Z2-9]{8}$/;
/** The reference code in `?ref=`, only if it has the exact shape of one we issue (nothing else is ever echoed). */
export const referenceParam = (url: URL): string | null => {
  const ref = url.searchParams.get('ref') ?? '';
  return REFERENCE.test(ref) ? ref : null;
};
