import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  HONEYPOT_FIELD,
  SUBMIT_LIMIT,
  checkSubmitRate,
  checkToken,
  isHoneypotHit,
  issueToken,
} from '../../src/modules/enquiry/spam';
import { ConfigError, formSecret } from '../../src/modules/config';

const SECRET = 'test-secret-0123456789abcdef';
const T0 = new Date('2026-06-01T09:00:00.000Z');
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

describe('time token (SEC-07)', () => {
  it('is accepted after the minimum fill time and before it expires', async () => {
    const token = await issueToken(SECRET, T0);
    expect(await checkToken(SECRET, token, later(3))).toBe('ok');
    expect(await checkToken(SECRET, token, later(3600))).toBe('ok');
    expect(await checkToken(SECRET, token, later(86_400))).toBe('ok');
  });

  it('is "too_fast" when submitted in under 3 seconds', async () => {
    const token = await issueToken(SECRET, T0);
    expect(await checkToken(SECRET, token, later(0))).toBe('too_fast');
    expect(await checkToken(SECRET, token, later(2))).toBe('too_fast');
  });

  it('is invalid when older than 24 hours, from the future, tampered, malformed or signed with another secret', async () => {
    const token = await issueToken(SECRET, T0);
    expect(await checkToken(SECRET, token, later(86_401))).toBe('invalid');
    expect(await checkToken(SECRET, token, later(-60))).toBe('invalid');
    const [ts, sig] = token.split('.');
    expect(
      await checkToken(SECRET, `${Number(ts) - 100}.${sig}`, later(10)),
    ).toBe('invalid');
    expect(
      await checkToken(SECRET, `${ts}.${'0'.repeat(sig.length)}`, later(10)),
    ).toBe('invalid');
    for (const bad of [
      '',
      'x',
      '.',
      'abc.def',
      `${ts}.`,
      `${ts}.zz`,
      `.${sig}`,
    ])
      expect(await checkToken(SECRET, bad, later(10)), bad).toBe('invalid');
    expect(
      await checkToken('another-secret-0123456789', token, later(10)),
    ).toBe('invalid');
  });
});

describe('honeypot', () => {
  it('is hit only when the hidden field has anything in it', () => {
    expect(
      isHoneypotHit(new URLSearchParams({ [HONEYPOT_FIELD]: 'http://spam' })),
    ).toBe(true);
    expect(isHoneypotHit(new URLSearchParams({ [HONEYPOT_FIELD]: ' ' }))).toBe(
      true,
    );
    expect(isHoneypotHit(new URLSearchParams({ [HONEYPOT_FIELD]: '' }))).toBe(
      false,
    );
    expect(isHoneypotHit(new URLSearchParams({ name: 'x' }))).toBe(false);
  });
});

describe('submission rate limit (AC-08)', () => {
  it('allows 5 per hour per address, refuses the 6th, and leaves other addresses alone', async () => {
    const ip = '198.51.100.10';
    for (let i = 0; i < SUBMIT_LIMIT; i++)
      expect(await checkSubmitRate(env.DB, ip, T0), `try ${i + 1}`).toBe('ok');
    expect(await checkSubmitRate(env.DB, ip, T0)).toBe('limited');
    expect(await checkSubmitRate(env.DB, '198.51.100.11', T0)).toBe('ok');
  });

  it('starts again in the next hour', async () => {
    const ip = '198.51.100.12';
    for (let i = 0; i <= SUBMIT_LIMIT; i++)
      await checkSubmitRate(env.DB, ip, T0);
    expect(await checkSubmitRate(env.DB, ip, later(3600))).toBe('ok');
  });

  it('still limits when there is no client address (shared bucket)', async () => {
    let last = 'ok';
    for (let i = 0; i <= SUBMIT_LIMIT; i++)
      last = await checkSubmitRate(env.DB, undefined, T0);
    expect(last).toBe('limited');
  });
});

describe('formSecret', () => {
  it('fails closed when the secret is missing or too short', () => {
    expect(() => formSecret({})).toThrow(ConfigError);
    expect(() => formSecret({ FORM_TOKEN_SECRET: 'short' })).toThrow(
      ConfigError,
    );
    expect(formSecret({ FORM_TOKEN_SECRET: SECRET })).toBe(SECRET);
  });
});
