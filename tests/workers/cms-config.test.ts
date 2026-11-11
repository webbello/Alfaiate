import { describe, expect, it } from 'vitest';
import page from '../../public/cms/index.html?raw';
import config from '../../public/cms/config.yml?raw';
import headers from '../../public/_headers?raw';

// FR-CMS-01, 02, 07: the content editor page and its configuration. The full schema check is the Sveltia validator
// (`node ~/.claude/skills/sveltia-cms/scripts/validate-config.mjs public/cms/config.yml`), which needs the network, so it is run by hand when the file changes.

describe('/cms page', () => {
  it('is the plain Sveltia page: noindex, one pinned script, no stylesheet, no module', () => {
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).toMatch(
      /<script src="https:\/\/unpkg\.com\/@sveltia\/cms@\d+\.\d+\.\d+\/dist\/sveltia-cms\.js"><\/script>/,
    );
    expect(page).not.toMatch(/stylesheet|type="module"/);
    expect(page).toContain('rel="cms-config-url"');
  });
  it('gets its own headers: never indexed, never cached, popup sign-in allowed', () => {
    expect(headers).toMatch(
      /^\/cms\/\*\n(\s+.+\n)*\s+X-Robots-Tag: noindex, nofollow/m,
    );
    expect(headers).toContain('Cache-Control: no-store');
    expect(headers).toContain(
      'Cross-Origin-Opener-Policy: same-origin-allow-popups',
    );
  });
});

describe('/cms config', () => {
  it('keeps photos under public/photos (not /media, which is the R2 route, and not an uploads folder)', () => {
    expect(config).toMatch(/^media_folder: public\/photos$/m);
    expect(config).toMatch(/^public_folder: \/photos$/m);
    for (const m of config.matchAll(/^\s*media_folder: (\S+)/gm))
      expect(m[1]).toMatch(/^\/?public\/photos(\/|$)/);
    expect(config).not.toMatch(/media_folder: .*uploads/);
  });
  it('limits and converts uploads (1.5 MB, WebP)', () => {
    expect(config).toContain('max_file_size: 1572864');
    expect(config).toContain('format: webp');
  });
  it('defines the five collections and the site settings, and no nested Pages collection', () => {
    for (const name of [
      'posts',
      'authors',
      'tailor_photos',
      'product_photos',
      'site',
    ])
      expect(config).toMatch(new RegExp(`- name: ${name}$`, 'm'));
    expect(config).not.toMatch(/name: pages/);
  });
  it('holds no tailor or product text, price, status or permission field (the no-conflict rule)', () => {
    for (const word of [
      'price',
      'status',
      'consent',
      'permission',
      'whatsapp',
      'phone',
      'availability',
    ])
      expect(config.toLowerCase(), word).not.toMatch(
        new RegExp(`- name: [a-z_]*${word}`),
      );
  });
  it('new posts start as drafts (BR-11)', () => {
    expect(config).toMatch(/- name: draft[\s\S]*?default: true/);
  });
  it('names the GitHub repository (local-folder editing works without signing in)', () => {
    expect(config).toMatch(
      /^backend:\n {2}name: github\n {2}repo: webbello\/Alfaiate$/m,
    );
  });
});

describe('/cms photo entries', () => {
  it('take their slug only from the link in /admin: read only, checked, no dropdown list to keep up to date', () => {
    for (const label of ['Tailor', 'Product'])
      expect(config).toMatch(
        new RegExp(
          `- name: slug\\n\\s+label: ${label}\\n\\s+readonly: true\\n`,
        ),
      );
    expect(config).not.toMatch(/widget: relation\n\s+collection: lists/);
  });
});
