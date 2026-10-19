import { pathFor, type Lang } from '../../i18n/lang';
import type { ProfileView } from '../directory/view';
import { metaText } from './meta';

// Structured data (FR-PRO-07). It repeats only what the public page already shows (BR-11): never ratings, reviews, prices, hours,
// awards or any claim, and the telephone and photo only exist in the view model when consent and permission were recorded.

/** JSON for a `<script type="application/ld+json">` block. `<`, `>`, `&` and the line separators are escaped, so text can never close the block or open a comment. */
export const serialiseJsonLd = (data: unknown): string =>
  JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** The site and its organisation: name and address only. */
export function websiteJsonLd(
  siteUrl: string,
  name: string,
  lang: Lang,
): object[] {
  const url = `${siteUrl}${pathFor(lang, '/')}`;
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name,
      url,
      inLanguage: lang,
    },
    { '@context': 'https://schema.org', '@type': 'Organization', name, url },
  ];
}

export function localBusinessJsonLd(
  profile: ProfileView,
  siteUrl: string,
  lang: Lang,
): object {
  const description = profile.description
    ? metaText(profile.description.value, 300)
    : '';
  return {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: profile.name,
    url: `${siteUrl}${pathFor(lang, `/tailors/${profile.slug}`)}`,
    ...(description && { description }),
    ...(profile.address && {
      address: {
        '@type': 'PostalAddress',
        streetAddress: profile.address.value,
        addressCountry: 'TL',
      },
    }),
    ...(profile.contacts.phone && { telephone: profile.contacts.phone.value }),
    ...(profile.profilePhoto && {
      image: `${siteUrl}/media/${profile.profilePhoto.base}/large.jpg`,
    }),
  };
}
