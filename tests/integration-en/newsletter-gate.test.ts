import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// OQ-06/OQ-08: with NEWSLETTER_ENABLED off (the default) there is no sign-up form and no newsletter page.
describe('newsletter is off by default', () => {
  it('has no footer form and answers 404 for its pages', async () => {
    expect(await (await get('/')).text()).not.toContain('action="/newsletter"');
    for (const path of ['/newsletter', '/newsletter/thanks'])
      expect((await get(path)).status, path).toBe(404);
  });
});
