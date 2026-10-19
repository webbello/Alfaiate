import { describe, expect, it } from 'vitest';
import { renderDevVars } from '../../scripts/setup-local-lib.mjs';

const EXAMPLE = [
  '# Copy to .dev.vars',
  'SESSION_SECRET=replace-me',
  '# FORM_TOKEN_SECRET=commented-out-example',
  'FORM_TOKEN_SECRET=replace-me-with-at-least-16-chars',
  'PUBLIC_LANGUAGES=en,tet',
  'SITE_URL=http://localhost:4321',
].join('\n');

describe('renderDevVars', () => {
  it('replaces only the placeholder secrets, with different values, and leaves everything else alone', () => {
    let n = 0;
    const out = renderDevVars(EXAMPLE, () => `secret-${++n}-0123456789abcdef`);
    expect(out).toContain('SESSION_SECRET=secret-1-0123456789abcdef');
    expect(out).toContain('FORM_TOKEN_SECRET=secret-2-0123456789abcdef');
    expect(out).toContain('# FORM_TOKEN_SECRET=commented-out-example');
    expect(out).toContain('PUBLIC_LANGUAGES=en,tet');
    expect(out).toContain('SITE_URL=http://localhost:4321');
    expect(out).not.toContain('replace-me');
  });
});
