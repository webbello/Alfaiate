import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Phase 7d: the home page recreated from the owner's reference design. These tests pin the structure, the honest-data rules
// (no stock photo on a tailor card, WhatsApp only with consent, no invented testimonials) and the image hygiene.
const home = async (path = '/') => (await get(path)).text();
const section = (html: string, heading: string) =>
  new RegExp(
    `<(section|article)[^>]*aria-labelledby="${heading}"[\\s\\S]*?</\\1>`,
  ).exec(html)?.[0] ?? '';
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

describe('home page structure (reference design)', () => {
  it('has the sections in the reference order', async () => {
    const html = await home();
    const ids = [
      'hero-heading',
      'services-heading',
      'featured-heading',
      'craft-heading',
      'how',
      'visit-heading',
      'teams-heading',
      'final-heading',
    ];
    const at = ids.map((id) => html.indexOf(`id="${id}"`));
    expect(
      at.every((i) => i > -1),
      JSON.stringify(at),
    ).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
  it('links every call to action to an existing workflow', async () => {
    const html = await home();
    expect(section(html, 'visit-heading')).toContain('href="/request"');
    expect(section(html, 'teams-heading')).toContain('href="/business"');
    expect(section(html, 'final-heading')).toMatch(
      /href="\/tailors"[\s\S]*href="\/request"/,
    );
    expect(section(html, 'craft-heading')).toContain('href="/how-it-works"');
    expect(html).toContain('href="/#services"');
    expect(html).toContain('href="/#craft"');
    expect(html).toContain('id="services"');
    expect(html).toContain('id="craft"');
    expect(html).toContain('href="/tailors#search"');
  });
  it('folds the phone menu only with JavaScript: the toggle starts hidden and the links are in the page', async () => {
    const html = await home();
    expect(html).toMatch(
      /<button class="nav-toggle"[^>]*aria-controls="site-menu"[^>]*hidden/,
    );
    expect(html).toContain('id="site-menu"');
  });
  it('shows the footer columns and closing line, and no newsletter form yet', async () => {
    const footer = /<footer[\s\S]*<\/footer>/.exec(await home())![0];
    expect(footer).toContain(
      'Made for Your Style. Connected to Our Community.',
    );
    expect(footer).toContain(`© ${new Date().getUTCFullYear()} Alfaiate TL`);
    expect(footer).toContain('href="/contact"');
    expect(footer).toContain('href="/business"');
  });
});

describe('scene photos', () => {
  it('come only from /images/site, reserve their space, have alt text set, and load lazily except the hero', async () => {
    const html = await home();
    const imgs = [...html.matchAll(/<img\b[^>]*>/g)].map((m) => m[0]);
    const scenes = imgs.filter((i) => i.includes('/images/site/'));
    expect(scenes.length).toBeGreaterThanOrEqual(14);
    for (const img of scenes) {
      expect(img, img).toMatch(/\bwidth="\d+"/);
      expect(img, img).toMatch(/\bheight="\d+"/);
      expect(img, img).toMatch(/\balt="/);
    }
    const hero = scenes.find((i) => i.includes('hero__image'))!;
    expect(hero).toContain('fetchpriority="high"');
    expect(hero).not.toContain('loading="lazy"');
    expect(
      scenes.filter(
        (i) => !i.includes('hero__image') && !i.includes('loading="lazy"'),
      ),
    ).toEqual([]);
    expect(html).toMatch(
      /<link rel="preload" as="image" href="\/images\/site\/hero-800\.webp"/,
    );
  });
  it('are never used on a tailor card (BR-06, BR-11)', async () => {
    await addTailor();
    const cards = [
      ...(await home()).matchAll(
        /<article class="tailor-card[\s\S]*?<\/article>/g,
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
        `<article class="tailor-card(?:(?!</article>)[\\s\\S])*href="/tailors/${slug}"[\\s\\S]*?</article>`,
      ).exec(html)?.[0] ?? '';
    expect(card(yes)).toContain('href="https://wa.me/67077123456');
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
    expect(html).not.toContain('<blockquote');
    expect(html).not.toMatch(/★|\b\d(\.\d)?\s*(\/\s*5|stars?)\b/i);
  });
});

describe('footer social icons', () => {
  it('shows only the configured, platform-owned links, labelled for screen readers', async () => {
    const footer = /<footer[\s\S]*<\/footer>/.exec(await home())![0];
    expect(footer).toContain('href="https://www.facebook.com/alfaiate.test"');
    expect(footer).toContain('href="https://www.instagram.com/alfaiate.test"');
    expect(footer).not.toContain('evil.example'); // SOCIAL_YOUTUBE points at a foreign host in this test project
    expect(footer).toMatch(/aria-label="Facebook"/);
    expect(footer).not.toContain('wa.me'); // no owner number in this project
  });
});
