import type { Lang } from '../../i18n/lang';
import { parseFrontmatter } from './frontmatter';
import { parseBlocks, safePhoto, type Block } from './markdown';

/**
 * The journal: tips on choosing, caring for and getting clothes made. Articles and authors are files under `content/` that staff edit in the content editor at /cms
 * (docs/SPEC-sveltia-cms.md); the site reads them when it is built. An article with `draft: true` is never public: it shows only when SHOW_DRAFT_POSTS is "true"
 * (the preview on staging), labelled as a draft, never indexed, never in the feed or the sitemap (BR-11). The owner turns Draft off to approve an article.
 * An article is listed in a language only when it has a file for that language (English is required; Tetun is optional).
 */
type Text = Record<Lang, string>;
export type Post = {
  slug: string;
  category: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  /** The languages this article has a file for. */
  langs: Lang[];
  title: Text;
  excerpt: Text;
  body: Record<Lang, Block[]>;
  cover?: { src: string; alt: Text; credit?: string };
  author?: { name: string; role?: string };
  draft?: boolean;
};

export const CATEGORIES: { slug: string; name: Text }[] = [
  { slug: 'tips', name: { en: 'Tailoring tips', tet: 'Dika alfaiate' } },
  { slug: 'care', name: { en: 'Care and repair', tet: 'Kuidadu no hadia' } },
];

const CATEGORY_BY_LABEL: Record<string, string> = {
  'Tailoring tips': 'tips',
  'Care and repair': 'care',
};
const LANGS: Lang[] = ['en', 'tet'];

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Author = { name: string; role?: string };

/** Authors by file name (`content/authors/<slug>.yml`). */
export function parseAuthors(
  files: Record<string, string>,
): Map<string, Author> {
  const authors = new Map<string, Author>();
  for (const [path, raw] of Object.entries(files)) {
    const slug = /([^/]+)\.ya?ml$/.exec(path)?.[1];
    const { data } = parseFrontmatter(raw);
    if (!slug || !str(data.name)) continue;
    authors.set(slug, {
      name: str(data.name),
      role: str(data.role) || undefined,
    });
  }
  return authors;
}

/** `files` maps `.../content/posts/<lang>/<slug>.md` to its text. An article without an English file, a bad slug or a bad date is skipped, not shown half-made. */
export function parsePosts(
  files: Record<string, string>,
  authors: Map<string, Author> = new Map(),
): Post[] {
  const bySlug = new Map<
    string,
    Partial<Record<Lang, ReturnType<typeof parseFrontmatter>>>
  >();
  for (const [path, raw] of Object.entries(files)) {
    const m = /\/posts\/([a-z]+)\/([^/]+)\.md$/.exec(path);
    const lang = LANGS.find((l) => l === m?.[1]);
    if (!m || !lang || !SLUG.test(m[2]!)) continue;
    bySlug.set(m[2]!, { ...bySlug.get(m[2]!), [lang]: parseFrontmatter(raw) });
  }
  const posts: Post[] = [];
  for (const [slug, byLang] of bySlug) {
    const en = byLang.en;
    const date = str(en?.data.date).slice(0, 10);
    if (!en || !str(en.data.title) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      continue;
    const langs = LANGS.filter((l) => byLang[l] && str(byLang[l]!.data.title));
    const pick = (field: string): Text => ({
      en: str(en.data[field]),
      tet: str(byLang.tet?.data[field]),
    });
    const cover = str(en.data.cover);
    const author = authors.get(str(en.data.author));
    posts.push({
      slug,
      category: CATEGORY_BY_LABEL[str(en.data.tags)] ?? 'tips',
      date,
      langs,
      title: pick('title'),
      excerpt: pick('description'),
      body: {
        en: parseBlocks(en.body),
        tet: byLang.tet ? parseBlocks(byLang.tet.body) : [],
      },
      cover: safePhoto(cover)
        ? {
            src: cover,
            alt: pick('cover_alt'),
            credit: str(en.data.cover_credit) || undefined,
          }
        : undefined,
      author,
      // Anything but an explicit `draft: false` stays a draft.
      draft: en.data.draft === false ? undefined : true,
    });
  }
  return posts;
}

const postFiles = import.meta.glob('../../../content/posts/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const authorFiles = import.meta.glob('../../../content/authors/*.yml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const ALL = parsePosts(postFiles, parseAuthors(authorFiles));
/** Approved articles only (Draft turned off): the feed and the sitemap read this. */
export const POSTS: Post[] = ALL.filter((p) => !p.draft);

/** Newest first, for one language. Drafts only on request (the staging preview). */
export const visiblePosts = (showDrafts: boolean, lang: Lang = 'en'): Post[] =>
  ALL.filter((p) => (showDrafts || !p.draft) && p.langs.includes(lang)).sort(
    (a, b) => b.date.localeCompare(a.date),
  );

export const categoryOf = (slug: string) =>
  CATEGORIES.find((c) => c.slug === slug);
