import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';

describe('D1 in the Workers test runtime', () => {
  it('answers a trivial query', async () => {
    const row = await env.DB.prepare('SELECT 1 AS one').first<{
      one: number;
    }>();
    expect(row?.one).toBe(1);
  });
});
