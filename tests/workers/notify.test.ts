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

describe('webhook notifier (OQ-06)', () => {
  const notice = {
    reference: 'AT-ABCD2345',
    adminUrl: 'https://example.test/admin/enquiries?q=AT-ABCD2345',
  };
  it('is only created for a plain https address', async () => {
    const { webhookNotifier } =
      await import('../../src/modules/notify/webhook');
    for (const bad of [
      undefined,
      '',
      'not a url',
      'http://ntfy.sh/topic',
      'ftp://x.example/',
      'https://user:pw@ntfy.sh/topic',
    ])
      expect(webhookNotifier(bad), String(bad)).toBeUndefined();
    expect(webhookNotifier('https://ntfy.sh/alfaiate-test')).toBeTypeOf(
      'function',
    );
  });
  it('posts the reference and the admin link only, as plain text, and fails loudly on a refusal so the caller can log a constant', async () => {
    const { webhookNotifier } =
      await import('../../src/modules/notify/webhook');
    const seen: { url: string; body: string; method: string }[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      seen.push({
        url: String(input),
        body: String(init?.body),
        method: String(init?.method),
      });
      return new Response('ok', { status: seen.length === 1 ? 200 : 500 });
    }) as typeof fetch;
    try {
      const send = webhookNotifier('https://ntfy.sh/alfaiate-test')!;
      await send(notice);
      expect(seen[0]).toEqual({
        url: 'https://ntfy.sh/alfaiate-test',
        method: 'POST',
        body: `New enquiry AT-ABCD2345. Open it: ${notice.adminUrl}`,
      });
      await expect(send(notice)).rejects.toThrow();
      await send({
        reference: 'JN-ABCDEFGH',
        adminUrl: 'https://example.test/admin/interest',
        kind: 'interest',
      }).catch(() => {});
      expect(seen[2].body).toBe(
        'New tailor interest JN-ABCDEFGH. Open it: https://example.test/admin/interest',
      );
    } finally {
      globalThis.fetch = real;
    }
  });
});
