import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

dotenv.config();

const ADMIN_EMAIL = 'admin@empiria.local';
const ADMIN_PASSWORD = 'Admin123456*';
const BCRYPT_SALT_ROUNDS = 10;

interface AdminUserRow extends QueryResultRow {
  authUserId: string;
  email: string;
  id: string;
  name: string | null;
}

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  return new Pool({
    connectionString: databaseUrl,
    ssl:
      databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
        ? { rejectUnauthorized: false }
        : false
  });
};

const loadAdminUser = async (client: PoolClient): Promise<AdminUserRow> => {
  const result = await client.query<AdminUserRow>(
    `
      SELECT
        u.id::text AS id,
        u.correo AS email,
        u.nombre_completo AS name,
        u.auth_user_id::text AS "authUserId"
      FROM usuarios u
      WHERE LOWER(u.correo) = LOWER($1)
      LIMIT 1
    `,
    [ADMIN_EMAIL]
  );

  const user = result.rows[0];

  if (!user) {
    throw new Error(`Usuario ${ADMIN_EMAIL} no encontrado en usuarios`);
  }

  if (!user.authUserId) {
    throw new Error(`Usuario ${ADMIN_EMAIL} no tiene auth_user_id asociado`);
  }

  return {
    ...user,
    authUserId: user.authUserId
  };
};

const ensureAuthUserExists = async (client: PoolClient, authUserId: string): Promise<void> => {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM auth.users
        WHERE id::text = $1
      ) AS exists
    `,
    [authUserId]
  );

  if (!result.rows[0]?.exists) {
    throw new Error(`Auth user ${authUserId} no existe en auth.users`);
  }
};

const resetAdminPassword = async (client: PoolClient, authUserId: string, adminName: string | null): Promise<void> => {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);

  await client.query(
    `
      UPDATE auth.users
      SET
        encrypted_password = $2,
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || $3::jsonb,
        updated_at = NOW()
      WHERE id::text = $1
    `,
    [
      authUserId,
      passwordHash,
      JSON.stringify({
        name: adminName
      })
    ]
  );
};

const main = async (): Promise<void> => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const adminUser = await loadAdminUser(client);
    await ensureAuthUserExists(client, adminUser.authUserId);
    await resetAdminPassword(client, adminUser.authUserId, adminUser.name);

    await client.query('COMMIT');

    console.log(`Password reset completed for ${adminUser.email}.`);
    console.log('New password configured successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Admin password reset failed.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
