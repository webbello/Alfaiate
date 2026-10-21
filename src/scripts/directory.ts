// Directory page, progressive enhancement. The filters apply only with the button or Enter: reloading on every keyboard change would break WCAG 3.2.2.
const form = document.querySelector<HTMLFormElement>('form.filters');
if (form) {
  // Typing narrows the cards on the page by tailor name straight away; Enter still searches on the server.
  const search = form.querySelector<HTMLInputElement>('#search');
  const items = [...document.querySelectorAll<HTMLElement>('.grid > li')];
  const count = document.querySelector<HTMLElement>('.count[data-template]');
  const none = document.querySelector<HTMLElement>('[data-no-match]');
  if (search && items.length > 0 && count?.dataset.template) {
    const names = items.map(
      (li) =>
        li.querySelector('.card__title')?.textContent?.toLowerCase() ?? '',
    );
    const apply = () => {
      const needle = search.value.trim().toLowerCase();
      let shown = 0;
      items.forEach((li, i) => {
        const match = names[i].includes(needle);
        li.hidden = !match;
        if (match) shown++;
      });
      count.textContent = count.dataset.template!.replace(
        '{count}',
        String(shown),
      );
      if (none) none.hidden = shown > 0;
    };
    search.addEventListener('input', apply);
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) {
        search.value = '';
        apply();
      }
    });
    apply();
  }
}
