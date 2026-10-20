import { pathFor, type Lang } from '../../i18n/lang';
import { hit, ipBucket } from '../auth/rate-limit';
import { readForm, SMALL_FORM_LIMIT } from '../http/body';
import {
  checkToken,
  isHoneypotHit,
  issueToken,
  SUBMIT_LIMIT,
} from '../enquiry/spam';
import { notifyNewEnquiry, type Notifier } from '../notify';
import { joinConsentVersion } from './consent';
import { createInterest, newJoinReference } from './create';
import { parseJoinForm, type FieldErrors, type FormValues } from './schema';

export type FormView = {
  values: FormValues;
  errors: FieldErrors;
  formError: 'too_fast' | 'expired' | null;
  token: string;
};
export type Outcome =
  | { kind: 'form'; status: 200 | 400; view: FormView }
  | { kind: 'redirect'; to: string }
  | {
      kind: 'message';
      status: 403 | 413 | 429 | 500;
      which: 'limited' | 'failed' | 'forbidden';
    };
type Deps = {
  db: D1Database;
  secret: string;
  lang: Lang;
  now?: Date;
  notify?: Notifier;
  siteUrl?: string;
  waitUntil?: (work: Promise<unknown>) => void;
};

const EMPTY: FormValues = {
  name: '',
  business: '',
  phone: '',
  area: '',
  craft: '',
  message: '',
};
const WINDOW_SECONDS = 60 * 60;

const view = async (
  deps: Deps,
  values = EMPTY,
  errors: FieldErrors = {},
  formError: FormView['formError'] = null,
): Promise<FormView> => ({
  values,
  errors,
  formError,
  token: await issueToken(deps.secret, deps.now),
});
export async function showJoinForm(deps: Deps): Promise<Outcome> {
  return { kind: 'form', status: 200, view: await view(deps) };
}

/** Same protections as the request form: size cap, per-address limit (own bucket), hidden field, signed fill-time token, validation, consent. Stores one interest record and nothing else. */
export async function submitJoinForm(
  deps: Deps,
  request: Request,
  address: string | undefined,
): Promise<Outcome> {
  const { db, secret, lang } = deps;
  const { form, tooLarge } = await readForm(request, SMALL_FORM_LIMIT);
  if (tooLarge) return { kind: 'message', status: 413, which: 'failed' };
  const bucket = address ? ipBucket(address) : 'unknown';
  if (
    (await hit(db, `interest:${bucket}`, WINDOW_SECONDS, deps.now)) >
    SUBMIT_LIMIT
  )
    return { kind: 'message', status: 429, which: 'limited' };

  const params = new URLSearchParams(
    [...form.entries()].filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  const thanks = (reference: string) => ({
    kind: 'redirect' as const,
    to: `${pathFor(lang, '/join/thanks')}?ref=${reference}`,
  });
  if (isHoneypotHit(params)) return thanks(newJoinReference());

  const timing = await checkToken(
    secret,
    params.get('form_token') ?? '',
    deps.now,
  );
  const parsed = parseJoinForm(params);
  if (timing !== 'ok')
    return {
      kind: 'form',
      status: 400,
      view: await view(
        deps,
        parsed.ok ? valuesOf(params) : parsed.values,
        parsed.ok ? {} : parsed.errors,
        timing === 'too_fast' ? 'too_fast' : 'expired',
      ),
    };
  if (!parsed.ok)
    return {
      kind: 'form',
      status: 400,
      view: await view(deps, parsed.values, parsed.errors),
    };

  const created = await createInterest(db, {
    input: parsed.data,
    consentVersion: joinConsentVersion(lang),
    now: deps.now,
  });
  if (!created.ok) return { kind: 'message', status: 500, which: 'failed' };
  if (deps.siteUrl) {
    const notice = notifyNewEnquiry(
      {
        reference: created.reference,
        adminUrl: `${deps.siteUrl}/admin/interest`,
        kind: 'interest',
      },
      deps.notify,
    );
    if (deps.waitUntil) deps.waitUntil(notice);
    else await notice;
  }
  return thanks(created.reference);
}

const valuesOf = (p: URLSearchParams): FormValues =>
  Object.fromEntries(
    Object.keys(EMPTY).map((k) => [k, (p.get(k) ?? '').trim()]),
  ) as FormValues;
