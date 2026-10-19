import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/public/en';
import { tet } from '../../src/i18n/public/tet';
import {
  CONSENT_VERSION,
  consentVersion,
} from '../../src/modules/enquiry/consent';

const sha = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);

// PRV-03: an enquiry records which consent wording was agreed to. If this test fails you changed the wording:
// bump CONSENT_VERSION in src/modules/enquiry/consent.ts, then update the fingerprints here.
describe('consent text and its version', () => {
  it('has fingerprints that change only together with the version', async () => {
    expect(CONSENT_VERSION).toBe('consent-2026-10-v1');
    expect(await sha(en.request.consent)).toBe('b06d3570c34c');
    expect(await sha(tet.request.consent)).toBe('f1efe79a8f85');
  });

  it('is recorded per language', () => {
    expect(consentVersion('en')).toBe('consent-2026-10-v1-en');
    expect(consentVersion('tet')).toBe('consent-2026-10-v1-tet');
  });

  it('states that details are shared with a partner tailor', () => {
    expect(en.request.consent).toMatch(
      /share my name, number and request details with a suitable partner tailor/,
    );
  });
});
