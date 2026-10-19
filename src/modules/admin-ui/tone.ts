export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

// Colour tone of a status chip. The chip always shows the state in words too, so colour is never the only signal.
const TONES: Record<string, Tone> = {
  // enquiry
  new: 'info',
  contacted: 'info',
  referred: 'info',
  accepted_by_tailor: 'success',
  completed_reported: 'success',
  not_converted: 'neutral',
  cancelled: 'neutral',
  // referral response
  pending: 'info',
  accepted: 'success',
  declined: 'danger',
  no_response: 'warn',
  // tailor
  draft: 'warn',
  approved: 'info',
  published: 'success',
  archived: 'neutral',
  suspended: 'danger',
  // fee
  not_due: 'neutral',
  due: 'warn',
  paid: 'success',
  waived: 'neutral',
  disputed: 'danger',
};

export const toneFor = (state: string): Tone =>
  Object.hasOwn(TONES, state) ? TONES[state] : 'neutral';
