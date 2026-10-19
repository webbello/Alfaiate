import { describe, expect, it } from 'vitest';
import { siteWhatsapp } from '../../src/modules/config';

// Phase 7c T2 (OQ-06): the owner's WhatsApp number is optional and never shown unless it is a valid Timor-Leste number.
describe('siteWhatsapp', () => {
  it('returns E.164 for a valid number, in any common spelling', () => {
    expect(siteWhatsapp({ SITE_WHATSAPP: '+670 7712 3456' })).toBe(
      '+67077123456',
    );
    expect(siteWhatsapp({ SITE_WHATSAPP: '77123456' })).toBe('+67077123456');
  });
  it('returns null when unset, empty or not a Timor-Leste number', () => {
    for (const value of [
      undefined,
      '',
      '   ',
      'replace-me',
      '+61 400 000 000',
      '123',
    ])
      expect(siteWhatsapp({ SITE_WHATSAPP: value }), String(value)).toBeNull();
  });
});
