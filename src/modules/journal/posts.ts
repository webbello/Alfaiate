import type { Lang } from '../../i18n/lang';

/**
 * The journal: tips on choosing, caring for and getting clothes made. Articles are written by the owner and live here as text (no
 * database, no editor; adding one is a code change). `POSTS` holds only owner-approved articles. `SAMPLE_POSTS` are layout samples shown
 * only when SHOW_TESTIMONIAL_PLACEHOLDERS is "true" (development), always labelled as samples, never in the feed or the sitemap (BR-11).
 */
type Text = Record<Lang, string>;
export type Post = {
  slug: string;
  category: string;
  /** ISO date, YYYY-MM-DD. */
  date: string;
  title: Text;
  excerpt: Text;
  body: Record<Lang, string[]>;
  sample?: boolean;
};

export const CATEGORIES: { slug: string; name: Text }[] = [
  { slug: 'tips', name: { en: 'Tailoring tips', tet: 'Dika alfaiate' } },
  { slug: 'care', name: { en: 'Care and repair', tet: 'Kuidadu no hadia' } },
];

export const POSTS: Post[] = [];

export const SAMPLE_POSTS: Post[] = [
  {
    slug: 'sample-measurements',
    category: 'tips',
    date: '2026-01-10',
    sample: true,
    title: {
      en: 'Sample: what to bring to a first fitting',
      tet: 'Amostra: saida mak lori ba tesi dahuluk',
    },
    excerpt: {
      en: 'Sample text for reviewing the layout only.',
      tet: 'Testu amostra hodi haree layout deit.',
    },
    body: {
      en: [
        'Sample text for reviewing the layout only. This is not real advice.',
        'A second sample paragraph shows how longer articles read.',
      ],
      tet: [
        'Testu amostra hodi haree layout deit. Ne’e la’ós konsellu loos.',
        'Parágrafu amostra segundu hatudu oinsá artigu naruk lee.',
      ],
    },
  },
  {
    slug: 'sample-care',
    category: 'care',
    date: '2026-01-03',
    sample: true,
    title: {
      en: 'Sample: keeping a jacket in shape',
      tet: 'Amostra: tau kazaku hela forma di’ak',
    },
    excerpt: {
      en: 'Sample text for reviewing the layout only.',
      tet: 'Testu amostra hodi haree layout deit.',
    },
    body: {
      en: [
        'Sample text for reviewing the layout only. This is not real advice.',
      ],
      tet: ['Testu amostra hodi haree layout deit. Ne’e la’ós konsellu loos.'],
    },
  },
];

/** Newest first. Samples only on request. */
export const visiblePosts = (showSamples: boolean): Post[] =>
  [...POSTS, ...(showSamples ? SAMPLE_POSTS : [])].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

export const categoryOf = (slug: string) =>
  CATEGORIES.find((c) => c.slug === slug);
