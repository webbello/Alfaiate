import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// BR-11, FR-CMS-03, 06: with SHOW_DRAFT_POSTS on (the staging preview), the draft articles appear, plainly labelled, never indexed and never in the feed.
describe('draft journal articles (staging preview)', () => {
  it('are listed with their cover picture and a draft label, noindex, and not in the feed', async () => {
    const list = await (await get('/journal')).text();
    expect(list).toContain('What to bring to a first fitting');
    expect(list).toContain('Draft: this article is not published yet');
    expect(list).toContain(
      '/photos/posts/what-to-bring-to-a-first-fitting.webp',
    );
    expect(list).toMatch(/name="robots" content="noindex/);
    expect(await (await get('/rss.xml')).text()).not.toContain('<item>');
  });
  it('shows an article with its cover, credit, author, headings and list as elements', async () => {
    const post = await (
      await get('/journal/what-to-bring-to-a-first-fitting')
    ).text();
    expect(post).toContain('Draft: this article is not published yet');
    expect(post).toMatch(/name="robots" content="noindex/);
    expect(post).toContain(
      '<figcaption>Photo: Myriams-Fotos, CC0, via Wikimedia Commons</figcaption>',
    );
    expect(post).toContain('Written by');
    expect(post).toContain('Alfaiate TL team');
    expect(post).toContain('<h2>Wear the right layers</h2>');
    expect(post).toContain(
      '<li><strong>The shoes you will wear with the clothes.</strong>',
    );
  });
  it('has no Tetun version yet (English only), so the Tetun address is not found', async () => {
    expect(
      (await get('/tet/journal/what-to-bring-to-a-first-fitting')).status,
    ).toBe(404);
    expect(await (await get('/tet/journal')).text()).toContain(
      'Seidauk iha artigu',
    );
  });
  it('keeps the categories working: the care article is under Care and repair', async () => {
    const care = await (await get('/journal/category/care')).text();
    expect(care).toContain('Caring for a sewing machine at home');
    expect(care).not.toContain('What to bring to a first fitting');
  });
});
