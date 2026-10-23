import { ROLES } from './permissions';

export type UserRow = {
  id: number;
  email: string;
  role: string;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
};
export type UserFilter = {
  q?: string;
  role?: string;
  status?: 'active' | 'inactive';
};

/** A LIKE pattern that matches the text literally (D1 limits the pattern to 50 bytes; the text is cut first). */
const likePattern = (q: string) =>
  `%${q.slice(0, 20).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** The people list: a handful of staff, so no paging; search by email, filter by role and status. */
export async function listUsers(
  db: D1Database,
  filter: UserFilter = {},
): Promise<UserRow[]> {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const q = filter.q?.trim();
  if (q) {
    where.push("email LIKE ? ESCAPE '\\'");
    args.push(likePattern(q));
  }
  if (filter.role && (ROLES as readonly string[]).includes(filter.role)) {
    where.push('role = ?');
    args.push(filter.role);
  }
  if (filter.status) {
    where.push('is_active = ?');
    args.push(filter.status === 'active' ? 1 : 0);
  }
  const sql = `SELECT id, email, role, is_active, last_login_at, created_at FROM admin_user${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY is_active DESC, email LIMIT 200`;
  return (
    await db
      .prepare(sql)
      .bind(...args)
      .all<UserRow>()
  ).results;
}

export async function userCounts(db: D1Database) {
  const row = await db
    .prepare(
      'SELECT count(*) AS total, coalesce(sum(is_active), 0) AS active FROM admin_user',
    )
    .first<{ total: number; active: number }>();
  return { total: row?.total ?? 0, active: row?.active ?? 0 };
}

export function getUser(db: D1Database, id: number) {
  return db
    .prepare(
      'SELECT id, email, role, is_active, last_login_at, created_at FROM admin_user WHERE id = ?',
    )
    .bind(id)
    .first<UserRow>();
}

export type Activity = { action: string; at: string };

/** What this person did, newest first: action names and times only (the audit log holds ids, never customer data). */
export async function recentActivity(
  db: D1Database,
  id: number,
  limit = 12,
): Promise<Activity[]> {
  return (
    await db
      .prepare(
        'SELECT action, at FROM audit_log WHERE admin_user_id = ? ORDER BY id DESC LIMIT ?',
      )
      .bind(id, limit)
      .all<Activity>()
  ).results;
}
