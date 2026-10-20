import { notificationText, type Notifier } from './index';

/**
 * A sender that POSTs the notice text to one https address the owner configures: ntfy.sh (phone push, no account), a Slack or Discord
 * incoming webhook, or any service that accepts a plain-text body. The body is the reference code and an admin link only (SEC-05).
 * Anything that is not an https URL means "no sender". A slow or failing service gives up after 5 seconds and never blocks the request.
 */
export function webhookNotifier(url: string | undefined): Notifier | undefined {
  let target: URL;
  try {
    target = new URL(url ?? '');
  } catch {
    return undefined;
  }
  if (target.protocol !== 'https:' || target.username || target.password)
    return undefined;
  return async (notice) => {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        Title: 'Alfaiate TL',
        Click: notice.adminUrl,
      },
      body: notificationText(notice),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('notification service refused');
  };
}
