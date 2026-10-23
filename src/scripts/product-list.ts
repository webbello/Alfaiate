// The shop's product list (docs/SPEC-shop.md, S3): up to three products the visitor wants to ask about, kept in this browser's local storage
// (slug, public name and link only, no personal data). It is separate from the tailor request list. "Send enquiry" opens the request form with
// those products named; nothing is sent until the visitor fills in and sends that form.
interface Item {
  slug: string;
  name: string;
  url: string;
}
const KEY = 'alfaiate-product-list';
const MAX = 3;

function read(): Item[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    // Storage can be edited by hand: keep only our own paths and plain slugs.
    return Array.isArray(raw)
      ? (raw as Item[]).filter(
          (i) =>
            i &&
            /^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(i.slug)) &&
            typeof i.name === 'string' &&
            /^\/(?![/\\])/.test(String(i.url)),
        )
      : [];
  } catch {
    return [];
  }
}
function write(items: Item[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Storage can be blocked; the list then lasts for this page only.
  }
}

let items = read();

function render(): void {
  for (const box of document.querySelectorAll<HTMLElement>(
    '[data-product-list]',
  )) {
    const list = box.querySelector<HTMLElement>('[data-product-list-items]');
    const send = box.querySelector<HTMLAnchorElement>(
      '[data-product-list-send]',
    );
    if (!list || !send) continue;
    box.hidden = items.length === 0;
    list.replaceChildren(
      ...items.map((item) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = item.url;
        link.textContent = item.name;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.dataset.productRemove = item.slug;
        remove.textContent = box.dataset.labelRemove ?? 'Remove';
        remove.setAttribute(
          'aria-label',
          (box.dataset.labelRemoveNamed ?? 'Remove {name}').replace(
            '{name}',
            item.name,
          ),
        );
        li.appendChild(link);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(remove);
        return li;
      }),
    );
    send.href = `${box.dataset.requestHref ?? '/request'}?${items.map((i) => `product=${encodeURIComponent(i.slug)}`).join('&')}`;
  }
}

function say(message: string): void {
  for (const status of document.querySelectorAll<HTMLElement>(
    '[data-product-list-status]',
  ))
    status.textContent = message;
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (
    !(form instanceof HTMLFormElement) ||
    !form.hasAttribute('data-add-product')
  )
    return;
  event.preventDefault();
  const slug = form.dataset.slug ?? '';
  if (
    !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
    items.some((i) => i.slug === slug)
  )
    return;
  if (items.length >= MAX) {
    say(form.dataset.labelFull ?? '');
    return;
  }
  items.push({
    slug,
    name: form.dataset.name ?? '',
    url: form.dataset.url ?? '',
  });
  write(items);
  say('');
  render();
});

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>(
    '[data-product-remove]',
  );
  if (!button) return;
  items = items.filter((i) => i.slug !== button.dataset.productRemove);
  write(items);
  say('');
  render();
});

window.addEventListener('storage', (event) => {
  if (event.key !== KEY) return;
  items = read();
  render();
});

render();
