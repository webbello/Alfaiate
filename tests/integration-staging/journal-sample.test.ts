import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// BR-11: with SHOW_TESTIMONIAL_PLACEHOLDERS on (development), sample articles appear, plainly labelled, never indexed and never in the feed.
describe('sample journal articles (development only)', () => {
  it('are labelled, noindex and not in the feed', async () => {
    const list = await (await get('/journal')).text();
    expect(list).toContain('Sample: what to bring to a first fitting');
    expect(list).toContain('Sample article for reviewing the layout only');
    const post = await (await get('/journal/sample-measurements')).text();
    expect(post).toContain('not real advice');
    expect(post).toMatch(/name="robots" content="noindex/);
    expect(await (await get('/rss.xml')).text()).not.toContain('<item>');
  });
});
