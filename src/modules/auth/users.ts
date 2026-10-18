import type { Role } from './permissions';

export class LastOwnerError extends Error {}

// Each change is one statement, so a concurrent request cannot slip past the "last active owner" check.
const LAST_ACTIVE_OWNER = `role = 'owner' AND is_active = 1 AND (SELECT count(*) FROM admin_user WHERE role = 'owner' AND is_active = 1) <= 1`;
const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

async function guardedUpdate(
  db: D1Database,
  sql: string,
  value: string | number,
  id: number,
) {
  const result = await db.prepare(sql).bind(value, id).run();
  if (result.meta.changes > 0) return;
  const exists = await db
    .prepare('SELECT 1 FROM admin_user WHERE id = ?')
    .bind(id)
    .first();
  throw exists
    ? new LastOwnerError(
        'The last active owner cannot be demoted or deactivated',
      )
    : new Error('User not found');
}

export function setRole(db: D1Database, id: number, role: Role) {
  const sql = `UPDATE admin_user SET role = ?1, updated_at = ${NOW} WHERE id = ?2 AND NOT (${LAST_ACTIVE_OWNER} AND ?1 <> 'owner')`;
  return guardedUpdate(db, sql, role, id);
}

export function setActive(db: D1Database, id: number, active: boolean) {
  const sql = `UPDATE admin_user SET is_active = ?1, updated_at = ${NOW} WHERE id = ?2 AND NOT (${LAST_ACTIVE_OWNER} AND ?1 = 0)`;
  return guardedUpdate(db, sql, active ? 1 : 0, id);
}
