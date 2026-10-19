import { publishBlockers, type PublishBlocker } from '../tailors/publish';

export type ChecklistItem = {
  key: PublishBlocker;
  done: boolean;
  /** The requirement in plain words. */
  label: string;
  /** Where on the tailor page the missing piece is fixed. */
  fixHref: string;
  /** One or two words for the tailors list. */
  short: string;
};

const ITEMS: Omit<ChecklistItem, 'done'>[] = [
  {
    key: 'not_approved',
    label: 'Approved by a manager or the owner',
    fixHref: '#publish',
    short: 'approval',
  },
  {
    key: 'no_permission_recorded',
    label: "The tailor's permission to be listed is recorded",
    fixHref: '#publish',
    short: 'permission',
  },
  {
    key: 'no_consented_contact',
    label: 'A WhatsApp or phone number the tailor agrees to show',
    fixHref: '#profile',
    short: 'contact',
  },
];

type Input = Parameters<typeof publishBlockers>[0];

/** The publish requirements as a checklist. It is built from `publishBlockers`, the server's own rule, so the page can never disagree with what the server will accept. */
export function publishChecklist(t: Input): ChecklistItem[] {
  const missing = new Set(publishBlockers(t));
  return ITEMS.map((item) => ({ ...item, done: !missing.has(item.key) }));
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
