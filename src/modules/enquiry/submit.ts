import { pathFor, type Lang } from '../../i18n/lang';
import { readForm, SMALL_FORM_LIMIT } from '../http/body';
import { notifyNewEnquiry, type Notifier } from '../notify';
import { consentVersion } from './consent';
import { createEnquiry } from './create';
import { formChoices, preselectedTailor, type Choice } from './queries';
import { newReference } from './reference';
import {
  parseEnquiryForm,
  resolveChoices,
  tailorParam,
  type FieldErrors,
  type FormValues,
} from './schema';
import { checkSubmitRate, checkToken, isHoneypotHit, issueToken } from './spam';

export type FormView = {
  values: FormValues;
  errors: FieldErrors;
  /** A problem with the form as a whole (too quick, or too old), not with one field. */
  formError: 'too_fast' | 'expired' | null;
  token: string;
  tailor: { slug: string; name: string } | null;
  categories: Choice[];
  areas: Choice[];
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
  /** 'business' is the group-order form at /business (FR-ENQ-09): same pipeline, two more fields. */
  kind?: 'request' | 'business';
  secret: string;
  lang: Lang;
  siteUrl: string;
  notify?: Notifier;
  /** Runs the notification after the response (Workers `waitUntil`); without it the notification is awaited. */
  waitUntil?: (work: Promise<unknown>) => void;
  now?: Date;
};

const EMPTY: FormValues = {
  name: '',
  phone: '',
  channel: '',
  category: '',
  service: '',
  area: '',
  area_text: '',
  when: '',
  notes: '',
  organisation: '',
  group_size: '',
};

async function formView(
  deps: Deps,
  tailorSlug: string | null,
  values: FormValues = EMPTY,
  errors: FieldErrors = {},
  formError: FormView['formError'] = null,
): Promise<FormView> {
  const [token, tailor, choices] = await Promise.all([
    issueToken(deps.secret, deps.now),
    preselectedTailor(deps.db, tailorSlug),
    formChoices(deps.db),
  ]);
  return { values, errors, formError, token, tailor, ...choices };
}

/** GET: the empty form, optionally started from a published tailor's profile. */
export async function showForm(
  deps: Deps,
  tailorParamValue: string | null,
): Promise<Outcome> {
  return {
    kind: 'form',
    status: 200,
    view: await formView(deps, tailorParam(tailorParamValue)),
  };
}

/**
 * POST: spam checks, validation, then one stored enquiry. Customer input never leaves this function except into the database
 * and back into the form the customer is looking at; the redirect carries the random reference code only.
 */
export async function submitForm(
  deps: Deps,
  request: Request,
  address: string | undefined,
): Promise<Outcome> {
  const { db, secret, lang } = deps;
  const { form, tooLarge } = await readForm(request, SMALL_FORM_LIMIT);
  if (tooLarge) return { kind: 'message', status: 413, which: 'failed' };

  // Every attempt counts, valid or not, so a flood is stopped before anything else runs.
  if ((await checkSubmitRate(db, address, deps.now)) === 'limited')
    return { kind: 'message', status: 429, which: 'limited' };

  const thanks = (reference: string) => ({
    kind: 'redirect' as const,
    to: `${pathFor(lang, '/request/thanks')}?ref=${reference}`,
  });
  // A script filled the hidden field: look successful, store nothing.
  if (isHoneypotHit(new URLSearchParams(textFields(form))))
    return thanks(newReference());

  const params = new URLSearchParams(textFields(form));
  const tailorSlug = tailorParam(params.get('tailor'));
  const timing = await checkToken(
    secret,
    params.get('form_token') ?? '',
    deps.now,
  );
  const parsed = parseEnquiryForm(params, {
    business: deps.kind === 'business',
  });
  if (timing !== 'ok')
    return {
      kind: 'form',
      status: 400,
      view: await formView(
        deps,
        tailorSlug,
        valuesOf(params),
        parsed.ok ? {} : parsed.errors,
        timing === 'too_fast' ? 'too_fast' : 'expired',
      ),
    };
  if (!parsed.ok)
    return {
      kind: 'form',
      status: 400,
      view: await formView(deps, tailorSlug, parsed.values, parsed.errors),
    };

  const choices = await resolveChoices(db, parsed.data);
  if (!choices.ok)
    return {
      kind: 'form',
      status: 400,
      view: await formView(deps, tailorSlug, valuesOf(params), choices.errors),
    };

  const created = await createEnquiry(db, {
    input: parsed.data,
    choices,
    consentVersion: consentVersion(lang),
    now: deps.now,
  });
  if (!created.ok) return { kind: 'message', status: 500, which: 'failed' };

  const notice = notifyNewEnquiry(
    {
      reference: created.reference,
      adminUrl: `${deps.siteUrl}/admin/enquiries?q=${created.reference}`,
    },
    deps.notify,
  );
  if (deps.waitUntil) deps.waitUntil(notice);
  else await notice;
  return thanks(created.reference);
}

const textFields = (form: FormData): [string, string][] =>
  [...form.entries()].filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );

const valuesOf = (params: URLSearchParams): FormValues =>
  Object.fromEntries(
    Object.keys(EMPTY).map((key) => [key, (params.get(key) ?? '').trim()]),
  ) as FormValues;
