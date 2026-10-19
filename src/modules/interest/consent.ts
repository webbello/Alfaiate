import type { Lang } from '../../i18n/lang';

/** Identifies the wording a tailor agreed to when leaving their details (like the enquiry consent, PRV-03). Bump it when either language's join consent text changes: tests/workers/interest-consent.test.ts fails otherwise. */
export const JOIN_CONSENT_VERSION = 'consent-join-2026-10-v1';
export const joinConsentVersion = (lang: Lang) =>
  `${JOIN_CONSENT_VERSION}-${lang}`;
