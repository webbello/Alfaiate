// With one destination, open WhatsApp after a short moment (the page stays readable, and the button is always there if the browser blocks it).
const link = document.querySelector<HTMLAnchorElement>('[data-order-open]');
if (link) {
  const status = document.querySelector<HTMLElement>('[data-order-opening]');
  if (status) status.hidden = false;
  window.setTimeout(() => {
    window.location.href = link.href;
  }, 1500);
}
