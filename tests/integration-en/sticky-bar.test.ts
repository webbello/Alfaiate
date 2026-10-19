import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get } from '../integration/helpers';

// Phase 7c T2: with the owner's number set, the bar links to WhatsApp (a plain https link, no tracking, no customer data).
describe('the quick-action bar with a WhatsApp number', () => {
  it('shows one wa.me link built from the configured number', async () => {
    expect((env as { SITE_WHATSAPP?: string }).SITE_WHATSAPP).toBe(
      '+67077000000',
    );
    const html = await (await get('/')).text();
    const bar = /<nav class="sticky-bar"[\s\S]*?<\/nav>/.exec(html)![0];
    expect(bar.match(/https:\/\/wa\.me\/67077000000\?text=/g)).toHaveLength(1);
  });
  it('is still absent on the request page', async () => {
    expect(await (await get('/request')).text()).not.toContain('sticky-bar');
  });
});
