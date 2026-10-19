import { pathFor, type Lang } from '../../i18n/lang';
import { hit, ipBucket } from '../auth/rate-limit';
import { readForm, SMALL_FORM_LIMIT } from '../http/body';
import { checkToken, isHoneypotHit, SUBMIT_LIMIT } from '../enquiry/spam';

/** Bump when either language's newsletter consent text changes (tests/workers/newsletter.test.ts fingerprints it). */
export const NEWSLETTER_CONSENT_VERSION = 'consent-news-2026-10-v1';

export const newsletterEnabled = (env: { NEWSLETTER_ENABLED?: string }) =>
  env.NEWSLETTER_ENABLED === 'true';

// Deliberately simple: one @, a dot in the domain, no spaces or angle brackets. The real check is the confirmation the owner sends later.
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
export const normaliseEmail = (raw: string): string | null => {
  const email = raw.trim().toLowerCase();
  return email.length >= 6 && email.length <= 254 && EMAIL.test(email)
    ? email
    : null;
};

export type SignupOutcome =
  | { to: string; status: 303 }
  | {
      status: 400 | 403 | 413 | 429;
      error:
        | 'invalid'
        | 'consent'
        | 'forbidden'
        | 'too_large'
        | 'limited'
        | 'timing';
    };

/**
 * Stores one address with the consent version. A repeat sign-up looks the same as a new one (nobody learns who is on the list),
 * a filled hidden field looks like success and stores nothing. Protections as on the other public forms.
 */
export async function signUp(
  deps: { db: D1Database; secret: string; lang: Lang; now?: Date },
  request: Request,
  address: string | undefined,
): Promise<SignupOutcome> {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return { status: 403, error: 'forbidden' };
  const { form, tooLarge } = await readForm(request, SMALL_FORM_LIMIT);
  if (tooLarge) return { status: 413, error: 'too_large' };
  const bucket = address ? ipBucket(address) : 'unknown';
  if (
    (await hit(deps.db, `newsletter:${bucket}`, 60 * 60, deps.now)) >
    SUBMIT_LIMIT
  )
    return { status: 429, error: 'limited' };
  const params = new URLSearchParams(
    [...form.entries()].filter(
      (e): e is [string, string] => typeof e[1] === 'string',
    ),
  );
  const done = {
    status: 303 as const,
    to: pathFor(deps.lang, '/newsletter/thanks'),
  };
  if (isHoneypotHit(params)) return done;
  if (
    (await checkToken(
      deps.secret,
      params.get('form_token') ?? '',
      deps.now,
    )) !== 'ok'
  )
    return { status: 400, error: 'timing' };
  const email = normaliseEmail(params.get('email') ?? '');
  if (!email) return { status: 400, error: 'invalid' };
  if (params.get('consent') !== 'yes') return { status: 400, error: 'consent' };
  await deps.db
    .prepare(
      'INSERT OR IGNORE INTO newsletter_signup (email, consent_text_version, consent_at) VALUES (?, ?, ?)',
    )
    .bind(
      email,
      `${NEWSLETTER_CONSENT_VERSION}-${deps.lang}`,
      (deps.now ?? new Date()).toISOString(),
    )
    .run();
  return done;
}

export type SignupRow = {
  id: number;
  email: string;
  consent_text_version: string;
  created_at: string;
};
export const listSignups = async (db: D1Database) =>
  (
    await db
      .prepare(
        'SELECT id, email, consent_text_version, created_at FROM newsletter_signup ORDER BY created_at DESC, id DESC LIMIT 500',
      )
      .all<SignupRow>()
  ).results;

/** Removes an address for good (on request, PRV-04). Writes an audit row with ids only. */
export async function removeSignup(
  db: D1Database,
  id: number,
  userId: number,
): Promise<boolean> {
  const [del] = await db.batch([
    db.prepare('DELETE FROM newsletter_signup WHERE id = ?').bind(id),
    db
      .prepare(
        "INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT ?, 'newsletter_removed', 'newsletter_signup', ? WHERE changes() > 0",
      )
      .bind(userId, id),
  ]);
  return (del.meta.changes ?? 0) > 0;
}
