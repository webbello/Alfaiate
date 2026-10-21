import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../config';
import {
  TAILOR_COOKIE,
  validateTailorSession,
  type TailorSession,
} from './session';

type Context = Pick<APIContext, 'cookies' | 'redirect'>;

/**
 * Every portal page and handler starts with this, like `requirePermission` for staff:
 *   const auth = await requireTailor(Astro);
 *   if (auth instanceof Response) return auth;
 * Anonymous (or a staff cookie, which is not a tailor session) goes to the portal sign-in. `auth.tailorId` is the only tailor id to use.
 */
export async function requireTailor(
  ctx: Context,
): Promise<TailorSession | Response> {
  const token = ctx.cookies.get(TAILOR_COOKIE)?.value;
  const session = token
    ? await validateTailorSession(requireBindings(env).DB, token)
    : null;
  return session ?? ctx.redirect('/portal/login', 302);
}
