import { describe, expect, it } from 'vitest';
import { get } from '../integration/helpers';

// OQ-08: with JOIN_ENABLED unset (the default, so production until the owner approves), the join form does not exist and nothing links to it.
describe('the tailor interest form is off by default', () => {
  it('answers 404 for the form, its thanks page and the Tetum paths, and the home page has no invitation', async () => {
    for (const path of ['/join', '/join/thanks?ref=JN-ABCDEFGH', '/tet/join'])
      expect((await get(path)).status, path).toBe(404);
    const home = await (await get('/')).text();
    expect(home).not.toContain('href="/join"');
    expect(home).not.toContain('id="tailors"');
  });
  it('also refuses a post', async () => {
    const r = await (
      await import('../integration/worker')
    ).worker.fetch(
      new Request('https://example.test/join', {
        method: 'POST',
        headers: { Origin: 'https://example.test' },
        body: new URLSearchParams({ name: 'x' }),
      }),
    );
    expect(r.status).toBe(404);
  });
});
