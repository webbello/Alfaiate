import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// OQ-05: when the owner sets a response window, both thank-you pages say it, as a goal and never as a guarantee.
describe('response window on the thank-you pages', () => {
  it('shows the owner wording in the right language on the request and the join thanks pages', async () => {
    const en = await (await get('/request/thanks?ref=AT-ABCD2345')).text();
    expect(en).toContain(
      'We aim to contact you within one working day. This is a goal, not a guarantee.',
    );
    expect(
      await (await get('/tet/request/thanks?ref=AT-ABCD2345')).text(),
    ).toContain('iha loron serbisu ida laran');
  });
});
