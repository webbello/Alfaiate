import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import {
  PROBLEM_CODES,
  SUCCESS_CODES,
  messageKind,
} from '../../src/modules/admin-ui/messages';
import { toneFor } from '../../src/modules/admin-ui/tone';

// Phase 7b: every `?msg=` code is shown as a banner that says "Done" or "Problem" in words, so each code must be classified on purpose.
const dictionaries = [
  en.adminMessages,
  en.enquiry.messages,
  en.referral.messages,
] as Record<string, string>[];
const allKeys = new Set(dictionaries.flatMap((d) => Object.keys(d)));

describe('message classification', () => {
  it('classifies every message code in every admin dictionary, once', () => {
    const classified = new Set([...SUCCESS_CODES, ...PROBLEM_CODES]);
    expect(
      [...allKeys].filter((k) => !classified.has(k)),
      'unclassified',
    ).toEqual([]);
    expect(
      [...classified].filter((k) => !allKeys.has(k)),
      'stale',
    ).toEqual([]);
    expect(SUCCESS_CODES.filter((k) => PROBLEM_CODES.includes(k))).toEqual([]);
  });

  it('calls the obvious successes and problems what they are', () => {
    for (const code of [
      'saved',
      'created',
      'published',
      'password_changed',
      'status_saved',
      'note_added',
      'referral_saved',
      'fee_saved',
      'anonymised',
    ])
      expect(messageKind(code), code).toBe('success');
    for (const code of [
      'invalid',
      'not_found',
      'blocked',
      'wrong_password',
      'limited',
      'forbidden',
      'has_fee',
      'no_agreed_terms',
      'locked_anonymised',
      'anonymise_wrong_reference',
      'conflict',
      'slug_taken',
    ])
      expect(messageKind(code), code).toBe('problem');
  });

  it('treats anything unknown as a problem, never as success', () => {
    for (const code of ['', 'nonsense', '__proto__', 'constructor', 'toString'])
      expect(messageKind(code), code).toBe('problem');
  });
});

describe('toneFor', () => {
  it('gives each state a tone, and the unknown a neutral one', () => {
    expect(toneFor('new')).toBe('info');
    expect(toneFor('completed_reported')).toBe('success');
    expect(toneFor('cancelled')).toBe('neutral');
    expect(toneFor('not_converted')).toBe('neutral');
    expect(toneFor('declined')).toBe('danger');
    expect(toneFor('no_response')).toBe('warn');
    expect(toneFor('draft')).toBe('warn');
    expect(toneFor('published')).toBe('success');
    expect(toneFor('something-else')).toBe('neutral');
  });
});
