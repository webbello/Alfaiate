// Security headers for every response (SEC-08) and indexing/caching rules for /admin (SEC-06).
const CSP = [
  "default-src 'self'",
  "img-src 'self'",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function isAdminPath(pathname: string): boolean {
  let path = pathname;
  try {
    path = decodeURIComponent(pathname); // the router decodes %61dmin, so this must too
  } catch {
    // an undecodable path cannot match a route; fall through with the raw value
  }
  path = path.toLowerCase();
  return path === '/admin' || path.startsWith('/admin/');
}

/** Returns a copy with the headers applied (the original may have immutable headers, e.g. a redirect). */
export function applySecurityHeaders(
  response: Response,
  pathname: string,
  indexable: boolean,
): Response {
  const result = new Response(response.body, response);
  const h = result.headers;
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000');
  h.set('X-Frame-Options', 'DENY');
  h.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
  const admin = isAdminPath(pathname);
  // /admin is never indexed; when the whole site is not indexable (staging) nothing is.
  if (admin || !indexable) h.set('X-Robots-Tag', 'noindex, nofollow');
  // Admin pages, and anything that sets a cookie (a session) whatever its path, must not be cached.
  if (admin || h.has('Set-Cookie')) h.set('Cache-Control', 'no-store');
  return result;
}
