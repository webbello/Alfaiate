import { describe, expect, it } from 'vitest';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import Home from '../../src/pages/index.astro';
import { en } from '../../src/i18n/en';

describe('home page', () => {
  it('returns 200 with a single h1 and mobile viewport meta', async () => {
    const container = await AstroContainer.create();
    const response = await container.renderToResponse(Home);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(`<h1>${en.homeHeading}</h1>`);
    expect(html).toContain('name="viewport"');
  });
});
