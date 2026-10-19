import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { get, unique } from './helpers';

// Phase 7c T4: the story sections of the home page. They tell the story without inventing proof (BR-11), carry no body measurements input, and keep every old landmark.
const home = async (path = '/') => (await get(path)).text();
const section = (html: string, id: string) =>
  new RegExp(`<section[^>]*aria-labelledby="${id}"[\\s\\S]*?</section>`).exec(
    html,
  )?.[0] ?? '';

describe('home story sections', () => {
  it('has the sections in story order, each a labelled landmark with its own h2', async () => {
    const html = await home();
    const ids = ['promise', 'how', 'craft', 'local', 'trust', 'ask'];
    const at = ids.map((id) => html.indexOf(`<h2 id="${id}">`));
    expect(
      at.every((i) => i > -1),
      JSON.stringify(at),
    ).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html.indexOf('class="hero"')).toBeLessThan(at[0]);
  });
  it('explains five measuring points, each openable from the keyboard, with no input of any kind', async () => {
    const craft = section(await home(), 'craft');
    expect(craft.match(/<details/g)).toHaveLength(5);
    expect(craft.match(/<summary/g)).toHaveLength(5);
    expect(craft).not.toMatch(/<(input|select|textarea|form|button)\b/);
    for (const point of ['Shoulder', 'Chest', 'Waist', 'Inseam', 'Sleeve'])
      expect(craft).toContain(`>${point}<`);
    expect(craft).toContain('agreed with your tailor');
  });
  it('invents no numbers, ratings, testimonials or superlatives in the visible text', async () => {
    const html = await home();
    // category names come from the owner's data, not from our copy
    const main = /<main[\s\S]*<\/main>/
      .exec(html.replace(section(html, 'needs'), ''))![0]
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#?\w+;/g, ' ');
    expect(main.match(/.{0,30}\d.{0,30}/)?.[0]).toBeUndefined();
    expect(main).not.toMatch(
      /\b(best|top|leading|trusted by|rated|reviews?|testimonial|guaranteed|award|famous)\b/i,
    );
  });
  it('says what the platform does and does not do', async () => {
    const trust = section(await home(), 'trust');
    expect(trust).toMatch(/introduce/i);
    expect(trust).toMatch(/set (your )?prices?|does not set|do not set/i);
    expect(trust).toMatch(/consent/i);
    expect(trust.match(/<ul/g)).toHaveLength(2);
  });
  it('ends with one request call that leads to the form, in both languages', async () => {
    expect(section(await home(), 'ask')).toContain('href="/request"');
    expect(section(await home('/tet/'), 'ask')).toContain(
      'href="/tet/request"',
    );
  });
  it('still lists categories that have a published tailor, as links', async () => {
    const slug = `st-${unique()}`;
    const cat = (
      await env.DB.prepare(
        "INSERT INTO garment_category (slug, name) VALUES (?, 'Story Cat Fake')",
      )
        .bind(slug)
        .run()
    ).meta.last_row_id;
    const tailor = (
      await env.DB.prepare(
        "INSERT INTO tailor (slug, display_name, status, is_published, permission_recorded) VALUES (?, 'Story Live Fake', 'approved', 1, 1)",
      )
        .bind(`stl-${unique()}`)
        .run()
    ).meta.last_row_id;
    await env.DB.prepare(
      'INSERT INTO tailor_category (tailor_id, category_id) VALUES (?, ?)',
    )
      .bind(tailor, cat)
      .run();
    const needs = section(await home(), 'needs');
    expect(needs).toContain('Story Cat Fake');
    expect(needs).toContain(`href="/categories/${slug}"`);
  });
  it('has Tetum versions of the same sections', async () => {
    const html = await home('/tet/');
    for (const id of ['promise', 'how', 'craft', 'local', 'trust', 'ask'])
      expect(html, id).toContain(`<h2 id="${id}">`);
  });
});
