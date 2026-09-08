import { dbPool } from '../config/db';

async function main(): Promise<void> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query<{ assignments: string }>(`
      SELECT COUNT(DISTINCT (nru.usuario_id, nru.empresa_id, nrm.municipio_id))::text AS assignments
      FROM nomina_responsabilidades_usuario nru
      JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id = nru.id
      WHERE nru.proceso = 'COBERTURA' AND nru.activo = TRUE
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS usuario_municipio_visibilidad (
        id BIGSERIAL PRIMARY KEY,
        usuario_id BIGINT NOT NULL REFERENCES usuarios(id),
        empresa_id BIGINT NOT NULL REFERENCES empresas(id),
        municipio_id BIGINT NOT NULL REFERENCES municipios(id),
        vigencia_desde DATE NOT NULL DEFAULT CURRENT_DATE,
        vigencia_hasta DATE NULL,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_by_user_id BIGINT NULL REFERENCES usuarios(id),
        updated_by_user_id BIGINT NULL REFERENCES usuarios(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (usuario_id, empresa_id, municipio_id)
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_usuario_municipio_visibilidad_lookup
      ON usuario_municipio_visibilidad (usuario_id, empresa_id, municipio_id, activo)
    `);
    // Conservador: todo municipio actualmente asignado para COBERTURA también
    // queda visible; no se inventan municipios adicionales.
    await client.query(`
      INSERT INTO usuario_municipio_visibilidad (usuario_id, empresa_id, municipio_id)
      SELECT DISTINCT nru.usuario_id, nru.empresa_id, nrm.municipio_id
      FROM nomina_responsabilidades_usuario nru
      JOIN nomina_responsabilidad_municipios nrm
        ON nrm.responsabilidad_id = nru.id
      WHERE nru.proceso = 'COBERTURA' AND nru.activo = TRUE
      ON CONFLICT (usuario_id, empresa_id, municipio_id) DO NOTHING
    `);
    const after = await client.query<{ rows: string; migrated: string }>(`
      SELECT
        COUNT(*)::text AS rows,
        COUNT(*) FILTER (WHERE (usuario_id, empresa_id, municipio_id) IN (
          SELECT DISTINCT nru.usuario_id, nru.empresa_id, nrm.municipio_id
          FROM nomina_responsabilidades_usuario nru
          JOIN nomina_responsabilidad_municipios nrm ON nrm.responsabilidad_id = nru.id
          WHERE nru.proceso = 'COBERTURA' AND nru.activo = TRUE
        ))::text AS migrated
      FROM usuario_municipio_visibilidad
      WHERE activo = TRUE
    `);
    await client.query('COMMIT');
    console.log(JSON.stringify({
      migration: 'municipal-visibility-scope',
      before_nomina_assignments: Number(before.rows[0]?.assignments ?? 0),
      after_active_visibility_rows: Number(after.rows[0]?.rows ?? 0),
      active_nomina_assignments_visible: Number(after.rows[0]?.migrated ?? 0)
    }));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error('Municipal visibility scope migration failed.');
  console.error(error);
  process.exitCode = 1;
});
