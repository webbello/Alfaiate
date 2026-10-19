// Owner notification (FR-ENQ-08, SEC-05). The notice holds the reference code and an admin link only, never customer data.
// No real sender is connected yet (OQ-06/AD-05): the default does nothing, and a sender is passed in when one is chosen.
export type NewEnquiryNotice = { reference: string; adminUrl: string };
export type Notifier = (notice: NewEnquiryNotice) => Promise<void>;

export const notificationText = ({ reference, adminUrl }: NewEnquiryNotice) =>
  `New enquiry ${reference}. Open it: ${adminUrl}`;

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
