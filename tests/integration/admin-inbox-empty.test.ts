import { describe, expect, it } from 'vitest';
import { get, signIn } from './helpers';

// Phase 7b T4: a brand new inbox explains itself. This file starts with an empty database.
describe('an empty inbox', () => {
  it('says what will appear and points at the request form', async () => {
    const html = await (
      await get('/admin/enquiries', await signIn('manager'))
    ).text();
    expect(html).toContain('class="empty"');
    expect(html).toContain('No enquiries yet');
    expect(html).toContain('href="/request"');
    expect(html).not.toContain('<table');
  });
});
