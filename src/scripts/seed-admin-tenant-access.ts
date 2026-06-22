import dotenv from 'dotenv';
import { Pool } from 'pg';
import type { QueryResultRow } from 'pg';

dotenv.config();

interface UsuarioRow extends QueryResultRow {
  id: string;
}

interface RolRow extends QueryResultRow {
  id: string;
}

interface CountRow extends QueryResultRow {
  total: string;
}

const createPool = (): Pool => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const shouldUseSsl =
    databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.');

  return new Pool({
    connectionString: databaseUrl,
    ssl: shouldUseSsl ? { rejectUnauthorized: false } : false
  });
};

const main = async (): Promise<void> => {
  const pool = createPool();
  const client = await pool.connect();

  try {
    const adminUserResult = await client.query<UsuarioRow>(
      `
        SELECT id::text AS id
        FROM usuarios
        WHERE LOWER(correo) = LOWER($1)
        LIMIT 1
      `,
      ['admin@empiria.local']
    );

    const adminRoleResult = await client.query<RolRow>(
      `
        SELECT id::text AS id
        FROM roles
        WHERE nombre_rol = 'ADMINISTRADOR'
        LIMIT 1
      `
    );

    const adminUser = adminUserResult.rows[0];
    const adminRole = adminRoleResult.rows[0];

    if (!adminUser) {
      throw new Error('admin@empiria.local was not found in usuarios');
    }

    if (!adminRole) {
      throw new Error('ADMINISTRADOR role was not found');
    }

    const companyCountResult = await client.query<CountRow>(
      `SELECT COUNT(*)::text AS total FROM empresas`
    );
    const contractCountResult = await client.query<CountRow>(
      `SELECT COUNT(*)::text AS total FROM contratos`
    );

    console.log('Admin tenant access seed check completed successfully.');
    console.log(`Admin user ID: ${adminUser.id}`);
    console.log(`ADMINISTRADOR role ID: ${adminRole.id}`);
    console.log('ADMINISTRADOR tiene acceso global por rol');
    console.log(`Empresas detectadas: ${companyCountResult.rows[0]?.total ?? '0'}`);
    console.log(`Contratos detectados: ${contractCountResult.rows[0]?.total ?? '0'}`);
  } catch (error) {
    console.error('Admin tenant access seed failed.');
    console.error(error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

void main();
