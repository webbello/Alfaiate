export const LANGUAGES = ['en', 'tet'] as const;
export type Lang = (typeof LANGUAGES)[number];

/** English lives at `/`, Tetum under `/tet/`. Only the exact lower-case segment `tet` is a prefix. */
export function parsePath(pathname: string): { lang: Lang; rest: string } {
  if (pathname === '/tet' || pathname.startsWith('/tet/')) {
    const rest = pathname.slice('/tet'.length);
    return { lang: 'tet', rest: rest === '' ? '/' : rest };
  }
  return { lang: 'en', rest: pathname };
}

/** The URL path of a page (`rest`, starting with one slash) in a language. */
export function pathFor(lang: Lang, rest: string): string {
  if (!rest.startsWith('/') || rest.startsWith('//'))
    throw new Error('Path must start with a single slash');
  return lang === 'en' ? rest : `/tet${rest}`;
}

/** The same page in the other language. */
export function twinPath(pathname: string): { lang: Lang; path: string } {
  const { lang, rest } = parsePath(pathname);
  const other: Lang = lang === 'en' ? 'tet' : 'en';
  return { lang: other, path: pathFor(other, rest) };
}

/** `PUBLIC_LANGUAGES` setting -> languages that may be served. English is always on; unknown names are ignored. */
export function enabledLanguages(setting: string | undefined): Lang[] {
  const wanted = new Set((setting ?? '').split(',').map((s) => s.trim()));
  return LANGUAGES.filter((lang) => lang === 'en' || wanted.has(lang));
}

export const isEnabled = (lang: Lang, enabled: readonly Lang[]) =>
  enabled.includes(lang);
