export type AccountState = {
  accountId: number;
  email: string | null;
  isActive: boolean;
  consentAt: string | null;
  lastLoginAt: string | null;
};

/** What the owner sees on a tailor's page: no account yet, waiting for the tailor to accept the invite, or active. Never the password hash. */
export async function getAccountState(
  db: D1Database,
  tailorId: number,
): Promise<AccountState | null> {
  const row = await db
    .prepare(
      'SELECT id, email, is_active, consent_at, last_login_at FROM tailor_account WHERE tailor_id = ?',
    )
    .bind(tailorId)
    .first<{
      id: number;
      email: string | null;
      is_active: number;
      consent_at: string | null;
      last_login_at: string | null;
    }>();
  return row
    ? {
        accountId: row.id,
        email: row.email,
        isActive: row.is_active === 1,
        consentAt: row.consent_at,
        lastLoginAt: row.last_login_at,
      }
    : null;
}
