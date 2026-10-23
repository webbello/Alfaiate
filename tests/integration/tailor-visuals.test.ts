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
const card = (html: string, slug: string) =>
  new RegExp(
    `<article class="card">(?:(?!</article>)[\\s\\S])*href="/tailors/${slug}"[\\s\\S]*?</article>`,
  ).exec(html)?.[0] ?? '';

describe('listing visuals', () => {
  it('shows an aria-hidden illustrated swatch on a card and a profile with no photo, and no image', async () => {
    const slug = await add(false);
    const c = card(await (await get('/tailors')).text(), slug);
    expect(c).not.toBe('');
    expect(c).toMatch(
      /<div class="card__swatch card__swatch--[012]" data-initials="[A-Z0-9]{1,2}" aria-hidden="true">/,
    );
    expect(c).not.toContain('<img');
    const profile = await (await get(`/tailors/${slug}`)).text();
    expect(profile).toMatch(
      /<div class="profile__swatch profile__swatch--[012]" data-initials="[A-Z0-9]{1,2}" aria-hidden="true">/,
    );
    expect(profile).not.toContain('<img');
  });
  it('shows the photo, and no swatch, when a permitted photo exists', async () => {
    const slug = await add(true);
    const c = card(await (await get('/tailors')).text(), slug);
    expect(c).toContain('<img');
    expect(c).not.toContain('card__swatch');
    const profile = await (await get(`/tailors/${slug}`)).text();
    expect(profile).toContain('<img');
    expect(profile).not.toContain('profile__swatch');
  });
  it('gives the same look to the same tailor on the card and the profile', async () => {
    const slug = await add(false);
    const c = /card__swatch--([012])/.exec(
      card(await (await get('/tailors')).text(), slug),
    )![1];
    expect(await (await get(`/tailors/${slug}`)).text()).toContain(
      `profile__swatch--${c}`,
    );
  });
});
