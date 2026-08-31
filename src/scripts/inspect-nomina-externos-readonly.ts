import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config(process.env.ENV_FILE?.trim() ? { path: process.env.ENV_FILE.trim() } : undefined);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const main = async (): Promise<void> => {
  const result = await pool.query(
    `
      SELECT
        (SELECT COUNT(*)::int FROM cobertura_externos WHERE COALESCE(activo, TRUE) = TRUE) AS externos_activos,
        (SELECT COUNT(*)::int FROM cobertura_cuentas_cobro_externas WHERE COALESCE(activo, TRUE) = TRUE) AS cuentas_cobro_activas,
        (SELECT COUNT(*)::int FROM cobertura_cuenta_cobro_externa_detalle WHERE COALESCE(activo, TRUE) = TRUE) AS cuentas_cobro_detalles,
        (SELECT COUNT(*)::int FROM nomina_novedad_turnos WHERE externo_id IS NOT NULL AND COALESCE(activo, TRUE) = TRUE) AS turnos_externos,
        (SELECT COUNT(*)::int FROM nomina_movimientos WHERE externo_id IS NOT NULL AND COALESCE(activo, TRUE) = TRUE) AS movimientos_externos,
        (SELECT COUNT(*)::int FROM cobertura_externo_documentos WHERE COALESCE(activo, TRUE) = TRUE) AS documentos_externos
    `
  );

  console.log(JSON.stringify(result.rows[0] ?? null, null, 2));
  await pool.end();
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
