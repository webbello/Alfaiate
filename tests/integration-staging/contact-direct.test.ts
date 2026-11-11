import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// UX audit P8: the Contact page offers a direct WhatsApp to the business, and says when we aim to reply only when the owner has set that wording.
describe('contact page, direct contact', () => {
  it('shows WhatsApp us and the reply time the owner set', async () => {
    const html = await (await get('/contact')).text();
    expect(html).toContain('WhatsApp us');
    expect(html).toContain('https://wa.me/67077000001?text=');
    expect(html).toContain(
      'We aim to contact you within one working day. This is a goal, not a guarantee.',
    );
  });
});
