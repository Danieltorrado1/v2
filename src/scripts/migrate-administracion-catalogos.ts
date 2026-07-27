import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const main = async (): Promise<void> => {
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
    await client.query(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`ALTER TABLE contratos ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);
    await client.query(`UPDATE empresas SET activo = TRUE WHERE activo IS NULL`);
    await client.query(`UPDATE contratos SET activo = TRUE WHERE activo IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_empresas_activo_nombre ON empresas (activo, nombre_empresa)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_contratos_empresa_activo ON contratos (empresa_id, activo, fecha_inicio)`);
    await client.query('COMMIT');
    console.log('Administracion catalogos migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('Administracion catalogos migration failed.');
  console.error(error);
  process.exitCode = 1;
});
