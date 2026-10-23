import { describe, expect, it } from 'vitest';
import { get, signIn } from './helpers';

// Phase 7b T6: lists with nothing in them say what to do next. This file starts with an empty database.
describe('empty states', () => {
  it('tailors, categories and areas each explain themselves', async () => {
    const owner = await signIn('owner');
    const tailors = await (await get('/admin/tailors', owner)).text();
    expect(tailors).toContain('class="empty"');
    expect(tailors).toContain('No tailors yet');
    expect(tailors).toContain('href="/admin/tailors/new"');
    expect(tailors).not.toContain('<table');
    for (const [path, title] of [
      ['/admin/categories', 'No garment types yet'],
      ['/admin/areas', 'No areas yet'],
    ] as const) {
      const html = await (await get(path, owner)).text();
      expect(html, path).toContain('class="empty"');
      expect(html, path).toContain(title);
      expect(html, path).toContain('name="action"'); // the add form is still there
    }
  });
});
