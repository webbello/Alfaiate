import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { en } from '../../src/i18n/public/en';
import { tet } from '../../src/i18n/public/tet';
import {
  NEWSLETTER_CONSENT_VERSION,
  normaliseEmail,
  removeSignup,
  signUp,
} from '../../src/modules/newsletter';
import { issueToken } from '../../src/modules/enquiry/spam';

// Phase 7d (FR-PUB-08): footer sign-ups keep only the address and the consent record; protections as on the other public forms.
const db = env.DB;
const SECRET = 'workers-test-form-secret-0123456789';
const deps = { db, secret: SECRET, lang: 'en' as const };
const req = async (
  over: Record<string, string> = {},
  origin: string | null = 'https://example.test',
  token?: string,
) =>
  new Request('https://example.test/newsletter', {
    method: 'POST',
    headers: origin ? { Origin: origin } : {},
    body: new URLSearchParams({
      form_token:
        token ?? (await issueToken(SECRET, new Date(Date.now() - 10_000))),
      email: 'Fake.Reader@Example.test',
      consent: 'yes',
      ...over,
    }),
  });
const count = async () =>
  (await db
    .prepare('SELECT count(*) AS n FROM newsletter_signup')
    .first<{ n: number }>())!.n;
const sha = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);

describe('newsletter sign-up', () => {
  it('normalises good addresses and refuses bad ones', () => {
    expect(normaliseEmail('  Ana@Example.TL ')).toBe('ana@example.tl');
    for (const bad of [
      '',
      'a@b',
      'no-at.example',
      'a b@example.test',
      '<x>@example.test',
      `${'a'.repeat(250)}@x.test`,
    ])
      expect(normaliseEmail(bad), bad).toBeNull();
  });
  it('stores the address once with the consent version, and a repeat looks the same', async () => {
    const before = await count();
    expect(await signUp(deps, await req(), '198.51.100.1')).toEqual({
      status: 303,
      to: '/newsletter/thanks',
    });
    expect(
      await signUp(
        deps,
        await req({ email: 'fake.reader@example.test' }),
        '198.51.100.1',
      ),
    ).toEqual({ status: 303, to: '/newsletter/thanks' });
    expect(await count()).toBe(before + 1);
    const row = await db
      .prepare(
        "SELECT consent_text_version FROM newsletter_signup WHERE email = 'fake.reader@example.test'",
      )
      .first<{ consent_text_version: string }>();
    expect(row!.consent_text_version).toBe('consent-news-2026-10-v1-en');
  });
  it('refuses a missing consent, a bad address, a quick or forged token and a foreign origin, storing nothing', async () => {
    const before = await count();
    expect(
      await signUp(
        deps,
        await req({ email: 'x1@example.test', consent: '' }),
        '198.51.100.2',
      ),
    ).toMatchObject({ status: 400, error: 'consent' });
    expect(
      await signUp(deps, await req({ email: 'nope' }), '198.51.100.2'),
    ).toMatchObject({ status: 400, error: 'invalid' });
    expect(
      await signUp(
        deps,
        await req(
          { email: 'x2@example.test' },
          'https://example.test',
          await issueToken(SECRET),
        ),
        '198.51.100.2',
      ),
    ).toMatchObject({ status: 400, error: 'timing' });
    expect(
      await signUp(
        deps,
        await req({ email: 'x3@example.test' }, 'https://evil.example'),
        '198.51.100.2',
      ),
    ).toMatchObject({ status: 403 });
    expect(
      await signUp(
        deps,
        await req({ email: 'x4@example.test' }, null),
        '198.51.100.2',
      ),
    ).toMatchObject({ status: 403 });
    expect(await count()).toBe(before);
  });
  it('a filled hidden field looks like success and stores nothing; five tries an hour per address', async () => {
    const before = await count();
    expect(
      await signUp(
        deps,
        await req({ email: 'bot@example.test', extra_info: 'x' }),
        '198.51.100.3',
      ),
    ).toMatchObject({ status: 303 });
    expect(await count()).toBe(before);
    for (let i = 0; i < 4; i++)
      await signUp(
        deps,
        await req({ email: `r${i}@example.test` }),
        '198.51.100.4',
      );
    await signUp(deps, await req({ email: 'r5@example.test' }), '198.51.100.4');
    expect(
      await signUp(
        deps,
        await req({ email: 'r6@example.test' }),
        '198.51.100.4',
      ),
    ).toMatchObject({ status: 429 });
  });
  it('removal deletes the address and writes one audit row with ids only', async () => {
    await signUp(
      deps,
      await req({ email: 'remove.me@example.test' }),
      '198.51.100.5',
    );
    const id = (await db
      .prepare(
        "SELECT id FROM newsletter_signup WHERE email = 'remove.me@example.test'",
      )
      .first<{ id: number }>())!.id;
    const user = (
      await db
        .prepare(
          "INSERT INTO admin_user (email, password_hash, role) VALUES ('news-owner@example.test', 'x', 'owner')",
        )
        .run()
    ).meta.last_row_id as number;
    expect(await removeSignup(db, id, user)).toBe(true);
    expect(await removeSignup(db, id, user)).toBe(false);
    expect(
      await db
        .prepare(
          "SELECT count(*) AS n FROM audit_log WHERE action = 'newsletter_removed' AND entity_id = ?",
        )
        .bind(id)
        .first<{ n: number }>(),
    ).toEqual({ n: 1 });
    expect(
      await db
        .prepare('SELECT count(*) AS n FROM newsletter_signup WHERE id = ?')
        .bind(id)
        .first<{ n: number }>(),
    ).toEqual({ n: 0 });
  });
  it('has a consent wording fingerprint that changes only with the version', async () => {
    expect(NEWSLETTER_CONSENT_VERSION).toBe('consent-news-2026-10-v1');
    expect(await sha(en.newsletter.consent)).toBe('6440374cfbfd');
    expect(await sha(tet.newsletter.consent)).toBe('7d0cb84d7266');
  });
});

describe('newsletter addresses', () => {
  it('refuses control, zero-width and direction characters', () => {
    for (const bad of [
      'a‮b@example.test',
      'a​b@example.test',
      'a\u0007@example.test',
    ])
      expect(normaliseEmail(bad)).toBeNull();
  });
});
