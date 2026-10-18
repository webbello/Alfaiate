import { can } from './permissions';
import { validateSession, type Session } from './session';

export type AuthResult =
  | { status: 'ok'; session: Session }
  | { status: 'anonymous' }
  | { status: 'forbidden' };

/** Deny by default: no valid session -> anonymous; session without the permission (or an unmapped one) -> forbidden. */
export async function authorize(
  db: D1Database,
  token: string | undefined,
  permission: string,
): Promise<AuthResult> {
  const session = token ? await validateSession(db, token) : null;
  if (!session) return { status: 'anonymous' };
  return can(session.role, permission)
    ? { status: 'ok', session }
    : { status: 'forbidden' };
}
