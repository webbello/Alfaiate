import { describe, expect, it } from 'vitest';
import {
  localBusinessJsonLd,
  serialiseJsonLd,
  websiteJsonLd,
} from '../../src/modules/seo/jsonld';
import type { ProfileView } from '../../src/modules/directory/view';

// FR-PRO-07, BR-11: structured data repeats only what the public page already shows; it never adds a claim.
const SITE = 'https://alfaiate-tl.example';
const profile = (over: Partial<ProfileView> = {}): ProfileView => ({
  slug: 'ana',
  name: 'Ana Fake Tailor',
  description: { value: 'Makes suits and dresses.', verified: false },
  address: { value: 'Rua Fake 1', verified: false },
  languages: { value: 'Tetum', verified: false },
  homeVisits: { value: 'yes', verified: false },
  priceNote: { value: 'SECRET-PRICE-NOTE', verified: false },
  contacts: {
    whatsapp: { value: '+67077123456', verified: false },
    phone: { value: '+67033123456', verified: false },
  },
  categories: [
    {
      slug: 'suits',
      name: 'Suits',
      priceFrom: 2000,
      priceTo: 5000,
      unit: null,
      confirmedOn: null,
      verified: false,
    },
  ],
  areas: [],
  photos: [],
  profilePhoto: { base: 'a'.repeat(32), alt: 'Ana at work', caption: null },
  priceHint: { from: 2000, to: 5000 },
  ...over,
});
const ALLOWED = new Set([
  '@context',
  '@type',
  'name',
  'url',
  'description',
  'address',
  'telephone',
  'image',
  'streetAddress',
  'addressCountry',
  'inLanguage',
]);
const keysOf = (value: unknown, found = new Set<string>()): Set<string> => {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, found));
  else if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      found.add(k);
      keysOf(v, found);
    }
  return found;
};

describe('localBusinessJsonLd', () => {
  it('holds the public facts and nothing else', () => {
    const data = localBusinessJsonLd(profile(), SITE, 'en') as Record<
      string,
      unknown
    >;
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      name: 'Ana Fake Tailor',
      url: `${SITE}/tailors/ana`,
      description: 'Makes suits and dresses.',
      telephone: '+67033123456',
    });
    expect(data.image).toBe(`${SITE}/media/${'a'.repeat(32)}/large.jpg`);
    expect([...keysOf(data)].filter((k) => !ALLOWED.has(k))).toEqual([]);
  });

  it('never carries ratings, reviews, prices, hours, awards, languages or the price note', () => {
    const text = JSON.stringify(localBusinessJsonLd(profile(), SITE, 'en'));
    for (const word of [
      'aggregateRating',
      'review',
      'priceRange',
      'openingHours',
      'award',
      'SECRET-PRICE-NOTE',
      'Tetum',
      '2000',
      'whatsapp',
      '+67077123456',
    ])
      expect(text, word).not.toContain(word);
  });

  it('leaves out the telephone, address, description and image when the page does not show them', () => {
    const data = localBusinessJsonLd(
      profile({
        contacts: { whatsapp: null, phone: null },
        address: null,
        description: null,
        profilePhoto: null,
      }),
      SITE,
      'en',
    ) as Record<string, unknown>;
    for (const key of ['telephone', 'address', 'description', 'image'])
      expect(data, key).not.toHaveProperty(key);
    expect(data.name).toBe('Ana Fake Tailor');
  });

  it('uses the page address of the language shown', () => {
    expect(
      (localBusinessJsonLd(profile(), SITE, 'tet') as { url: string }).url,
    ).toBe(`${SITE}/tet/tailors/ana`);
  });

  it('cuts a long description at a word boundary and strips markup characters', () => {
    const data = localBusinessJsonLd(
      profile({
        description: {
          value: `<b>${'word '.repeat(200)}</b>`,
          verified: false,
        },
      }),
      SITE,
      'en',
    ) as { description: string };
    expect(data.description.length).toBeLessThanOrEqual(301);
    expect(data.description).not.toMatch(/[<>]/);
  });
});

describe('websiteJsonLd', () => {
  it('describes the site by name and address only', () => {
    const [site, org] = websiteJsonLd(SITE, 'Alfaiate TL', 'en') as Record<
      string,
      unknown
    >[];
    expect(site).toMatchObject({
      '@type': 'WebSite',
      name: 'Alfaiate TL',
      url: `${SITE}/`,
    });
    expect(org).toMatchObject({
      '@type': 'Organization',
      name: 'Alfaiate TL',
      url: `${SITE}/`,
    });
    expect([...keysOf([site, org])].filter((k) => !ALLOWED.has(k))).toEqual([]);
  });
});

describe('serialiseJsonLd', () => {
  it('cannot close the script block or open a comment, and still parses back to the same data', () => {
    const data = {
      name: '</script><script>alert(1)</script><!-- & \u2028 \u2029 ]]>',
      nested: ['<', '>'],
    };
    const text = serialiseJsonLd(data);
    for (const bad of ['<', '>', '&', '\u2028', '\u2029'])
      expect(text, JSON.stringify(bad)).not.toContain(bad);
    expect(JSON.parse(text)).toEqual(data);
  });
});
