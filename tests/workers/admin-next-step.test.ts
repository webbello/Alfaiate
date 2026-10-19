import { describe, expect, it } from 'vitest';
import { nextStep } from '../../src/modules/admin-ui/next-step';

type Ref = {
  response: 'pending' | 'accepted' | 'declined' | 'no_response';
  forwarded: boolean;
  completed: boolean;
};
const step = (
  over: Partial<{
    status: string;
    anonymised: boolean;
    spam: boolean;
    referrals: Ref[];
  }> = {},
) =>
  nextStep({
    status: 'new',
    anonymised: false,
    spam: false,
    referrals: [],
    ...over,
  } as Parameters<typeof nextStep>[0]);
const ref = (over: Partial<Ref> = {}): Ref => ({
  response: 'pending',
  forwarded: false,
  completed: false,
  ...over,
});

describe('nextStep: one sentence about what to do with this enquiry', () => {
  it('says an anonymised enquiry only keeps its figures, and a spam one is hidden', () => {
    expect(step({ anonymised: true })).toMatch(/anonymised/i);
    expect(step({ spam: true })).toMatch(/spam/i);
    expect(step({ anonymised: true, spam: true })).toMatch(/anonymised/i);
  });

  it('says a closed enquiry is closed', () => {
    for (const status of ['completed_reported', 'not_converted', 'cancelled'])
      expect(step({ status }), status).toMatch(/closed/i);
  });

  it('asks for a referral when there is none', () => {
    expect(step({ status: 'new' })).toMatch(/not yet passed to a tailor/i);
    expect(step({ status: 'contacted' })).toMatch(
      /not yet passed to a tailor/i,
    );
  });

  it('follows an active referral: forward it, wait for the answer, then record completion', () => {
    expect(
      step({ referrals: [ref({ response: 'pending', forwarded: false })] }),
    ).toMatch(/forward/i);
    expect(
      step({ referrals: [ref({ response: 'pending', forwarded: true })] }),
    ).toMatch(/waiting for the tailor/i);
    expect(
      step({ referrals: [ref({ response: 'accepted', forwarded: true })] }),
    ).toMatch(/accepted/i);
    expect(
      step({
        referrals: [
          ref({ response: 'accepted', forwarded: true, completed: true }),
        ],
      }),
    ).toMatch(/completion/i);
  });

  it('suggests another tailor after a decline or no answer, never an automatic action', () => {
    expect(step({ referrals: [ref({ response: 'declined' })] })).toMatch(
      /another tailor/i,
    );
    expect(
      step({
        referrals: [
          ref({ response: 'no_response' }),
          ref({ response: 'declined' }),
        ],
      }),
    ).toMatch(/another tailor/i);
    for (const text of [
      step(),
      step({ referrals: [ref()] }),
      step({ referrals: [ref({ response: 'declined' })] }),
    ])
      expect(text).not.toMatch(/automatic/i);
  });

  it('prefers the active referral over earlier declined ones', () => {
    expect(
      step({
        referrals: [
          ref({ response: 'declined' }),
          ref({ response: 'pending', forwarded: true }),
        ],
      }),
    ).toMatch(/waiting for the tailor/i);
  });

  it('always gives a non-empty sentence', () => {
    for (const status of [
      'new',
      'contacted',
      'referred',
      'accepted_by_tailor',
      'completed_reported',
      'not_converted',
      'cancelled',
    ])
      expect(step({ status }).length, status).toBeGreaterThan(10);
  });
});
