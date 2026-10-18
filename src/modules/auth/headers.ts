// Security headers for every response (SEC-08) and indexing/caching rules for /admin (SEC-06).
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "script-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const isAdminPath = (pathname: string) =>
  pathname === '/admin' || pathname.startsWith('/admin/');

/** Returns a copy with the headers applied (the original may have immutable headers, e.g. a redirect). */
export function applySecurityHeaders(
  response: Response,
  pathname: string,
): Response {
  const result = new Response(response.body, response);
  const h = result.headers;
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Strict-Transport-Security', 'max-age=31536000');
  h.set('X-Frame-Options', 'DENY');
  if (isAdminPath(pathname)) {
    h.set('X-Robots-Tag', 'noindex, nofollow');
    h.set('Cache-Control', 'no-store');
  }
  return result;
}
