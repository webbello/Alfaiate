import type { AstroCookies } from 'astro';

/**
 * The tabs of a tailor's page (docs: admin redesign). After a save the browser is sent back to the same address (the existing redirects stay exactly as they were), so the tab
 * the change was made on is remembered in a short-lived cookie that the page reads once and clears; a link with a #tab-... or a field anchor always wins over it.
 */
export const TABS = ['details', 'work', 'photos', 'publish', 'more'] as const;
export type Tab = (typeof TABS)[number];
export const TAB_COOKIE = '__Host-admin_tab';

export function rememberTab(cookies: AstroCookies, tab: Tab): void {
  cookies.set(TAB_COOKIE, tab, {
    path: '/',
    maxAge: 30,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
  });
}

/** The remembered tab, once: it is cleared so the next visit opens the first tab. */
export function takeTab(cookies: AstroCookies): Tab | null {
  const value = cookies.get(TAB_COOKIE)?.value;
  if (value === undefined) return null;
  cookies.delete(TAB_COOKIE, { path: '/' });
  return (TABS as readonly string[]).includes(value) ? (value as Tab) : null;
}
