import { describe, expect, it } from 'vitest';
import { csrfTokenFor, verifyCsrf } from '../../src/modules/auth/csrf';

describe('csrf', () => {
  it('derives a stable token per session token', async () => {
    expect(await csrfTokenFor('session-a')).toBe(
      await csrfTokenFor('session-a'),
    );
  });

  it('gives different sessions different tokens, and never echoes the session token', async () => {
    const a = await csrfTokenFor('session-a');
    expect(a).not.toBe(await csrfTokenFor('session-b'));
    expect(a).not.toContain('session-a');
  });

  it('accepts the matching token and rejects wrong, empty and missing ones (SEC-02)', async () => {
    const token = await csrfTokenFor('session-a');
    expect(await verifyCsrf('session-a', token)).toBe(true);
    expect(await verifyCsrf('session-a', await csrfTokenFor('session-b'))).toBe(
      false,
    );
    expect(await verifyCsrf('session-a', '')).toBe(false);
    expect(await verifyCsrf('session-a', null)).toBe(false);
    expect(await verifyCsrf('session-a', token + 'x')).toBe(false);
  });
});
