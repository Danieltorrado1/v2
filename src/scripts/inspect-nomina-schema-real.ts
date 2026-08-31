import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config(process.env.ENV_FILE?.trim() ? { path: process.env.ENV_FILE.trim() } : undefined);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const TABLES = [
  'empresas',
  'contratos',
  'vinculaciones',
  'nomina_periodos',
  'nomina_empleados',
  'nomina_categorias_salariales',
  'nomina_parametros_economicos',
  'nomina_desprendibles',
  'documentos_persona',
  'nomina_novedades',
  'nomina_novedad_turnos',
  'roles',
  'permisos',
  'rol_permisos',
  'usuario_roles',
  'tipos_documentos'
];

const main = async (): Promise<void> => {
  const result = await pool.query(
    `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position
    `,
    [TABLES]
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
