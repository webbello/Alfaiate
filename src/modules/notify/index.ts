// Owner notification (FR-ENQ-08, SEC-05). The notice holds the reference code and an admin link only, never customer data.
// The sender is chosen with NOTIFY_WEBHOOK_URL (see webhook.ts); without it nothing is sent and the owner reads the inbox (OQ-06/AD-05).
export type NewEnquiryNotice = {
  reference: string;
  adminUrl: string;
  /** What arrived; an enquiry unless said otherwise. */
  kind?:
    | 'enquiry'
    | 'interest'
    | 'tailor-ready'
    | 'tailor-accepted'
    | 'tailor-declined';
};
export type Notifier = (notice: NewEnquiryNotice) => Promise<void>;

export const notificationText = ({
  reference,
  adminUrl,
  kind = 'enquiry',
}: NewEnquiryNotice) =>
  `${{ enquiry: 'New enquiry', interest: 'New tailor interest', 'tailor-ready': 'Tailor page ready for review', 'tailor-accepted': 'Tailor accepted request', 'tailor-declined': 'Tailor declined request' }[kind]} ${reference}. Open it: ${adminUrl}`;

/** Best effort: a failing sender is logged without details and never affects the stored enquiry. */
export async function notifyNewEnquiry(
  notice: NewEnquiryNotice,
  send: Notifier = async () => {},
): Promise<void> {
  try {
    await send(notice);
  } catch {
    console.error('owner notification failed');
  }
}
