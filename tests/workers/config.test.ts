import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { ConfigError, requireBindings } from '../../src/modules/config';

describe('requireBindings', () => {
  it('returns the typed bindings when all are present', () => {
    const bindings = requireBindings(env);
    expect(bindings.DB).toBe(env.DB);
    expect(bindings.MEDIA_PRIVATE).toBe(env.MEDIA_PRIVATE);
  });

  it('fails closed and names the missing binding, not its value', () => {
    expect(() => requireBindings({ ...env, DB: undefined })).toThrow(
      ConfigError,
    );
    expect(() => requireBindings({ ...env, DB: undefined })).toThrow(/DB/);
  });

  it('fails when R2 buckets are missing', () => {
    expect(() => requireBindings({ DB: env.DB })).toThrow(
      /MEDIA_PUBLIC, MEDIA_PRIVATE/,
    );
  });
});
