import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// BR-11: with SHOW_TESTIMONIAL_PLACEHOLDERS on (development), the section appears in the theme layout but is plainly labelled as a sample,
// shows no stars, ratings or customer photos, and never claims to be real. The sample partner logos are labelled too.
describe('sample testimonials (development only)', () => {
  it('are labelled as samples, with initials instead of photos and no ratings', async () => {
    const html = await (await get('/')).text();
    const section =
      /<section class="review-section[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    expect(section).toContain('Stories of Craftsmanship and Style.');
    expect(section).toContain('not real customers');
    // the theme lays the same three stories out four ways (wide, medium, laptop, phone carousel)
    expect(section.match(/class="review-card"/g)).toHaveLength(12);
    expect(section).not.toContain('<img');
    expect(section).not.toMatch(/★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i);
    expect(section.match(/Sample text:/g)!.length).toBe(12);
    expect(html).toContain(
      'Sample partner logos (layout only, not real partners)',
    );
    expect(await (await get('/tet/')).text()).toContain('la’ós kliente loloos');
  });
});
