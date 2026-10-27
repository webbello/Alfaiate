import { describe, expect, it } from 'vitest';
import { findProblems } from '../../scripts/check-repo-lib.mjs';

// SEC-03, AGENTS.md: nothing secret, nothing personal and no database or photo may be tracked by git.
// Fake secrets are assembled from parts so this file itself does not look like one to the check.
const file = (path: string, text: string | null = '') => ({ path, text });
const problems = (...files: { path: string; text: string | null }[]) =>
  findProblems(files);

describe('check:repo file rules', () => {
  it('accepts an ordinary tree, including the documented example files', () => {
    expect(
      problems(
        file('src/index.ts'),
        file('docs/x.md', 'plain text'),
        file('.dev.vars.example', 'A=replace-me'),
        file('.env.example', 'A=replace-me'),
        file('tests/workers/fixtures/images.ts'),
        file('package.json', '{}'),
      ),
    ).toEqual([]);
  });

  it('refuses environment files, local variable files, databases, key files, uploads and build output', () => {
    for (const bad of [
      '.env',
      '.env.local',
      '.env.production',
      'sub/.env',
      '.dev.vars',
      'data.sqlite',
      'a/b/local.sqlite3',
      'backup.db',
      'export.dump',
      'backup.zip',
      'data.tar.gz',
      'old.bak',
      'keys/server.pem',
      'id_rsa',
      'deploy.key',
      'uploads/a.txt',
      '.wrangler/state/x.sqlite',
      'dist/server/entry.mjs',
      'node_modules/a/index.js',
    ]) {
      const found = problems(file(bad));
      expect(found.length, bad).toBeGreaterThanOrEqual(1); // a path can break two rules at once
      expect(
        found.every((line) => line.startsWith(bad)),
        bad,
      ).toBe(true);
    }
  });

  it('refuses photos and other images (customer and tailor photos never belong in git)', () => {
    for (const bad of [
      'a.jpg',
      'x/y.JPEG',
      'photo.png',
      'p.webp',
      'p.gif',
      'p.heic',
    ])
      expect(problems(file(bad)), bad).toHaveLength(1);
  });
});

describe('check:repo content rules', () => {
  it('refuses private key blocks and well-known token shapes, naming the file but never printing the secret', () => {
    const secrets: [string, string][] = [
      ['private key', ['-----BEGIN', 'PRIVATE KEY-----'].join(' RSA ')],
      ['aws key', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
      ['github token', 'ghp_' + 'a'.repeat(36)],
      ['slack token', 'xoxb-' + '1234567890-abcdefghij'],
      ['stripe key', 'sk_live_' + 'abcdefghijklmnopqrstuvwx'],
    ];
    for (const [name, secret] of secrets) {
      const found = problems(file('src/config.ts', `const x = "${secret}";`));
      expect(found, name).toHaveLength(1);
      expect(found[0], name).toContain('src/config.ts');
      expect(found[0], name).not.toContain(secret);
    }
  });

  it('skips files it cannot read as text', () => {
    expect(problems(file('weights.bin', null))).toEqual([]);
    // ...and keeps checking the files after it
    expect(
      problems(
        file('weights.bin', null),
        file('x.ts', 'AKIA' + 'ABCDEFGHIJKLMNOP'),
      ),
    ).toHaveLength(1);
  });

  it('reports every problem, not just the first', () => {
    expect(
      problems(
        file('.env'),
        file('a.jpg'),
        file('x.ts', 'AKIA' + 'ABCDEFGHIJKLMNOP'),
      ),
    ).toHaveLength(3);
  });
});

// Owner decision 2026-10-19: licensed scene photos for the public site may be tracked, but only WebP files in public/images/site/
// whose name is listed in that folder's CREDITS.md (photographer, source, licence). Every other image is still refused.
describe('check:repo licensed scene photos', () => {
  const credits = file(
    'public/images/site/CREDITS.md',
    '| hero | Someone | https://unsplash.com/photos/x | Unsplash License |',
  );
  it('accepts a credited WebP in public/images/site', () => {
    expect(
      problems(credits, file('public/images/site/hero-800.webp', null)),
    ).toEqual([]);
  });
  it('refuses an uncredited one, another format, another folder, or any image without the credits file', () => {
    for (const bad of [
      [credits, file('public/images/site/other-800.webp', null)],
      [credits, file('public/images/site/hero-800.jpg', null)],
      [credits, file('public/images/hero-800.webp', null)],
      [credits, file('public/images/site/sub/hero-800.webp', null)],
      [file('public/images/site/hero-800.webp', null)],
    ])
      expect(
        problems(...bad).length,
        bad.map((f) => f.path).join(' '),
      ).toBeGreaterThanOrEqual(1);
  });
});

describe('check:repo admin app icons', () => {
  it('accepts exactly the three generated admin icons and nothing else of that kind', () => {
    for (const size of [180, 192, 512])
      expect(problems(file(`public/admin-icon-${size}.png`, null))).toEqual([]);
    for (const bad of [
      'public/admin-icon-256.png',
      'public/admin-icon-512.jpg',
      'public/other-512.png',
      'public/images/admin-icon-512.png',
    ])
      expect(problems(file(bad, null)).length, bad).toBeGreaterThanOrEqual(1);
  });
});

describe('check:repo credits are read from the first column only', () => {
  it('does not credit a file whose name appears only in another column', () => {
    const credits = file(
      'public/images/site/CREDITS.md',
      '| hero | robbie | https://x | Unsplash License |',
    );
    expect(
      problems(credits, file('public/images/site/robbie-800.webp', null))
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      problems(credits, file('public/images/site/hero-800.webp', null)),
    ).toEqual([]);
  });
});

describe('check:repo photos edited in the content editor (FR-CMS-07)', () => {
  it('allows web photos under public/photos only', () => {
    expect(
      problems(
        file('public/photos/tailors/zeb-1.webp', null),
        file('public/photos/site/hero.jpg', null),
        file('public/photos/authors/ana.PNG', null),
      ),
    ).toEqual([]);
    for (const bad of [
      'public/photos/x.heic',
      'public/photos/x.gif',
      'public/other/x.webp',
      'src/photos/x.jpg',
      'content/photos/x.jpg',
      'public/photos.webp',
    ])
      expect(problems(file(bad, null)), bad).toHaveLength(1);
  });
});
