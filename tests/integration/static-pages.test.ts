import { describe, expect, it } from 'vitest';
import { get } from './helpers';

const page = async (path: string) => {
  const response = await get(path);
  return { status: response.status, html: await response.text() };
};
const SLUGS = ['how-it-works', 'about', 'privacy', 'terms'] as const;
const h2s = (html: string) => [...html.matchAll(/<h2 id="s\d"/g)].length;

describe('static pages (FR-PUB-06)', () => {
  for (const [prefix, lang] of [
    ['', 'en'],
    ['/tet', 'tet'],
  ] as const) {
    for (const slug of SLUGS) {
      it(`${prefix}/${slug} renders, and is not indexed until the owner approves its text`, async () => {
        const { status, html } = await page(`${prefix}/${slug}`);
        expect(status).toBe(200);
        expect(html).toContain(`<html lang="${lang}">`);
        expect(html).toMatch(/<h1>[^<]+<\/h1>/);
        expect(html).toContain('name="robots" content="noindex,follow"');
        expect(html).toContain(
          `<link rel="canonical" href="https://alfaiate-tl.example${prefix}/${slug}"`,
        );
        expect(html).not.toContain('<style');
        expect(html).not.toMatch(/<script(?![^>]*src=)/);
      });
    }
  }

  it('explains how the service works without promising anything (BR-01, BR-02, BR-04)', async () => {
    const { html } = await page('/how-it-works');
    expect(h2s(html)).toBe(6);
    expect(html).toContain('We are not a tailor');
    expect(html).toContain('agree the final price');
    expect(html).toContain('does not take payments');
    expect(html).toContain('cannot guarantee');
    expect(html).toContain('We do not publish ratings or reviews');
    for (const promise of [
      /\b(we|alfaiate tl) (will )?guarantee/i,
      /best/i,
      /fastest/i,
      /cheapest/i,
      /free of charge/i,
      /refund/i,
    ])
      expect(html).not.toMatch(promise);
  });

  it('keeps the About page to facts that are known (no invented people, places, dates or contacts)', async () => {
    const { html } = await page('/about');
    expect(h2s(html)).toBe(2);
    expect(html).not.toMatch(
      /founded|since \d{4}|our team|call us|email us|@|\+670/i,
    );
  });

  it('keeps Privacy and Terms as plain placeholders with no invented legal wording (OQ-08)', async () => {
    for (const slug of ['privacy', 'terms']) {
      const { html } = await page(`/${slug}`);
      expect(html).toContain('This page is a placeholder');
      expect(h2s(html)).toBe(0);
      expect(html).not.toMatch(
        /GDPR|complian|retention|we (never|do not|will not) (collect|share|sell)|liab|jurisdiction|governed by/i,
      );
    }
    expect((await page('/tet/privacy')).html).toContain('fatin-reservadu');
  });

  it('is linked from the header and footer of every page, in both languages', async () => {
    for (const [prefix, how, about, privacy, terms] of [
      ['', 'How it works', 'About', 'Privacy', 'Terms'],
      [
        '/tet',
        'Oinsá serbisu ne&#39;e halo',
        'Kona-ba',
        'Privasidade',
        'Kondisaun',
      ],
    ] as const) {
      const { html } = await page(`${prefix}/`);
      expect(html, prefix).toContain(`href="${prefix}/how-it-works"`);
      expect(html, prefix).toContain(`href="${prefix}/about"`);
      expect(html, prefix).toContain(`href="${prefix}/privacy"`);
      expect(html, prefix).toContain(`href="${prefix}/terms"`);
      for (const word of [how, about, privacy, terms])
        expect(html, `${prefix} ${word}`).toContain(word);
      expect(html).toContain('class="footer-nav"');
    }
  });

  it('has exactly one of each landmark, so screen readers are not told twice', async () => {
    const { html } = await page('/how-it-works');
    expect(html.match(/<header/g)).toHaveLength(1);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<footer/g)).toHaveLength(1);
    expect(html.match(/class="site-nav"/g)).toHaveLength(1);
    expect(html.match(/class="footer-nav"/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it('offers the browse and request buttons at the end of the long pages only', async () => {
    expect((await page('/how-it-works')).html).toContain('href="/request"');
    expect((await page('/privacy')).html).not.toContain('href="/request"');
  });
});
