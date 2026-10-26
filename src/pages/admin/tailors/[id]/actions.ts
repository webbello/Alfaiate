export const prerender = false;
import { rememberTab } from '../../../../modules/admin-ui/tabs';
import { readForm, parseId } from '../../../../modules/http/body';
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { requireBindings } from '../../../../modules/config';
import { requirePermission } from '../../../../modules/auth/require';
import { verifyCsrf } from '../../../../modules/auth/csrf';
import { SESSION_COOKIE } from '../../../../modules/auth/session';
import { listEntries } from '../../../../modules/catalog';
import { updateProfile } from '../../../../modules/tailors/repo';
import { setAreas, setCategories } from '../../../../modules/tailors/links';
import { addNote } from '../../../../modules/tailors/notes';
import {
  areasFromForm,
  categoriesFromForm,
  profileFromForm,
} from '../../../../modules/tailors/form';

export const POST: APIRoute = async (context) => {
  const auth = await requirePermission(context, 'tailor.edit');
  if (auth instanceof Response) return auth;
  const form = (await readForm(context.request)).form;
  if (
    !(await verifyCsrf(
      context.cookies.get(SESSION_COOKIE)?.value ?? '',
      form.get('csrf')?.toString(),
    ))
  ) {
    return new Response('Forbidden', { status: 403 });
  }

  const id = parseId(context.params.id);
  if (!Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const { DB } = requireBindings(env);
  // the page reopens on the tab this change was made on
  rememberTab(
    context.cookies,
    (
      {
        save_profile: 'details',
        save_categories: 'work',
        save_areas: 'work',
        add_note: 'more',
      } as const
    )[form.get('action')?.toString() ?? ''] ?? 'details',
  );
  const back = (code: string, extra = '') =>
    context.redirect(`/admin/tailors/${id}?msg=${code}${extra}`, 303);
  const result = (
    r: { ok: true } | { ok: false; error: string; fields?: string[] },
    success = 'saved',
  ) => {
    if (r.ok) return back(success);
    if (r.error === 'locked') return new Response('Forbidden', { status: 403 });
    if (r.error === 'not_found')
      return new Response('Not found', { status: 404 });
    return back(
      r.error,
      r.fields?.length ? `&fields=${r.fields.join(',')}` : '',
    );
  };

  switch (form.get('action')?.toString()) {
    case 'save_profile':
      return result(
        await updateProfile(
          DB,
          auth.userId,
          auth.role,
          id,
          profileFromForm(form),
        ),
      );
    case 'save_categories': {
      const ids = (await listEntries(DB, 'category')).map((c) => c.id);
      return result(
        await setCategories(
          DB,
          auth.userId,
          auth.role,
          id,
          categoriesFromForm(form, ids),
        ),
      );
    }
    case 'save_areas': {
      const ids = (await listEntries(DB, 'area')).map((a) => a.id);
      return result(
        await setAreas(
          DB,
          auth.userId,
          auth.role,
          id,
          areasFromForm(form, ids),
        ),
      );
    }
    case 'add_note':
      return result(
        await addNote(DB, auth.userId, id, form.get('body')?.toString() ?? ''),
        'added',
      );
    default:
      return back('invalid');
  }
};
