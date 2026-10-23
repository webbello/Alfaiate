import { publishBlockers, type PublishBlocker } from '../tailors/publish';

export type ChecklistItem = {
  key: PublishBlocker;
  done: boolean;
  /** The requirement in plain words. */
  label: string;
  /** What exactly to do, and where. */
  detail: string;
  /** The control on the tailor page that fixes it. */
  fixHref: string;
  /** The link text for that control. */
  fixLabel: string;
  /** One or two words for the tailors list. */
  short: string;
};

const ITEMS: Omit<ChecklistItem, 'done'>[] = [
  {
    key: 'not_approved',
    label: 'Approved by a manager or the owner',
    detail:
      'Only an approved tailor can go public. Use Approve in "Approval and publishing".',
    fixHref: '#publish',
    fixLabel: 'Go to approval',
    short: 'approval',
  },
  {
    key: 'no_permission_recorded',
    label: "The tailor's permission to be listed is recorded",
    detail:
      'Say how and when they agreed, then press Record permission in "Approval and publishing".',
    fixHref: '#permission-note',
    fixLabel: 'Record permission',
    short: 'permission',
  },
  {
    key: 'no_contact_number',
    label: 'A WhatsApp or phone number on the profile',
    detail:
      'Add the number in the "Profile" form above. The page cannot be published without one.',
    fixHref: '#whatsapp',
    fixLabel: 'Add the number',
    short: 'contact number',
  },
  {
    key: 'no_contact_consent',
    label: 'The tailor agrees their number may be shown',
    detail:
      'The number is saved. Tick "The tailor agreed…" under Record permission, then press Record permission again.',
    fixHref: '#contact-consent',
    fixLabel: 'Tick the consent box',
    short: 'contact consent',
  },
];

type Input = Parameters<typeof publishBlockers>[0];

/** The publish requirements as a checklist. It is built from `publishBlockers`, the server's own rule, so the page can never disagree with what the server will accept. */
export function publishChecklist(t: Input): ChecklistItem[] {
  const missing = new Set(publishBlockers(t));
  const hasNumber = Boolean(t.whatsapp_e164 || t.phone_e164);
  return ITEMS.map((item) => ({
    ...item,
    done: !missing.has(item.key),
    // Only say the number is saved when one is actually on the profile.
    detail:
      item.key === 'no_contact_consent' && !hasNumber
        ? 'Tick "The tailor agreed…" under Record permission and press Record permission again. Add a number first if there is none.'
        : item.detail,
  }));
}

/** The requirements still missing, in the same order as the checklist. */
export function missingItems(t: Input): ChecklistItem[] {
  return publishChecklist(t).filter((i) => !i.done);
}

/** "Missing: approval, permission" or "Ready to publish". */
export function missingSummary(t: Input): string {
  const missing = publishChecklist(t)
    .filter((i) => !i.done)
    .map((i) => i.short);
  return missing.length === 0
    ? 'Ready to publish'
    : `Missing: ${missing.join(', ')}`;
}
