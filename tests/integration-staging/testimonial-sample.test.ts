import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// BR-11: with SHOW_TESTIMONIAL_PLACEHOLDERS on (development), the section appears in the reference layout but is plainly labelled as a sample,
// shows no stars, ratings or customer photos, and never claims to be real.
describe('sample testimonials (development only)', () => {
  it('are labelled as samples, with initials instead of photos and no ratings', async () => {
    const html = await (await get('/')).text();
    const section =
      /<section class="section stories"[\s\S]*?<\/section>/.exec(html)?.[0] ??
      '';
    expect(section).toContain('Stories of Craftsmanship and Style.');
    expect(section).toContain('not real customers');
    expect(section.match(/<figure class="testimonial/g)).toHaveLength(3);
    expect(section).not.toContain('<img');
    expect(section).not.toMatch(/★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i);
    expect(section.match(/Sample text:/g)!.length).toBe(3);
    expect(await (await get('/tet/')).text()).toContain('la’ós kliente loloos');
  });
});
