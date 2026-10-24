import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { audit } from '../../src/modules/auth/audit';

const db = env.DB;

describe('audit', () => {
  it('appends a row with user, action, entity and time', async () => {
    const user = (
      await db
        .prepare(
          "INSERT INTO admin_user (email, password_hash, role) VALUES ('au@example.test', 'h', 'owner')",
        )
        .run()
    ).meta.last_row_id;
    await audit(db, {
      userId: user,
      action: 'role_changed',
      entityType: 'admin_user',
      entityId: 7,
    });
    const row = await db
      .prepare(
        "SELECT admin_user_id, action, entity_type, entity_id, created_at FROM audit_log WHERE action = 'role_changed'",
      )
      .first<Record<string, unknown>>();
    expect(row).toMatchObject({
      admin_user_id: user,
      action: 'role_changed',
      entity_type: 'admin_user',
      entity_id: 7,
    });
    expect(String(row?.created_at)).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('records a failed sign-in with no user and no identifying data', async () => {
    await audit(db, { userId: null, action: 'login_failed' });
    const row = await db
      .prepare(
        "SELECT admin_user_id, entity_type, entity_id FROM audit_log WHERE action = 'login_failed'",
      )
      .first();
    expect(row).toEqual({
      admin_user_id: null,
      entity_type: null,
      entity_id: null,
    });
  });

  it('has no column that could hold customer data (SEC-05, AC-15)', async () => {
    const cols = await db
      .prepare("SELECT name FROM pragma_table_info('audit_log')")
      .all<{ name: string }>();
    expect(cols.results.map((c) => c.name).sort()).toEqual([
      'action',
      'admin_user_id',
      'created_at',
      'entity_id',
      'entity_type',
      'id',
      'tailor_account_id', // an id only: which tailor acted (FR-TPO-08)
    ]);
  });
});
