// The ONLY shapes the public pages receive. Anything not listed here (private contacts, permission notes, fee terms,
// internal notes, ids of admin users, the verification list itself) cannot reach a public page, because it is never selected.
export type Fact<T> = { value: T; verified: boolean };
export type PhotoView = { base: string; alt: string; caption: string | null };
export type Price = { from: number | null; to: number | null };

export type CardView = {
  slug: string;
  name: string;
  photo: PhotoView | null;
  specialties: string[];
  areas: string[];
  homeVisits: 'yes' | 'no' | null;
  /** The price of the first priced work type, named: a card never mixes the cheapest and dearest of different garments. */
  priceHint: Price | null;
  priceCategory: string | null;
  /** The tailor's own description, shortened for a card (supplied by the tailor, BR-11). */
  description: string | null;
  /** Only when the tailor agreed to show it (contact_publish_consent). */
  whatsapp: string | null;
};

export type ProfileView = {
  slug: string;
  name: string;
  description: Fact<string> | null;
  address: Fact<string> | null;
  languages: Fact<string> | null;
  homeVisits: Fact<'yes' | 'no'> | null;
  priceNote: Fact<string> | null;
  contacts: { whatsapp: Fact<string> | null; phone: Fact<string> | null };
  categories: {
    slug: string;
    name: string;
    priceFrom: number | null;
    priceTo: number | null;
    unit: string | null;
    confirmedOn: string | null;
    verified: boolean;
  }[];
  areas: { slug: string; name: string; kind: 'shop_location' | 'serves' }[];
  photos: PhotoView[];
  profilePhoto: PhotoView | null;
  priceHint: Price | null;
};

export type Choice = { slug: string; name: string };
