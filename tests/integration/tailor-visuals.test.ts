import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Phase 7c T5: a listing without a permitted photo gets an illustrated swatch (never a stock image, BR-06/BR-11); one with a photo shows the photo only.
const db = env.DB;
const add = async (withPhoto: boolean) => {
  const slug = `tv-${unique()}`;
  const id = (
    await db
      .prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded, contact_publish_consent, whatsapp_e164) VALUES (?, 'Visual Fake', 'approved', 1, 1, 1, '+67077123456')",
      )
      .bind(slug)
      .run()
  ).meta.last_row_id as number;
  if (withPhoto) {
    const img = (
      await db
        .prepare(
          "INSERT INTO portfolio_image (tailor_id, file_key, alt_text, permission_granted, is_visible) VALUES (?, ?, 'A made-up jacket', 1, 1)",
        )
        .bind(id, `tailors/${id}/fake`)
        .run()
    ).meta.last_row_id;
    await db
      .prepare('UPDATE tailor SET profile_photo_id = ? WHERE id = ?')
      .bind(img, id)
      .run();
  }
  return slug;
};
// the card is the list item that holds the tailor's link; the profile's own part is the article
const card = (html: string, slug: string) =>
  new RegExp(
    `<li data-directory-item[^>]*>(?:(?!</li>)[\\s\\S])*href="/tailors/${slug}"[\\s\\S]*?</li>`,
  ).exec(html)?.[0] ?? '';
const article = (html: string) =>
  /<article class="profile[\s\S]*?<\/article>/.exec(html)?.[0] ?? '';
const BADGE =
  /<div class="shop-thumb shop-thumb--initials" data-initials="[A-Z0-9]{1,2}" aria-hidden="true">/;

describe('listing visuals', () => {
  it('shows an aria-hidden initials badge on a card and a profile with no photo, and no image', async () => {
    const slug = await add(false);
    const c = card(await (await get('/tailors')).text(), slug);
    expect(c).not.toBe('');
    expect(c).toMatch(BADGE);
    expect(c).not.toContain('<img');
    const profile = article(await (await get(`/tailors/${slug}`)).text());
    expect(profile).toMatch(BADGE);
    expect(profile).not.toContain('<img');
  });
  it('shows the photo, and no badge, when a permitted photo exists', async () => {
    const slug = await add(true);
    const c = card(await (await get('/tailors')).text(), slug);
    expect(c).toContain('<img');
    expect(c).not.toContain('shop-thumb--initials');
    const profile = article(await (await get(`/tailors/${slug}`)).text());
    expect(profile).toContain('<img');
    expect(profile).not.toContain('shop-thumb--initials');
  });
  it('gives the same initials to the same tailor on the card and the profile', async () => {
    const slug = await add(false);
    const c = /data-initials="([A-Z0-9]{1,2})"/.exec(
      card(await (await get('/tailors')).text(), slug),
    )![1];
    expect(article(await (await get(`/tailors/${slug}`)).text())).toContain(
      `data-initials="${c}"`,
    );
  });
});
