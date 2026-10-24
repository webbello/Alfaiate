// Optional help on the tailor portal's step pages. Every page works without it: the examples are also written in the hint text,
// and the server does the checking. Text goes in with textContent/value only, never as HTML.

const heading = document.querySelector<HTMLElement>('[data-step-heading]');
if (new URLSearchParams(location.search).get('saved') === '1')
  heading?.focus({ preventScroll: false });

for (const area of document.querySelectorAll<HTMLTextAreaElement>(
  'textarea[data-counter]',
)) {
  const out = area.parentElement?.querySelector<HTMLElement>(
    '[data-counter-text]',
  );
  const update = () => {
    if (out) out.textContent = `${area.value.length} of ${area.maxLength}`;
  };
  area.addEventListener('input', update);
  update();
}

for (const box of document.querySelectorAll<HTMLElement>('[data-suggest]')) {
  const field = box.parentElement?.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >('input, textarea');
  if (!field) continue;
  box.hidden = false;
  const replace = box.hasAttribute('data-replace');
  for (const button of box.querySelectorAll<HTMLButtonElement>(
    'button[data-add]',
  )) {
    button.addEventListener('click', () => {
      const text = button.dataset.add ?? '';
      const joined =
        replace || !field.value.trim() ? text : `${field.value.trim()} ${text}`;
      field.value = joined.slice(0, field.maxLength);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
    });
  }
}
