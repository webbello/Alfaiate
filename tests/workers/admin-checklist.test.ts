import { describe, expect, it } from 'vitest';
import {
  publishChecklist,
  missingSummary,
} from '../../src/modules/admin-ui/checklist';
import { publishBlockers } from '../../src/modules/tailors/publish';

// The publish checklist must say exactly what the server's own rule says (BR-05, BR-06): it is a view of publishBlockers, not a second rule.
const tailor = (over: Record<string, unknown> = {}) =>
  ({
    status: 'approved',
    permission_recorded: 1,
    contact_publish_consent: 1,
    whatsapp_e164: '+67077123456',
    phone_e164: null,
    ...over,
  }) as Parameters<typeof publishBlockers>[0];

describe('publishChecklist', () => {
  it('has every requirement done for a ready tailor', () => {
    const list = publishChecklist(tailor());
    expect(list).toHaveLength(4);
    expect(list.every((i) => i.done)).toBe(true);
    expect(publishBlockers(tailor())).toEqual([]);
  });

  it('marks as missing exactly the blockers the server reports, for every combination', () => {
    for (const status of ['draft', 'approved'])
      for (const permission of [0, 1])
        for (const consent of [0, 1])
          for (const number of [null, '+67077123456'])
            for (const phone of [null, '+67033123456']) {
              const t = tailor({
                status,
                permission_recorded: permission,
                contact_publish_consent: consent,
                whatsapp_e164: number,
                phone_e164: phone,
              });
              const missing = publishChecklist(t)
                .filter((i) => !i.done)
                .map((i) => i.key);
              expect(missing, JSON.stringify(t)).toEqual(publishBlockers(t));
            }
  });

  it('says what is needed in words and links to the place that fixes it', () => {
    for (const item of publishChecklist(
      tailor({ status: 'draft', permission_recorded: 0, whatsapp_e164: null }),
    )) {
      expect(item.label.length).toBeGreaterThan(10);
      expect(item.fixHref).toMatch(/^#[a-z-]+$/);
    }
  });

  it('keeps the same four requirements in the same order every time', () => {
    expect(publishChecklist(tailor()).map((i) => i.key)).toEqual([
      'not_approved',
      'no_permission_recorded',
      'no_contact_number',
      'no_contact_consent',
    ]);
  });
});

describe('missingSummary (for the tailors list)', () => {
  it('lists the missing things in a few words, or says ready', () => {
    expect(missingSummary(tailor())).toBe('Ready to publish');
    expect(missingSummary(tailor({ status: 'draft' }))).toBe(
      'Missing: approval',
    );
    expect(
      missingSummary(
        tailor({
          status: 'draft',
          permission_recorded: 0,
          whatsapp_e164: null,
        }),
      ),
    ).toBe('Missing: approval, permission, contact number');
    expect(missingSummary(tailor({ contact_publish_consent: 0 }))).toBe(
      'Missing: contact consent',
    );
  });

  it('points each missing item at its own control', () => {
    const hrefs = Object.fromEntries(
      publishChecklist(
        tailor({
          status: 'draft',
          permission_recorded: 0,
          contact_publish_consent: 0,
        }),
      ).map((i) => [i.key, i.fixHref]),
    );
    expect(hrefs).toEqual({
      not_approved: '#publish',
      no_permission_recorded: '#permission-note',
      no_contact_number: '#whatsapp',
      no_contact_consent: '#contact-consent',
    });
  });

  it('only says the number is saved when one is on the profile', () => {
    const detail = (t: Parameters<typeof publishChecklist>[0]) =>
      publishChecklist(t).find((i) => i.key === 'no_contact_consent')?.detail;
    expect(detail(tailor({ contact_publish_consent: 0 }))).toContain(
      'The number is saved',
    );
    const none = detail(
      tailor({
        whatsapp_e164: null,
        phone_e164: null,
        contact_publish_consent: 0,
      }),
    );
    expect(none).not.toContain('The number is saved');
    expect(none).toContain('Add a number first');
  });
});
