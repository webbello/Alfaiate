export type NextStepInput = {
  status: string;
  anonymised: boolean;
  spam: boolean;
  referrals: {
    response: 'pending' | 'accepted' | 'declined' | 'no_response';
    forwarded: boolean;
    completed: boolean;
  }[];
};

const CLOSED = ['completed_reported', 'not_converted', 'cancelled'];

/** One plain sentence about what to do next, worked out from facts already on the page. It only suggests: nothing is done for the person. */
export function nextStep(e: NextStepInput): string {
  if (e.anonymised)
    return 'Anonymised: the personal data is gone and only the figures are kept.';
  if (e.spam)
    return 'Marked as spam: it is hidden from the inbox unless you include spam.';
  if (CLOSED.includes(e.status))
    return 'Closed. Nothing more to do unless something changes.';
  const active = e.referrals.find(
    (r) => r.response === 'pending' || r.response === 'accepted',
  );
  if (active) {
    if (active.response === 'pending')
      return active.forwarded
        ? 'Waiting for the tailor to answer. Record the answer in the referral below.'
        : 'Forward the details to the tailor (copy them from the box below), then record the date in the referral.';
    return active.completed
      ? 'Completion was reported. Set the status to "Completed, as reported" when you agree.'
      : 'The tailor accepted. Record the completion in the referral when they report it.';
  }
  if (e.referrals.length > 0)
    return 'The tailor declined or did not answer. Create a referral for another tailor, or close the enquiry.';
  return 'Not yet passed to a tailor. Contact the customer if you need to, then create a referral below.';
}
