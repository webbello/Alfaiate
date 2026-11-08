import { describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../src/modules/journal/frontmatter';
import {
  cmsProductPhotos,
  cmsTailorPhotos,
  parseCmsPhotos,
} from '../../src/modules/media/cms-photos';
import { photoSrcset, photoUrl } from '../../src/modules/media/urls';

// FR-CMS-04: photo entries are matched by slug; only pictures under /photos/<folder>/ are accepted.
const tailors = (text: string, name = 'zeb') =>
  parseCmsPhotos(
    { [`/content/photos/tailors/${name}.yml`]: text },
    'tailors',
    'profile',
  );

describe('photo entries', () => {
  it('reads a profile, its description and a gallery with one description per line', () => {
    const got = tailors(
      'slug: zeb\nprofile: /photos/tailors/zeb.webp\nprofile_alt: Zeb at work\ngallery:\n  - /photos/tailors/a.webp\n  - /photos/tailors/b.webp\ngallery_alt: |-\n  First\n  Second\n',
    ).get('zeb');
    expect(got).toEqual({
      main: { src: '/photos/tailors/zeb.webp', alt: 'Zeb at work' },
      gallery: [
        { src: '/photos/tailors/a.webp', alt: 'First' },
        { src: '/photos/tailors/b.webp', alt: 'Second' },
      ],
    });
  });
  it('drops a picture outside its own folder, an address, a path trick and a bad slug', () => {
    const got = tailors(
      'profile: https://evil.test/x.webp\ngallery:\n  - /photos/products/x.webp\n  - /photos/tailors/../x.webp\n  - /photos/tailors/ok.webp\n',
    ).get('zeb');
    expect(got?.main).toBeNull();
    expect(got?.gallery.map((p) => p.src)).toEqual(['/photos/tailors/ok.webp']);
    expect(tailors('profile: /photos/tailors/x.webp', 'Bad_Slug').size).toBe(0);
  });
  it('lists of plain items are read by the front matter reader; a list of objects is not', () => {
    const { data } = parseFrontmatter(
      'gallery:\n  - one\n  - two\nlinks:\n  - label: x\n    url: y\n',
    );
    expect(data.gallery).toEqual(['one', 'two']);
    expect(data.links).toBeNull();
  });
  it('the example entries exist for the tests', () => {
    expect(cmsTailorPhotos('example-tailor').main?.src).toBe(
      '/photos/tailors/example-tailor.webp',
    );
    expect(cmsTailorPhotos('example-tailor').gallery).toHaveLength(1);
    expect(cmsProductPhotos('example-product').main?.src).toBe(
      '/photos/products/example-product.webp',
    );
    expect(cmsTailorPhotos('nobody')).toEqual({ main: null, gallery: [] });
  });
});

describe('picture addresses', () => {
  it('an R2 image has three sizes and a srcset; a content-editor photo is one file with none', () => {
    expect(photoUrl('tailor/1/abc', 'medium')).toBe(
      '/media/tailor/1/abc/medium.jpg',
    );
    expect(photoUrl('product/2/abc', 'thumb', 'shop/')).toBe(
      '/media/shop/product/2/abc/thumb.jpg',
    );
    expect(
      photoSrcset('tailor/1/abc', [
        ['thumb', 320],
        ['medium', 800],
      ]),
    ).toBe(
      '/media/tailor/1/abc/thumb.jpg 320w, /media/tailor/1/abc/medium.jpg 800w',
    );
    expect(photoUrl('cms:/photos/tailors/x.webp', 'large')).toBe(
      '/photos/tailors/x.webp',
    );
    expect(
      photoSrcset('cms:/photos/tailors/x.webp', [['thumb', 320]]),
    ).toBeUndefined();
  });
});
