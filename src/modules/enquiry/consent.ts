import type { Lang } from '../../i18n/lang';

/**
 * Identifies the consent wording a customer agreed to (PRV-03). Bump the number whenever either language's consent text changes:
 * tests/workers/enquiry-consent.test.ts fails if the text changes without it.
 */
export const CONSENT_VERSION = 'consent-2026-10-v1';
export const consentVersion = (lang: Lang) => `${CONSENT_VERSION}-${lang}`;
