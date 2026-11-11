import { describe, expect, it } from 'vitest';
import { EXAMPLES, renderList } from '../../scripts/cms-lists-lib.mjs';
import config from '../../public/cms/config.yml?raw';
import tailorList from '../../content/lists/tailors.yml?raw';

// FR-CMS-04: the content editor picks a tailor or product from a list written from the database, instead of a typed slug.
describe('cms:lists', () => {
  it('writes slugs and names as safe YAML, keeps the example entry, and drops a bad slug', () => {
    const text = renderList('tailors', [
      { slug: 'zeb-fake', name: 'Zeb: "Best" tailor' },
      { slug: 'Bad Slug', name: 'Nope' },
      { slug: 'example-tailor', name: 'Duplicate' },
    ]);
    expect(text).toContain(
      '  - slug: zeb-fake\n    name: "Zeb: \\"Best\\" tailor"',
    );
    expect(text).not.toContain('Bad Slug');
    expect(text.match(/slug: example-tailor/g)).toHaveLength(1);
    expect(text).toContain(EXAMPLES.tailors.name);
  });
  it('the committed list holds only the example entry (real names come from running the command, never from a developer database)', () => {
    expect(tailorList.match(/- slug: /g)).toHaveLength(1);
    expect(tailorList).toContain('slug: example-tailor');
  });
  it('the photo entries choose their tailor and product from those lists', () => {
    expect(config).toMatch(
      /- name: slug\n\s+label: Tailor\n\s+widget: relation\n\s+collection: lists\n\s+file: tailors/,
    );
    expect(config).toMatch(
      /- name: slug\n\s+label: Product\n\s+widget: relation\n\s+collection: lists\n\s+file: products/,
    );
  });
});
