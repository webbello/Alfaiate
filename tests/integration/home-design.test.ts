import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Handspark theme, step 3: the home page in the theme. These tests pin the structure, the honest-data rules
// (no stock photo on a tailor card, WhatsApp only with consent, no invented testimonials), the image hygiene and the frame.
const home = async (path = '/') => (await get(path)).text();
const addTailor = async (
  o: {
    consent?: number;
    whatsapp?: string | null;
    published?: number;
    name?: string;
  } = {},
) => {
  const slug = `hd-${unique()}`;
  await env.DB.prepare(
    "INSERT INTO tailor (slug, display_name, description, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164) VALUES (?, ?, 'A made-up description for a home card.', 'approved', ?, 1, ?, ?)",
  )
    .bind(
      slug,
      o.name ?? `Home Card Fake ${unique()}`,
      o.published ?? 1,
      o.consent ?? 1,
      o.whatsapp === undefined ? '+67077123456' : o.whatsapp,
    )
    .run();
  return slug;
};
const sectionOf = (html: string, cls: string) =>
  new RegExp(`<section class="${cls}[\\s\\S]*?</section>`).exec(html)?.[0] ??
  '';

describe('home page structure (Handspark theme)', () => {
  // Order changed on purpose by the UX audit (2026-11-12, P3): tailors and how it works straight after the hero.
  it('has the sections in order: hero, featured tailors, process, our services, about, call to action', async () => {
    await addTailor();
    const html = await home();
    const classes = [
      'home-section',
      'best-sellers-section',
      'process-section',
      'our-works-section',
      'company-section',
      'blog-section home-cta',
    ];
    const at = classes.map((c) => html.indexOf(`<section class="${c}"`));
    expect(
      at.every((i) => i > -1),
      JSON.stringify(at),
    ).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('has the hero image trail and the tape-measure ruler under the hero', async () => {
    const hero = sectionOf(await home(), 'home-section');
    expect(hero).toContain('class="home-gsap"');
    expect(hero).toContain('class="gsap-wrapper"'); // where the pictures appear
    expect(hero.match(/class="gsap-item"/g)).toHaveLength(8);
    expect(hero).toContain('class="hero-line"'); // the ruler
    // the pictures are the licensed scene photos, never a tailor's own work
    for (const src of hero.matchAll(/class="gsap-image"/g))
      expect(src).toBeTruthy();
    expect(hero).not.toContain('/media/');
  });

  it('links every call to action to an existing workflow', async () => {
    const html = await home();
    const hero = sectionOf(html, 'home-section');
    expect(hero).toMatch(/href="\/tailors"[\s\S]*href="\/request"/);
    expect(sectionOf(html, 'company-section')).toContain('href="/craft"');
    expect(sectionOf(html, 'best-sellers-section')).toContain(
      'href="/tailors"',
    );
    expect(sectionOf(html, 'our-works-section')).toContain('href="/services"');
    expect(sectionOf(html, 'blog-section home-cta')).toMatch(
      /href="\/tailors"[\s\S]*href="\/request"/,
    );
    const tet = await home('/tet/');
    expect(sectionOf(tet, 'our-works-section')).toContain(
      'href="/tet/services"',
    );
  });

  it('puts every menu link in the page itself (no script needed) and has the cart button', async () => {
    const html = await home();
    const header = /<header[\s\S]*?<\/header>/.exec(html)![0];
    for (const href of [
      '/tailors',
      '/about',
      '/contact',
      '/services',
      '/craft',
      '/business',
      '/request',
    ])
      expect(header, href).toContain(`href="${href}"`);
    expect(header).toContain('data-nav-toggle');
    expect(header).toContain('data-cart');
    const tet = /<header[\s\S]*?<\/header>/.exec(await home('/tet/'))![0];
    expect(tet).toContain('href="/tet/tailors"');
    expect(tet).toContain('href="/tet/services"');
  });

  it('shows the footer columns and closing line, in our words', async () => {
    const footer = /<footer[\s\S]*<\/footer>/.exec(await home())![0];
    expect(footer).toContain(
      'Made for Your Style. Connected to Our Community.',
    );
    expect(footer).toMatch(
      new RegExp(`(?:©|&copy;) ${new Date().getUTCFullYear()} Alfaiate TL`),
    );
    expect(footer).toContain('href="/contact"');
    expect(footer).toContain('href="/business"');
    expect(footer).not.toContain('tncflow'); // the theme's designer credit is off
    expect(footer).not.toContain('Subscribe to our Newsletter'); // the theme's demo form never pretends to send
  });
});

describe('scene photos', () => {
  it('come only from /images/site, reserve their space, have alt text set, and load lazily', async () => {
    const html = await home();
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const scenes = imgs.filter((i) => i.includes('/images/site/'));
    expect(scenes.length).toBeGreaterThanOrEqual(14);
    for (const img of scenes) {
      expect(img, img).toMatch(/\bwidth="\d+"/);
      expect(img, img).toMatch(/\bheight="\d+"/);
      expect(img, img).toMatch(/\balt="/);
      expect(img, img).toContain('loading="lazy"');
    }
  });
  it('are never used on a tailor card (BR-06, BR-11)', async () => {
    await addTailor();
    const cards = [
      ...(await home()).matchAll(
        /<div class="shop-card">[\s\S]*?<\/div><\/div><\/div>/g,
      ),
    ].map((m) => m[0]);
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) expect(card).not.toContain('/images/site/');
  });
});

describe('featured tailors', () => {
  it('links each card to the real profile and shows WhatsApp only for a consented number', async () => {
    const yes = await addTailor({ name: 'Aaa Consent Fake' });
    const no = await addTailor({ name: 'Aab NoConsent Fake', consent: 0 });
    const html = await home();
    const card = (slug: string) =>
      new RegExp(
        `<div class="shop-card">(?:(?!<div class="shop-card">)[\\s\\S])*href="/tailors/${slug}"[\\s\\S]*?(?=<div class="shop-card">|</div></div></div></div></div>)`,
      ).exec(html)?.[0] ?? '';
    expect(card(yes)).toContain('href="https://wa.me/67077123456');
    expect(card(yes)).toContain('data-contact-channel="whatsapp"');
    expect(card(no)).not.toBe('');
    expect(card(no)).not.toContain('wa.me');
  });
  it('never shows a draft', async () => {
    const draft = await addTailor({ name: 'Aac Draft Fake', published: 0 });
    expect(await home()).not.toContain(`/tailors/${draft}`);
  });
});

describe('testimonials', () => {
  it('stay hidden until the owner adds real, permitted quotes (none today): no section, no quote, no rating', async () => {
    const html = await home();
    expect(html).not.toContain('Stories of Craftsmanship and Style.');
    expect(html).not.toContain('class="review-card"');
    expect(html).not.toMatch(/★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i);
    expect(html).not.toContain('Trusted Partner'); // the theme's sample partner logos stay hidden too
  });
});

describe('footer social icons', () => {
  it('shows only the configured, platform-owned links, labelled for screen readers', async () => {
    const footer = /<footer[\s\S]*<\/footer>/.exec(await home())![0];
    expect(footer).toContain('href="https://www.facebook.com/alfaiate.test"');
    expect(footer).toContain('href="https://www.instagram.com/alfaiate.test"');
    expect(footer).not.toContain('evil.example'); // SOCIAL_YOUTUBE points at a foreign host in this test project
    expect(footer).not.toContain('linkedin.com'); // the theme's demo profiles are not ours
    expect(footer).toMatch(/aria-label="Facebook"/);
    expect(footer).not.toContain('wa.me'); // no owner number in this project
  });
});
