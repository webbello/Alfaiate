export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { uploadPhoto } from '../../../../modules/media/service';
import { VARIANTS, type Variant } from '../../../../modules/media/keys';
import { LIMITS } from '../../../../modules/media/validate';

/** One photo as three JPEG variants made by the browser. Everything is validated again here (SEC-04). */
export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'tailor.edit');
  if (auth instanceof Response) return auth;
  const form = await context.request.formData().catch(() => new FormData());
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const back = (code: string) =>
    context.redirect(`/admin/tailors/${id}?msg=${code}`, 303);

  const variants: Partial<Record<Variant, Uint8Array>> = {};
  for (const variant of VARIANTS) {
    const file = form.get(variant);
    if (!(file instanceof File)) return back('missing_variant');
    if (file.size > LIMITS[variant].maxBytes) return back('too_large'); // before reading it into memory
    variants[variant] = new Uint8Array(await file.arrayBuffer());
  }

  const result = await uploadPhoto(
    requireBindings(env),
    auth.userId,
    auth.role,
    id,
    {
      alt_text: form.get('alt_text')?.toString() ?? '',
      caption: form.get('caption')?.toString() || undefined,
      variants: variants as Record<Variant, Uint8Array>,
    },
  );
  if (result.ok) return back('uploaded');
  if (result.error === 'locked')
    return new Response('Forbidden', { status: 403 });
  if (result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  return back(result.error);
};
