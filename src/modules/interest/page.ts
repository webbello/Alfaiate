import { env } from 'cloudflare:workers';
import type { Lang } from '../../i18n/lang';
import { formSecret, joinEnabled, requireBindings } from '../config';
import { showJoinForm, submitJoinForm, type Outcome } from './submit';

/** What the join pages share between English and Tetum; mirrors runRequestPage (method check, Origin check, bindings). */
export async function runJoinPage(
  request: Request,
  lang: Lang,
): Promise<Outcome | Response> {
  if (!joinEnabled(env as { JOIN_ENABLED?: string }))
    return new Response('Not found', { status: 404 });
  if (
    request.method !== 'GET' &&
    request.method !== 'POST' &&
    request.method !== 'HEAD'
  )
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });
  if (
    request.method === 'POST' &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return { kind: 'message', status: 403, which: 'forbidden' };
  const deps = {
    db: requireBindings(env).DB,
    secret: formSecret(env as { FORM_TOKEN_SECRET?: string }),
    lang,
  };
  if (request.method === 'POST')
    return submitJoinForm(
      deps,
      request,
      request.headers.get('cf-connecting-ip') ?? undefined,
    );
  return showJoinForm(deps);
}

const REFERENCE = /^JN-[A-HJ-NP-Z2-9]{8}$/;
/** The reference code in `?ref=`, only if it has the exact shape of one we issue. */
export const joinReferenceParam = (url: URL): string | null => {
  const ref = url.searchParams.get('ref') ?? '';
  return REFERENCE.test(ref) ? ref : null;
};
