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
      WITH parametros AS (
        SELECT empresa_id, COUNT(*)::int AS parametros_total
        FROM nomina_parametros_economicos
        GROUP BY empresa_id
      ),
      categorias AS (
        SELECT c.empresa_id, COUNT(*)::int AS categorias_total
        FROM nomina_categorias_salariales ncs
        JOIN contratos c ON c.id = ncs.contrato_id
        GROUP BY c.empresa_id
      ),
      periodos AS (
        SELECT c.empresa_id, COUNT(*)::int AS periodos_total, MAX(np.fecha_fin) AS ultimo_periodo_fin
        FROM nomina_periodos np
        JOIN contratos c ON c.id = np.contrato_id
        GROUP BY c.empresa_id
      ),
      empleados AS (
        SELECT c.empresa_id, COUNT(*)::int AS empleados_nomina_total
        FROM nomina_empleados ne
        JOIN nomina_periodos np ON np.id = ne.periodo_id
        JOIN contratos c ON c.id = np.contrato_id
        WHERE COALESCE(ne.activo, TRUE) = TRUE
        GROUP BY c.empresa_id
      )
      SELECT
        e.id::text AS empresa_id,
        e.nombre_empresa,
        e.nit,
        COALESCE(p.parametros_total, 0) AS parametros_total,
        COALESCE(ca.categorias_total, 0) AS categorias_total,
        COALESCE(pe.periodos_total, 0) AS periodos_total,
        pe.ultimo_periodo_fin::text AS ultimo_periodo_fin,
        COALESCE(em.empleados_nomina_total, 0) AS empleados_nomina_total
      FROM empresas e
      LEFT JOIN parametros p ON p.empresa_id = e.id
      LEFT JOIN categorias ca ON ca.empresa_id = e.id
      LEFT JOIN periodos pe ON pe.empresa_id = e.id
      LEFT JOIN empleados em ON em.empresa_id = e.id
      WHERE COALESCE(e.activo, TRUE) = TRUE
      ORDER BY empleados_nomina_total DESC, e.id ASC
    `
  );

  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
};

void main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exitCode = 1;
});
