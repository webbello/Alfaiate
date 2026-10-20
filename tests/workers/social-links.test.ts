import { describe, expect, it } from 'vitest';
import { socialLinks, testimonialPlaceholders } from '../../src/modules/config';

// Phase 7d: footer social links come only from the platforms' own https addresses; nothing else can reach the footer.
describe('socialLinks', () => {
  it('keeps https addresses on each platform and adds WhatsApp from the owner number', () => {
    const links = socialLinks({
      SOCIAL_FACEBOOK: 'https://www.facebook.com/alfaiate',
      SOCIAL_INSTAGRAM: 'https://instagram.com/alfaiate',
      SOCIAL_YOUTUBE: 'https://youtu.be/abc',
      SITE_WHATSAPP: '+670 7712 3456',
    });
    expect(links.map((l) => l.name)).toEqual([
      'facebook',
      'instagram',
      'youtube',
      'whatsapp',
    ]);
    expect(links.at(-1)!.href).toBe('https://wa.me/67077123456');
  });
  it('drops other hosts, http, look-alike domains, credentials and non-URLs', () => {
    for (const bad of [
      'http://www.facebook.com/x',
      'https://evil.example/facebook.com',
      'https://facebook.com.evil.example/',
      'https://user:pw@facebook.com/x',
      'javascript:alert(1)',
      'not a url',
      '',
    ]) {
      expect(socialLinks({ SOCIAL_FACEBOOK: bad }), bad).toEqual([]);
    }
  });
  it('shows nothing when nothing is set', () => {
    expect(socialLinks({})).toEqual([]);
  });
});

describe('testimonialPlaceholders', () => {
  it('is on only for the exact string true', () => {
    expect(
      testimonialPlaceholders({ SHOW_TESTIMONIAL_PLACEHOLDERS: 'true' }),
    ).toBe(true);
    for (const v of [undefined, '', 'TRUE', '1', 'yes', 'false'])
      expect(
        testimonialPlaceholders({ SHOW_TESTIMONIAL_PLACEHOLDERS: v }),
        String(v),
      ).toBe(false);
  });
});

import { googleSiteVerification } from '../../src/modules/config';
describe('googleSiteVerification', () => {
  it('accepts a plain token and refuses anything that could leave the attribute', () => {
    expect(
      googleSiteVerification({ GOOGLE_SITE_VERIFICATION: ' abcDEF_123-xyz ' }),
    ).toBe('abcDEF_123-xyz');
    for (const bad of [
      undefined,
      '',
      'short',
      'a"b><script>alert(1)</script>',
      'has space in it',
      'x'.repeat(101),
    ])
      expect(
        googleSiteVerification({ GOOGLE_SITE_VERIFICATION: bad }),
        String(bad),
      ).toBeNull();
  });
});
