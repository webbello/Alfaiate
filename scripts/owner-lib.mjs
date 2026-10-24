// SQL for the owner scripts. Values are validated first, then embedded; each statement sits on one line.
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const HASH = /^pbkdf2-sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/;

export function validateEmail(input) {
  const email = String(input).trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254 || email.startsWith('-'))
    throw new Error('Enter a valid email address.');
  return email;
}

export function validatePassword(input) {
  if (typeof input !== 'string' || input.length < 12 || input.length > 1024)
    throw new Error('The password must be 12 to 1024 characters.');
  return input;
}

function checked(email, hash) {
  if (!HASH.test(hash)) throw new Error('Unexpected hash format.');
  return [validateEmail(email), hash];
}

/** Creates the first owner. Inserts nothing when an active owner already exists; the script also checks and says so. */
export function buildCreateSql(emailInput, hashInput) {
  const [email, hash] = checked(emailInput, hashInput);
  return [
    `INSERT INTO admin_user (email, password_hash, role) SELECT '${email}', '${hash}', 'owner' WHERE NOT EXISTS (SELECT 1 FROM admin_user WHERE role = 'owner' AND is_active = 1);`,
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT id, 'user_created', 'admin_user', id FROM admin_user WHERE email = '${email}' AND password_hash = '${hash}';`,
  ].join('\n');
}

/** Replaces the password of an existing user, signs them out everywhere and audits it. */
export function buildResetSql(emailInput, hashInput) {
  const [email, hash] = checked(emailInput, hashInput);
  return [
    `UPDATE admin_user SET password_hash = '${hash}', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE email = '${email}';`,
    `DELETE FROM admin_session WHERE admin_user_id IN (SELECT id FROM admin_user WHERE email = '${email}');`,
    `INSERT INTO audit_log (admin_user_id, action, entity_type, entity_id) SELECT id, 'password_changed', 'admin_user', id FROM admin_user WHERE email = '${email}';`,
  ].join('\n');
}
