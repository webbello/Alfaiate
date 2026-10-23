/**
 * The cart (the Handspark cart, kept honest for Alfaiate TL).
 *
 * One panel holds two kinds of line, both kept in this browser's local storage (no personal data):
 * shop items (name, price, quantity, link, small photo, like the theme's cart) and tailors to ask (slug, name, link, small photo).
 * The panel shows the quantity box, a remove button, the count and the subtotal of the shop items, as the theme does. Nothing is bought here:
 * Shop items are sent as an order: the order form posts only slugs and quantities, the server reads the prices, and the order page opens WhatsApp with the message ready.
 * Tailors are asked through the request form (consent, spam checks). The seller agrees price and delivery with the visitor directly (no payment, PRD 7.3).
 */

interface Item {
  id: string;
  name: string;
  url: string;
  image: string;
}
interface Product extends Item {
  price: number;
  quantity: number;
}

const TAILORS_KEY = 'alfaiate-request-list';
const PRODUCTS_KEY = 'alfaiate-cart';
const MAX_TAILORS = 3;
const MAX_PRODUCTS = 10;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const ownPath = (url: unknown) => /^\/(?![/\\])/.test(String(url));
const ownImage = (image: unknown) => image === '' || String(image).startsWith('/media/');

function load<T>(key: string, keep: (i: T) => boolean): T[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
    // Storage can be edited by hand: keep only plain slugs and our own paths.
    return Array.isArray(raw) ? (raw as T[]).filter((i) => i && keep(i)) : [];
  } catch {
    return [];
  }
}
const readTailors = () =>
  load<Item>(TAILORS_KEY, (l) => typeof l.id === 'string' && typeof l.name === 'string' && ownPath(l.url) && ownImage(l.image));
const readProducts = () =>
  load<Product>(PRODUCTS_KEY, (l) => SLUG.test(String(l.id)) && typeof l.name === 'string' && ownPath(l.url) && ownImage(l.image) && Number.isFinite(l.price) && l.price >= 0 && Number.isInteger(l.quantity) && l.quantity >= 1 && l.quantity <= 99);

function write(key: string, value: unknown[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be blocked; the cart then lasts for this page only.
  }
}

let tailors: Item[] = readTailors();
let products: Product[] = readProducts();

const label = (cart: HTMLElement, key: string, name = '') => (cart.dataset[key] ?? '').replace('{name}', name);
const money = (amount: number) => `$ ${amount.toFixed(2)} USD`;

function thumb(line: Item): HTMLElement {
  if (line.image) {
    const img = document.createElement('img');
    img.className = 'header-cart-thumb';
    img.src = line.image;
    img.alt = '';
    img.loading = 'lazy';
    return img;
  }
  const badge = document.createElement('span');
  badge.className = 'header-cart-thumb header-cart-thumb--initials';
  badge.textContent = line.name.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') ?? '';
  badge.setAttribute('aria-hidden', 'true');
  return badge;
}

function row(line: Item, cart: HTMLElement, kind: 'tailor' | 'product'): HTMLElement {
  const item = document.createElement('div');
  item.className = 'header-cart-item';
  item.dataset.cartLine = `${kind}:${line.id}`;

  const link = document.createElement('a');
  link.href = line.url;
  link.appendChild(thumb(line));

  const details = document.createElement('div');
  details.className = 'header-cart-details';
  const name = document.createElement('a');
  name.className = 'header-cart-name';
  name.href = line.url;
  name.textContent = line.name;
  details.appendChild(name);
  const product = kind === 'product' ? (line as Product) : null;
  if (product) {
    const price = document.createElement('div');
    price.className = 'header-cart-price';
    price.textContent = money(product.price);
    details.appendChild(price);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'header-cart-remove';
  remove.dataset.cartRemove = `${kind}:${line.id}`;
  remove.textContent = label(cart, 'labelRemove');
  remove.setAttribute('aria-label', label(cart, 'labelRemoveNamed', line.name));
  details.appendChild(remove);

  item.appendChild(link);
  item.appendChild(details);
  if (product) {
    const quantity = document.createElement('input');
    quantity.className = 'header-cart-quantity w-input';
    quantity.type = 'number';
    quantity.min = '1';
    quantity.max = '99';
    quantity.value = String(product.quantity);
    quantity.dataset.cartQuantity = product.id;
    quantity.setAttribute('aria-label', label(cart, 'labelQty', product.name));
    item.appendChild(quantity);
  }
  return item;
}

function heading(text: string): HTMLElement {
  const h = document.createElement('h5');
  h.className = 'header-cart-group';
  h.textContent = text;
  return h;
}

/** The request form address for the tailors in the cart (slugs only). Shop items are ordered separately, through the order form. */
function sendHref(base: string): string {
  return `${base}?${tailors.map((t) => `tailor=${encodeURIComponent(t.id)}`).join('&')}`;
}

/** Draws the cart into every panel, the count beside every button and the link that opens the request form. */
function render(): void {
  const count = tailors.length + products.reduce((sum, p) => sum + p.quantity, 0);
  for (const badge of document.querySelectorAll<HTMLElement>('[data-cart-count]')) badge.textContent = String(count);
  const total = products.reduce((sum, p) => sum + p.price * p.quantity, 0);

  for (const cart of document.querySelectorAll<HTMLElement>('[data-cart]')) {
    const list = cart.querySelector<HTMLElement>('[data-cart-items]');
    const filled = cart.querySelector<HTMLElement>('[data-cart-lines]');
    const empty = cart.querySelector<HTMLElement>('[data-cart-empty]');
    const send = cart.querySelector<HTMLAnchorElement>('[data-cart-send]');
    const subtotal = cart.querySelector<HTMLElement>('[data-cart-subtotal]');
    const totalText = cart.querySelector<HTMLElement>('[data-cart-total]');
    if (!list || !filled || !empty) continue;

    const nothing = tailors.length === 0 && products.length === 0;
    filled.hidden = nothing;
    empty.hidden = !nothing;
    const nodes: HTMLElement[] = [];
    if (products.length > 0) {
      if (tailors.length > 0) nodes.push(heading(label(cart, 'labelItems')));
      nodes.push(...products.map((p) => row(p, cart, 'product')));
    }
    if (tailors.length > 0) {
      if (products.length > 0) nodes.push(heading(label(cart, 'labelTailors')));
      nodes.push(...tailors.map((t) => row(t, cart, 'tailor')));
    }
    list.replaceChildren(...nodes);
    if (subtotal && totalText) {
      subtotal.hidden = products.length === 0;
      totalText.textContent = products.length ? money(total) : '—';
    }
    // Shop items go to the order page (one form: slugs and quantities only); tailors go to the request form.
    const order = cart.querySelector<HTMLFormElement>('[data-cart-order]');
    if (order) {
      order.hidden = products.length === 0;
      for (const old of order.querySelectorAll('input[type="hidden"]')) old.remove();
      for (const p of products) {
        for (const [name, value] of [['product', p.id], [`qty_${p.id}`, String(p.quantity)]] as const) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = name;
          input.value = value;
          order.appendChild(input);
        }
      }
    }
    if (send) {
      send.hidden = tailors.length === 0;
      send.href = sendHref(cart.dataset.requestHref ?? '/request');
    }
  }
}

function say(message: string): void {
  for (const status of document.querySelectorAll<HTMLElement>('[data-cart-status]')) status.textContent = message;
}

export function initCart(): void {
  const carts = document.querySelectorAll<HTMLElement>('[data-cart]');
  if (!carts.length) return;

  tailors = readTailors();
  products = readProducts();
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
    // The panel is a full-screen scrim; a click on the scrim itself dismisses it.
    panel.addEventListener('click', (event) => {
      if (event.target === panel) setOpen(cart, false);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAll();
  });

  const openFirst = (cart: HTMLElement) => {
    const toggle = cart.querySelector<HTMLButtonElement>('[data-cart-toggle]');
    if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
  };

  // "Add to Cart" on a card or a product page (a form with a price), and "Add to request list" on a tailor card (a form with a tailor).
  // Listening on the document keeps it working for cards that arrive later, as when the shop changes page.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-add-to-cart')) return;
    event.preventDefault();

    const data = new FormData(form);
    const text = (key: string) => String(data.get(key) ?? '');
    const cart = [...carts].find((c) => c.getClientRects().length > 0) ?? carts[0]!;
    const base = { name: form.dataset.name ?? text('name'), url: form.dataset.url ?? text('url'), image: form.dataset.image ?? text('image') };

    if (data.has('price')) {
      const id = text('id');
      const price = Number(text('price'));
      const quantity = Math.min(99, Math.max(1, Math.floor(Number(text('quantity')) || 1)));
      if (!SLUG.test(id) || !Number.isFinite(price) || price < 0) return;
      const existing = products.find((p) => p.id === id);
      if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
      else if (products.length >= MAX_PRODUCTS) {
        say(label(cart, 'labelFullItems'));
        return;
      } else products.push({ id, price, quantity, ...base });
      write(PRODUCTS_KEY, products);
    } else {
      const id = text('tailor');
      if (!id || tailors.some((t) => t.id === id)) return;
      if (tailors.length >= MAX_TAILORS) {
        say(label(cart, 'labelFull'));
        return;
      }
      tailors.push({ id, ...base });
      write(TAILORS_KEY, tailors);
    }
    say('');
    render();
    openFirst(cart);
  });

  document.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLElement>('[data-cart-remove]');
    if (!button) return;
    const [kind, id] = (button.dataset.cartRemove ?? '').split(':');
    if (kind === 'product') {
      products = products.filter((p) => p.id !== id);
      write(PRODUCTS_KEY, products);
    } else {
      tailors = tailors.filter((t) => t.id !== id);
      write(TAILORS_KEY, tailors);
    }
    say('');
    render();
  });

  // A changed quantity box updates the line, the count and the subtotal.
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.dataset.cartQuantity) return;
    const line = products.find((p) => p.id === input.dataset.cartQuantity);
    if (!line) return;
    line.quantity = Math.min(99, Math.max(1, Math.floor(Number(input.value) || 1)));
    write(PRODUCTS_KEY, products);
    render();
  });

  // Another tab changed the cart.
  window.addEventListener('storage', (event) => {
    if (event.key !== TAILORS_KEY && event.key !== PRODUCTS_KEY) return;
    tailors = readTailors();
    products = readProducts();
    render();
  });
}
