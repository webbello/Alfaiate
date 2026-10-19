// Counts taps on the WhatsApp and Call buttons (ANA-02). A fire-and-forget beacon: it never delays or blocks the link,
// and if it fails nothing happens. No identifiers are sent, only which tailor and which button.
for (const link of document.querySelectorAll<HTMLAnchorElement>(
  'a[data-contact-channel][data-tailor]',
)) {
  link.addEventListener('click', () => {
    try {
      const body = JSON.stringify({
        slug: link.dataset.tailor,
        channel: link.dataset.contactChannel,
      });
      navigator.sendBeacon(
        '/api/contact-click',
        new Blob([body], { type: 'application/json' }),
      );
    } catch {
      // ignore: the link still works
    }
  });
}
