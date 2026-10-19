import { describe, expect, it, vi } from 'vitest';
import { notificationText, notifyNewEnquiry } from '../../src/modules/notify';

// FR-ENQ-08, SEC-05: the notice carries the reference code and an admin link, never customer data.
describe('owner notification', () => {
  it('says only the reference and the admin link', () => {
    const text = notificationText({
      reference: 'AT-ABCD2345',
      adminUrl: 'https://example.test/admin/enquiries/7',
    });
    expect(text).toContain('AT-ABCD2345');
    expect(text).toContain('https://example.test/admin/enquiries/7');
    expect(text).toBe(
      'New enquiry AT-ABCD2345. Open it: https://example.test/admin/enquiries/7',
    );
  });

  it('hands the notice to the adapter', async () => {
    const send = vi.fn(async () => {});
    await notifyNewEnquiry(
      { reference: 'AT-ABCD2345', adminUrl: 'https://example.test/a' },
      send,
    );
    expect(send).toHaveBeenCalledWith({
      reference: 'AT-ABCD2345',
      adminUrl: 'https://example.test/a',
    });
  });

  it('does nothing by default and swallows adapter failures, logging a constant', async () => {
    await expect(
      notifyNewEnquiry({
        reference: 'AT-ABCD2345',
        adminUrl: 'https://example.test/a',
      }),
    ).resolves.toBeUndefined();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      notifyNewEnquiry(
        { reference: 'AT-ABCD2345', adminUrl: 'https://example.test/a' },
        async () => {
          throw new Error('Fake Customer +67077123456 smtp down');
        },
      ),
    ).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /Fake Customer|\+670|AT-/,
    );
    log.mockRestore();
  });
});
