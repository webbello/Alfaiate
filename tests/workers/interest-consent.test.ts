import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/public/en';
import { tet } from '../../src/i18n/public/tet';
import {
  JOIN_CONSENT_VERSION,
  joinConsentVersion,
} from '../../src/modules/interest/consent';

const sha = async (text: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)),
    ),
  ]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 12);

// An interest record stores which consent wording the tailor agreed to. If this fails you changed the wording:
// bump JOIN_CONSENT_VERSION in src/modules/interest/consent.ts, then update the fingerprints here.
describe('join consent text and its version', () => {
  it('has fingerprints that change only together with the version', async () => {
    expect(JOIN_CONSENT_VERSION).toBe('consent-join-2026-10-v1');
    expect(await sha(en.join.consent)).toBe('8a18bd9574d6');
    expect(await sha(tet.join.consent)).toBe('5d808344f5d6');
  });
  it('is recorded per language', () => {
    expect(joinConsentVersion('en')).toBe('consent-join-2026-10-v1-en');
    expect(joinConsentVersion('tet')).toBe('consent-join-2026-10-v1-tet');
  });
});
