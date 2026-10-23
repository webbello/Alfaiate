import { describe, expect, it } from 'vitest';
import { ORIGIN, csrfOf, get, post, signIn } from './helpers';
import { worker } from './worker';

// Admin redesign: a light/dark switch in the top bar. The choice is a plain cookie set by a guarded POST, so it needs no script.
describe('the admin theme switch', () => {
  it('sets the cookie, goes back to the same admin page, and the page then renders dark', async () => {
    const cookie = await signIn('viewer');
    const csrf = await csrfOf(cookie);
    const res = await post('/admin/theme', cookie, {
      csrf,
      theme: 'dark',
      next: '/admin/account',
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/admin/account');
    const set = res.headers.get('set-cookie') ?? '';
    expect(set).toContain('admin_theme=dark');
    expect(set).toMatch(/HttpOnly/i);
    const html = await (
      await get('/admin', `${cookie}; admin_theme=dark`)
    ).text();
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('Switch to the light theme');
    const light = await (await get('/admin', cookie)).text();
    expect(light).not.toContain('data-theme');
    expect(light).toContain('Switch to the dark theme');
  });

  it('never redirects outside the admin, and refuses a missing token or an anonymous caller', async () => {
    const cookie = await signIn('viewer');
    const csrf = await csrfOf(cookie);
    for (const next of [
      'https://evil.example/',
      '//evil.example',
      '/admin/../x\\evil',
      '/tailors',
    ]) {
      const res = await post('/admin/theme', cookie, {
        csrf,
        theme: 'light',
        next,
      });
      expect(res.headers.get('location'), next).toMatch(/^\/admin(?!\/\.\.)/);
      expect(res.headers.get('location'), next).not.toContain('evil');
    }
    expect((await post('/admin/theme', cookie, { theme: 'dark' })).status).toBe(
      403,
    );
    expect(
      (await post('/admin/theme', undefined, { csrf, theme: 'dark' })).status,
    ).not.toBe(303);
  });

  it('shows the search box and the new-enquiries bell only to roles that may read enquiries', async () => {
    const viewer = await (await get('/admin', await signIn('viewer'))).text();
    expect(viewer).not.toContain('class="admin-search"');
    expect(viewer).not.toContain('New enquiries:');
    const manager = await (await get('/admin', await signIn('manager'))).text();
    expect(manager).toContain('class="admin-search"');
    expect(manager).toMatch(/aria-label="New enquiries: \d+"/);
  });
});

describe('the dark palette keeps text readable (WCAG 1.4.3)', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it('has at least 4.5:1 for every text pair', async () => {
    const html = await (await get('/admin/login')).text();
    const href = /<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/.exec(html)![1];
    const css = await (
      await worker.fetch(new Request(`${ORIGIN}${href}`))
    ).text();
    const dark = /\[data-theme=["']?dark["']?\]\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(dark, 'dark block in the shipped CSS').toBeTruthy();
    const light = /:root\s*\{([^}]*)\}/.exec(css)![1];
    const hex = (name: string) => {
      const m =
        new RegExp(`--${name}:\\s*#([0-9a-f]{6}|[0-9a-f]{3})\\b`, 'i').exec(
          dark!,
        ) ??
        new RegExp(`--${name}:\\s*#([0-9a-f]{6}|[0-9a-f]{3})\\b`, 'i').exec(
          light,
        );
      expect(m, `--${name}`).not.toBeNull();
      const h = m![1];
      return `#${h.length === 3 ? [...h].map((c) => c + c).join('') : h}`;
    };
    const pairs: [string, string][] = [
      ['ink', 'paper'],
      ['ink', 'surface'],
      ['text', 'surface'],
      ['muted', 'surface'],
      ['muted', 'paper'],
      ['muted', 'band'],
      ['link', 'surface'],
      ['link', 'paper'],
      ['info', 'info-soft'],
      ['ok', 'ok-soft'],
      ['warn', 'warn-soft'],
      ['bad', 'bad-soft'],
      ['chip-neutral', 'band'],
      ['side-ink', 'side-bg'],
      ['side-group', 'side-bg'],
      ['bad-text', 'bad-surface'],
    ];
    for (const [fg, bg] of pairs)
      expect(ratio(hex(fg), hex(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(
        4.5,
      );
  });
});
