import { env, waitUntil } from 'cloudflare:workers';
import type { Lang } from '../../i18n/lang';
import { formSecret, requireBindings, siteConfig } from '../config';
import { showForm, submitForm, type Outcome } from './submit';

/** What the request pages share between English and Tetum: reads the bindings and runs the right step for the method. */
export async function runRequestPage(
  request: Request,
  lang: Lang,
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
    return new Response('Forbidden', { status: 403 });
  const deps = {
    db: requireBindings(env).DB,
    secret: formSecret(env as { FORM_TOKEN_SECRET?: string }),
    lang,
    siteUrl: siteConfig(env).siteUrl,
    waitUntil,
  };
  if (request.method === 'POST')
    return submitForm(
      deps,
      request,
      request.headers.get('cf-connecting-ip') ?? undefined,
    );
  return showForm(deps, new URL(request.url).searchParams.get('tailor'));
}

const REFERENCE = /^AT-[A-HJ-NP-Z2-9]{8}$/;
/** The reference code in `?ref=`, only if it has the exact shape of one we issue (nothing else is ever echoed). */
export const referenceParam = (url: URL): string | null => {
  const ref = url.searchParams.get('ref') ?? '';
  return REFERENCE.test(ref) ? ref : null;
};
