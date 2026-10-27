import { describe, expect, it } from 'vitest';
import { get } from './helpers';

// BR-11, FR-CMS-03: the ten sample articles are drafts in the content editor, so a public site (SHOW_DRAFT_POSTS off) shows none of them anywhere.
const SLUGS = [
  'what-to-bring-to-a-first-fitting',
  'how-to-describe-the-garment-you-want',
  'choosing-fabric-for-hot-weather',
  'what-a-suit-lapel-tells-you',
  'five-signs-of-careful-stitching',
  'storing-formal-clothes-between-occasions',
  'caring-for-a-sewing-machine-at-home',
  'mending-a-button-and-small-tears',
  'alteration-or-a-new-garment',
  'why-a-tailor-asks-to-measure-again',
];

describe('draft journal articles on a public site', () => {
  it('are not listed, have no address, and are not in the feed or sitemap', async () => {
    const list = await (await get('/journal')).text();
    for (const slug of SLUGS) {
      expect(list, slug).not.toContain(slug);
      expect((await get(`/journal/${slug}`)).status, slug).toBe(404);
      expect((await get(`/tet/journal/${slug}`)).status, slug).toBe(404);
    }
    expect(list).toContain('No articles yet');
    expect(await (await get('/rss.xml')).text()).not.toContain('<item>');
    const sitemap = await (await get('/sitemap.xml')).text();
    for (const slug of SLUGS) expect(sitemap).not.toContain(slug);
  });
  it('do not leak their pictures into the list page', async () => {
    const list = await (await get('/journal')).text();
    expect(list).not.toContain('/photos/posts/');
  });
});
