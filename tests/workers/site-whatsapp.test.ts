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

import { responseWindow } from '../../src/modules/config';
describe('responseWindow (OQ-05)', () => {
  it('returns the owner wording per language, and nothing when unset, blank or too long', () => {
    expect(
      responseWindow({ RESPONSE_WINDOW_EN: ' within one working day ' }, 'en'),
    ).toBe('within one working day');
    expect(
      responseWindow({ RESPONSE_WINDOW_TET: 'iha loron ida' }, 'tet'),
    ).toBe('iha loron ida');
    expect(responseWindow({ RESPONSE_WINDOW_EN: 'x' }, 'tet')).toBeNull();
    for (const v of [undefined, '', '   ', 'y'.repeat(81)])
      expect(responseWindow({ RESPONSE_WINDOW_EN: v }, 'en')).toBeNull();
  });
});
