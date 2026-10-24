import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import {
  ConfigError,
  photosEnabled,
  requireBindings,
} from '../../src/modules/config';

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

  it('runs without photo storage when both buckets are absent (free plan)', async () => {
    const bindings = requireBindings({ DB: env.DB });
    expect(photosEnabled({ DB: env.DB })).toBe(false);
    expect(photosEnabled(env)).toBe(true);
    expect(await bindings.MEDIA_PUBLIC.get('any/key')).toBeNull();
    expect(await bindings.MEDIA_PRIVATE.head('any/key')).toBeNull();
    await expect(bindings.MEDIA_PRIVATE.put('k', 'v')).rejects.toThrow(
      ConfigError,
    );
  });

  it('fails when only one bucket is bound, naming the missing one', () => {
    expect(() =>
      requireBindings({ DB: env.DB, MEDIA_PUBLIC: env.MEDIA_PUBLIC }),
    ).toThrow(/MEDIA_PRIVATE/);
  });
});
