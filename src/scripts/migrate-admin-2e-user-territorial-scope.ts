import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const SCOPE_SELECTED = 'PERSONAL_SELECCIONADO';
const SCOPE_ALL = 'TODO_MUNICIPIO';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not defined');
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase.com') || databaseUrl.includes('pooler.')
      ? { rejectUnauthorized: false }
      : false
  });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      ALTER TABLE gestor_municipio_asignaciones
      ADD COLUMN IF NOT EXISTS alcance_personal text
    `);

    await client.query(
      `UPDATE gestor_municipio_asignaciones
       SET alcance_personal = $1
       WHERE alcance_personal IS NULL`,
      [SCOPE_SELECTED]
    );

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'gestor_municipio_asignaciones_alcance_personal_check'
        ) THEN
          ALTER TABLE gestor_municipio_asignaciones
          ADD CONSTRAINT gestor_municipio_asignaciones_alcance_personal_check
          CHECK (alcance_personal IN ('PERSONAL_SELECCIONADO', 'TODO_MUNICIPIO'));
        END IF;
      END$$;
    `);

    await client.query(`
      ALTER TABLE gestor_municipio_asignaciones
      ALTER COLUMN alcance_personal SET DEFAULT 'PERSONAL_SELECCIONADO'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_gma_scope_lookup
      ON gestor_municipio_asignaciones (contrato_id, usuario_id, municipio_id, activo, alcance_personal)
    `);

    await client.query('COMMIT');
    console.log(`ADMIN-2E territorial scope migration completed. Modes: ${SCOPE_SELECTED}, ${SCOPE_ALL}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main().catch((error) => {
  console.error('ADMIN-2E territorial scope migration failed.');
  console.error(error);
  process.exitCode = 1;
});
