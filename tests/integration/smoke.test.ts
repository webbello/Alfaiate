import { describe, expect, it } from 'vitest';
import { worker } from './worker';

describe('built worker', () => {
  it('serves the home page with security headers', async () => {
    const response = await worker.fetch(new Request('https://example.test/'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-security-policy')).toContain(
      "default-src 'self'",
    );
    expect(response.headers.get('cache-control')).toBeNull();
    const html = await response.text();
    expect(html).toContain('<h1>Alfaiate TL</h1>');
    expect(html).not.toContain('<style');
  });
});
