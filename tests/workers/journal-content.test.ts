import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/modules/journal/frontmatter';
import { parseBlocks, parseInline } from '../../src/modules/journal/markdown';
import {
  parseAuthors,
  parsePosts,
  visiblePosts,
} from '../../src/modules/journal/posts';

// FR-CMS-02, 03, 06: the journal reads articles and authors written by the content editor. BR-11: a draft is never public.
const doc = (fields: string, body = 'Hello.') =>
  `---\n${fields}\n---\n\n${body}\n`;
const en = (slug: string, fields: string, body?: string) => ({
  [`/content/posts/en/${slug}.md`]: doc(fields, body),
});
const base = 'title: A title\ndate: 2026-10-01T09:00:00.000Z\ndraft: false';

describe('front matter', () => {
  it('reads plain, quoted and block text, booleans, and skips nested lists', () => {
    const { data, body } = parseFrontmatter(
      doc(
        [
          'title: "Quote: here"',
          "other: 'it''s'",
          'draft: true',
          'empty:',
          'links:',
          '  - label: x',
          '    url: https://example.test',
          'text: |-',
          '  line one',
          '  line two',
          'folded: >-',
          '  one',
          '  two',
          'long: a plain value',
          '  that wraps',
        ].join('\n'),
        'Body text',
      ),
    );
    expect(data).toMatchObject({
      title: 'Quote: here',
      other: "it's",
      draft: true,
      empty: null,
      links: null,
      text: 'line one\nline two',
      folded: 'one two',
      long: 'a plain value that wraps',
    });
    expect(body).toBe('Body text');
  });
  it('reads a plain yml file with no fence', () => {
    expect(parseFrontmatter('name: Ana\nrole: Editor\n').data).toEqual({
      name: 'Ana',
      role: 'Editor',
    });
  });
});

describe('article text becomes data, never HTML', () => {
  it('builds paragraphs, headings, lists, quotes and a /photos picture', () => {
    const blocks = parseBlocks(
      '## Head\n\nA **bold** and *soft* [link](https://example.test).\n\n- one\n- two\n\n1. first\n2. second\n\n> quoted\n\n![alt](/photos/posts/x.webp)',
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'h2',
      'p',
      'ul',
      'ol',
      'quote',
      'img',
    ]);
    expect(parseInline('a **b** [c](https://e.test)')).toEqual([
      { text: 'a ' },
      { text: 'b', strong: true },
      { text: ' ' },
      { text: 'c', href: 'https://e.test' },
    ]);
  });
  it('keeps the words of an unsafe link but drops its address, and drops a picture outside /photos', () => {
    expect(parseInline('[x](javascript:alert)')).toEqual([{ text: 'x' }]);
    expect(parseBlocks('![a](https://evil.test/x.png)')).toEqual([]);
    expect(parseBlocks('![a](/photos/../etc/passwd)')).toEqual([]);
    const html = JSON.stringify(parseBlocks('<script>alert(1)</script>'));
    expect(html).toContain('<script>'); // kept as text: the page prints it as text
  });
});

describe('posts', () => {
  const authors = parseAuthors({
    '/content/authors/ana.yml': 'name: Ana Fake\nrole: Editor\n',
  });
  it('keeps drafts out of the public list, and shows them only on request', () => {
    const files = {
      ...en('published', base),
      ...en('still-draft', base.replace('draft: false', 'draft: true')),
      ...en('no-flag', 'title: T\ndate: 2026-10-02'),
    };
    const posts = parsePosts(files, authors);
    expect(posts.find((p) => p.slug === 'published')?.draft).toBeUndefined();
    expect(posts.find((p) => p.slug === 'still-draft')?.draft).toBe(true);
    expect(posts.find((p) => p.slug === 'no-flag')?.draft).toBe(true); // anything but draft: false is a draft
  });
  it('lists an article in Tetun only when a Tetun file exists', () => {
    const posts = parsePosts({
      ...en('both', base),
      '/content/posts/tet/both.md': doc(
        'title: Titulu\ndate: 2026-10-01\ndraft: false',
      ),
      ...en('only-english', base),
    });
    expect(posts.find((p) => p.slug === 'both')?.langs).toEqual(['en', 'tet']);
    expect(posts.find((p) => p.slug === 'only-english')?.langs).toEqual(['en']);
  });
  it('skips an article with no English file, a bad slug or a bad date', () => {
    const posts = parsePosts({
      '/content/posts/tet/tet-only.md': doc(base),
      ...en('Bad_Slug', base),
      ...en('bad-date', 'title: T\ndate: soon\ndraft: false'),
      ...en('no-title', 'date: 2026-10-01\ndraft: false'),
    });
    expect(posts).toEqual([]);
  });
  it('maps the category label, the author and a safe cover; drops an unsafe cover', () => {
    const [good] = parsePosts(
      en(
        'x',
        `${base}\ntags: Care and repair\nauthor: ana\ncover: /photos/posts/x.webp\ncover_alt: Alt\ncover_credit: Credit`,
      ),
      authors,
    );
    expect(good).toMatchObject({
      category: 'care',
      author: { name: 'Ana Fake', role: 'Editor' },
      cover: {
        src: '/photos/posts/x.webp',
        alt: { en: 'Alt' },
        credit: 'Credit',
      },
    });
    const [bad] = parsePosts(
      en('y', `${base}\ncover: https://evil.test/x.png`),
    );
    expect(bad!.cover).toBeUndefined();
  });
});

describe('the ten sample articles (FR-CMS-06)', () => {
  const files = import.meta.glob('../../content/posts/*/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const authorFiles = import.meta.glob('../../content/authors/*.yml', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>;
  const posts = parsePosts(files, parseAuthors(authorFiles));
  it('are ten drafts with a cover, a description of it, a credit and an author', () => {
    expect(posts.length).toBeGreaterThanOrEqual(10);
    for (const p of posts) {
      expect(p.draft, p.slug).toBe(true);
      expect(p.cover?.src, p.slug).toBe(`/photos/posts/${p.slug}.webp`);
      expect(p.cover?.alt.en, p.slug).not.toBe('');
      expect(p.cover?.credit, p.slug).toMatch(/CC0|Public domain|CC BY/);
      expect(p.author?.name, p.slug).toBeTruthy();
      expect(p.body.en.length, p.slug).toBeGreaterThan(2);
    }
  });
  it('none is public: the list for visitors is empty, and the preview shows them', () => {
    expect(visiblePosts(false)).toEqual([]);
    expect(visiblePosts(true).length).toBeGreaterThanOrEqual(10);
    expect(visiblePosts(true, 'tet')).toEqual([]); // English only for now
  });
});
