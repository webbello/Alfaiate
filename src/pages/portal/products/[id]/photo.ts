export const prerender = false;
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { photosEnabled, requireBindings } from '../../../../modules/config';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { parseId, readForm, UPLOAD_LIMIT } from '../../../../modules/http/body';
import { VARIANTS, type Variant } from '../../../../modules/media/keys';
import { LIMITS } from '../../../../modules/media/validate';
import { requireTailor } from '../../../../modules/portal/require';
import { TAILOR_COOKIE } from '../../../../modules/portal/session';
import { uploadOwnProductPhoto } from '../../../../modules/shop/portal-products';

/** One photo of the signed-in tailor's own product, as three browser-made JPEGs validated again here (SEC-04). The tailor id is the session's. */
export const POST: APIRoute = async (context) => {
  const auth = await requireTailor(context);
  if (auth instanceof Response) return auth;
  const { form, tooLarge } = await readForm(context.request, UPLOAD_LIMIT);
  if (tooLarge) return new Response('Payload too large', { status: 413 });
  if (
    !(await verifyCsrf(
      context.cookies.get(TAILOR_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  )
    return new Response('Forbidden', { status: 403 });
  const id = parseId(context.params.id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const back = (code: string) =>
    context.redirect(`/portal/products/${id}?msg=${code}`, 303);
  if (!photosEnabled(env)) return back('photos_off'); // free-plan mode: no photo storage bound
  const variants: Partial<Record<Variant, Uint8Array>> = {};
  for (const variant of VARIANTS) {
    const file = form.get(variant);
    if (!(file instanceof File)) return back('missing_variant');
    if (file.size > LIMITS[variant].maxBytes) return back('too_large');
    variants[variant] = new Uint8Array(await file.arrayBuffer());
  }
  const result = await uploadOwnProductPhoto(requireBindings(env), auth, id, {
    alt_text: form.get('alt_text')?.toString() ?? '',
    confirmed: form.get('confirm')?.toString() === 'yes',
    variants: variants as Record<Variant, Uint8Array>,
  });
  if (!result.ok && result.error === 'not_found')
    return new Response('Not found', { status: 404 });
  return back(result.ok ? 'uploaded' : result.error);
};
