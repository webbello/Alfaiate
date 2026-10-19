import { describe, expect, it } from 'vitest';
import {
  enabledLanguages,
  isEnabled,
  parsePath,
  pathFor,
  twinPath,
} from '../../src/i18n/lang';
import { ConfigError, siteConfig } from '../../src/modules/config';

describe('parsePath', () => {
  it('reads the language prefix and leaves the rest', () => {
    expect(parsePath('/')).toEqual({ lang: 'en', rest: '/' });
    expect(parsePath('/tailors/ana')).toEqual({
      lang: 'en',
      rest: '/tailors/ana',
    });
    expect(parsePath('/tet')).toEqual({ lang: 'tet', rest: '/' });
    expect(parsePath('/tet/')).toEqual({ lang: 'tet', rest: '/' });
    expect(parsePath('/tet/tailors/ana')).toEqual({
      lang: 'tet',
      rest: '/tailors/ana',
    });
  });

  it('only treats exactly "/tet" as a prefix: look-alikes stay English paths', () => {
    for (const path of [
      '/tetum',
      '/tet-x/a',
      '/TET/a',
      '//tet/a',
      '/x/tet/a',
      '/tailors/tet',
    ]) {
      expect(parsePath(path).lang, path).toBe('en');
    }
  });

  it('does not interpret dot segments or encodings itself', () => {
    expect(parsePath('/tet/../admin')).toEqual({
      lang: 'tet',
      rest: '/../admin',
    });
    expect(parsePath('/%74et/a').lang).toBe('en');
  });
});

describe('pathFor and twinPath', () => {
  it('builds the same page in either language', () => {
    expect(pathFor('en', '/tailors')).toBe('/tailors');
    expect(pathFor('tet', '/tailors')).toBe('/tet/tailors');
    expect(pathFor('tet', '/')).toBe('/tet/');
    expect(pathFor('en', '/')).toBe('/');
  });
  it('finds the other language of the current page', () => {
    expect(twinPath('/tailors/ana')).toEqual({
      lang: 'tet',
      path: '/tet/tailors/ana',
    });
    expect(twinPath('/tet/tailors/ana')).toEqual({
      lang: 'en',
      path: '/tailors/ana',
    });
    expect(twinPath('/')).toEqual({ lang: 'tet', path: '/tet/' });
    expect(twinPath('/tet/')).toEqual({ lang: 'en', path: '/' });
  });
  it('refuses a rest that does not start with a slash', () => {
    expect(() => pathFor('en', 'tailors')).toThrow();
    expect(() => pathFor('tet', '//evil.test')).toThrow();
  });
});

describe('enabledLanguages', () => {
  it('defaults to English only, and always includes English', () => {
    expect(enabledLanguages(undefined)).toEqual(['en']);
    expect(enabledLanguages('')).toEqual(['en']);
    expect(enabledLanguages('tet')).toEqual(['en', 'tet']);
  });
  it('accepts a comma list, ignores unknown names and duplicates', () => {
    expect(enabledLanguages('en,tet')).toEqual(['en', 'tet']);
    expect(enabledLanguages(' tet , en , tet , fr, ')).toEqual(['en', 'tet']);
    expect(enabledLanguages('fr,de')).toEqual(['en']);
  });
  it('isEnabled checks membership', () => {
    expect(isEnabled('tet', ['en'])).toBe(false);
    expect(isEnabled('tet', ['en', 'tet'])).toBe(true);
  });
});

describe('siteConfig', () => {
  const ok = {
    SITE_URL: 'https://alfaiate-tl.example',
    PUBLIC_LANGUAGES: 'en',
  };
  it('returns a normalised site URL without a trailing slash and the enabled languages', () => {
    expect(
      siteConfig({ ...ok, SITE_URL: 'https://alfaiate-tl.example/' }),
    ).toEqual({ siteUrl: 'https://alfaiate-tl.example', languages: ['en'] });
    expect(siteConfig({ ...ok, PUBLIC_LANGUAGES: 'en,tet' }).languages).toEqual(
      ['en', 'tet'],
    );
  });
  it('allows http only for localhost', () => {
    expect(
      siteConfig({ ...ok, SITE_URL: 'http://localhost:4321' }).siteUrl,
    ).toBe('http://localhost:4321');
  });
  it('fails closed on a missing or unsafe site URL', () => {
    for (const bad of [
      undefined,
      '',
      'not a url',
      'http://alfaiate-tl.example',
      'javascript:alert(1)',
      'https://alfaiate-tl.example/path',
      'https://a.example?x=1',
      'https://user:pw@a.example',
    ]) {
      expect(
        () => siteConfig({ ...ok, SITE_URL: bad as never }),
        String(bad),
      ).toThrow(ConfigError);
    }
  });
});
