/**
 * The request list (Alfaiate TL's use of the theme's cart).
 *
 * Nothing is bought here. The list holds up to three tailors the visitor would like to ask; it lives in this browser's local storage
 * (tailor slugs and public names only, no personal data), the panel lists them with a Remove link, and "Send request" opens the
 * request form with those tailors chosen. Nothing is sent until the visitor fills in and sends that form.
 */

interface Line {
  id: string;
  name: string;
  url: string;
  image: string;
}

const STORAGE_KEY = 'alfaiate-request-list';

function read(): Line[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    // Storage can be edited by hand: keep only our own paths so a link or picture can never point elsewhere.
    return Array.isArray(raw)
      ? (raw as Line[]).filter(
          (l) =>
            l &&
            typeof l.id === 'string' &&
            typeof l.name === 'string' &&
            /^\/(?![/\\])/.test(String(l.url)) &&
            (l.image === '' || String(l.image).startsWith('/media/')),
        )
      : [];
  } catch {
    return [];
  }
}

function write(lines: Line[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    // Storage can be blocked; the list then lasts for this page only.
  }
}

let lines: Line[] = read();

const labelOf = (cart: HTMLElement, key: string, name = '') =>
  (cart.dataset[key] ?? '').replace('{name}', name);

/** Draws the list into every panel, the count beside every button and the link that opens the request form. */
function render(): void {
  for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-count]')) {
    badge.textContent = String(lines.length);
  }

  for (const cart of document.querySelectorAll<HTMLElement>('[data-cart]')) {
    const list = cart.querySelector<HTMLElement>('[data-cart-items]');
    const filled = cart.querySelector<HTMLElement>('[data-cart-lines]');
    const empty = cart.querySelector<HTMLElement>('[data-cart-empty]');
    const send = cart.querySelector<HTMLAnchorElement>('[data-cart-send]');
    if (!list || !filled || !empty) continue;

    filled.hidden = lines.length === 0;
    empty.hidden = lines.length > 0;
    list.replaceChildren(...lines.map((line) => row(line, cart)));
    if (send) {
      const base = cart.dataset.requestHref ?? '/request';
      send.href = `${base}?${lines.map((l) => `tailor=${encodeURIComponent(l.id)}`).join('&')}`;
    }
  }
}

function row(line: Line, cart: HTMLElement): HTMLElement {
  const item = document.createElement('div');
  item.className = 'header-cart-item';
  item.dataset.cartLine = line.id;

  const link = document.createElement('a');
  link.href = line.url;
  if (line.image) {
    const thumb = document.createElement('img');
    thumb.className = 'header-cart-thumb';
    thumb.src = line.image;
    thumb.alt = '';
    thumb.loading = 'lazy';
    link.append(thumb);
  } else {
    const badge = document.createElement('span');
    badge.className = 'header-cart-thumb header-cart-thumb--initials';
    badge.textContent = line.name.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') ?? '';
    badge.setAttribute('aria-hidden', 'true');
    link.append(badge);
  }

  const details = document.createElement('div');
  details.className = 'header-cart-details';
  const name = document.createElement('a');
  name.className = 'header-cart-name';
  name.href = line.url;
  name.textContent = line.name;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'header-cart-remove';
  remove.dataset.cartRemove = line.id;
  remove.textContent = labelOf(cart, 'labelRemove');
  remove.setAttribute('aria-label', labelOf(cart, 'labelRemoveNamed', line.name));
  details.append(name, remove);

  item.append(link, details);
  return item;
}

function say(message: string): void {
  for (const status of document.querySelectorAll<HTMLElement>('[data-cart-status]')) status.textContent = message;
}

function add(line: Line, max: number, full: string): boolean {
  if (lines.some((entry) => entry.id === line.id)) return true;
  if (lines.length >= max) {
    say(full);
    return false;
  }
  lines.push(line);
  write(lines);
  say('');
  render();
  return true;
}

export function initCart(): void {
  const carts = document.querySelectorAll<HTMLElement>('[data-cart]');
  if (!carts.length) return;

  lines = read();
  render();

  /** A close removes the panel after its fade; an open in the meantime must cancel that. */
  const closing = new WeakMap<HTMLElement, number>();

  const setOpen = (cart: HTMLElement, open: boolean) => {
    const toggle = cart.querySelector<HTMLButtonElement>('[data-cart-toggle]');
    const panel = cart.querySelector<HTMLElement>('[data-cart-panel]');
    if (!toggle || !panel) return;

    toggle.setAttribute('aria-expanded', String(open));
    window.clearTimeout(closing.get(panel));
    if (open) {
      document.querySelector('[data-header]')?.removeAttribute('data-hidden');
      panel.toggleAttribute('data-open', true);
      requestAnimationFrame(() => panel.toggleAttribute('data-visible', true));
      panel.querySelector<HTMLElement>('[data-cart-close]')?.focus();
    } else {
      panel.removeAttribute('data-visible');
      closing.set(panel, window.setTimeout(() => panel.removeAttribute('data-open'), 250));
    }
    document.body.style.overflow = open ? 'hidden' : '';
  };

  const closeAll = () => carts.forEach((cart) => setOpen(cart, false));

  for (const cart of carts) {
    const toggle = cart.querySelector<HTMLButtonElement>('[data-cart-toggle]');
    const panel = cart.querySelector<HTMLElement>('[data-cart-panel]');
    if (!toggle || !panel) continue;

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      closeAll();
      if (!open) setOpen(cart, true);
    });
    cart.querySelector('[data-cart-close]')?.addEventListener('click', () => setOpen(cart, false));
    panel.addEventListener('click', (event) => {
      if (event.target === panel) setOpen(cart, false);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });

  // "Add to request list", on a card or a profile.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-add-to-cart')) return;
    event.preventDefault();

    const id = String(new FormData(form).get('tailor') ?? '');
    if (!id) return;
    const cart = [...carts].find((c) => c.getClientRects().length > 0) ?? carts[0]!;
    const max = Number(cart.dataset.max) || 3;
    add({ id, name: form.dataset.name ?? '', url: form.dataset.url ?? '', image: form.dataset.image ?? '' }, max, labelOf(cart, 'labelFull'));

    const toggle = cart.querySelector<HTMLButtonElement>('[data-cart-toggle]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  });

  document.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-cart-remove]');
    if (!button) return;
    lines = lines.filter((entry) => entry.id !== button.dataset.cartRemove);
    write(lines);
    say('');
    render();
  });

  // Another tab changed the list.
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    lines = read();
    render();
  });
}
