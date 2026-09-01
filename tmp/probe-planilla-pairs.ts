import { dbPool } from '../src/config/db';

async function main() {
  const pairings = await dbPool.query(`
    WITH base AS (
      SELECT
        ne.id::text AS nomina_empleado_id,
        ne.vinculacion_id::text AS vinculacion_id,
        p.numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre,
        ff.municipio_id::text AS municipio_id,
        COALESCE(ff.municipio_texto, mu.nombre_municipio) AS municipio,
        ff.institucion_id::text AS institucion_id,
        COALESCE(ff.institucion_final, ins.nombre_institucion) AS institucion,
        ff.sede_id::text AS sede_id,
        COALESCE(ff.sede_final, se.nombre_sede) AS sede,
        COALESCE(mo.codigo_base, mo.codigo_original) AS modalidad_codigo
      FROM nomina_empleados ne
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      LEFT JOIN LATERAL (
        SELECT ca1.focalizacion_final_id
        FROM cobertura_asignaciones ca1
        WHERE ca1.vinculacion_id = v.id
          AND COALESCE(ca1.activo, TRUE) = TRUE
          AND ca1.fecha_inicio <= np.fecha_fin
          AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= np.fecha_inicio)
        ORDER BY ca1.fecha_inicio DESC, ca1.id DESC
        LIMIT 1
      ) ca ON TRUE
      LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
      LEFT JOIN municipios mu ON mu.id = ff.municipio_id
      LEFT JOIN instituciones ins ON ins.id = ff.institucion_id
      LEFT JOIN sedes se ON se.id = ff.sede_id
      LEFT JOIN modalidades mo ON mo.id = ff.modalidad_id
      WHERE np.id = 2
        AND COALESCE(ne.activo, TRUE) = TRUE
        AND ff.institucion_id IS NOT NULL
        AND ff.sede_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM nomina_novedades nn
          WHERE nn.nomina_empleado_id = ne.id
            AND COALESCE(nn.activo, TRUE) = TRUE
            AND COALESCE(nn.fecha_inicio, np.fecha_inicio) <= DATE '2026-08-27'
            AND COALESCE(nn.fecha_fin, nn.fecha_inicio, np.fecha_fin) >= DATE '2026-08-25'
        )
    )
    SELECT
      titular.nomina_empleado_id AS titular_nomina_empleado_id,
      titular.vinculacion_id AS titular_vinculacion_id,
      titular.numero_documento AS titular_documento,
      titular.nombre AS titular_nombre,
      titular.municipio,
      titular.institucion,
      titular.sede,
      titular.modalidad_codigo,
      reemplazo.nomina_empleado_id AS reemplazo_nomina_empleado_id,
      reemplazo.vinculacion_id AS reemplazo_vinculacion_id,
      reemplazo.numero_documento AS reemplazo_documento,
      reemplazo.nombre AS reemplazo_nombre
    FROM base titular
    INNER JOIN base reemplazo
      ON reemplazo.nomina_empleado_id <> titular.nomina_empleado_id
     AND reemplazo.municipio_id = titular.municipio_id
     AND reemplazo.institucion_id = titular.institucion_id
     AND reemplazo.sede_id = titular.sede_id
    ORDER BY titular.nombre, reemplazo.nombre
    LIMIT 20
  `);

  const caares = await dbPool.query(`
    WITH base AS (
      SELECT
        ne.id::text AS nomina_empleado_id,
        ne.vinculacion_id::text,
        p.numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre,
        ff.institucion_id::text AS institucion_id,
        COALESCE(ff.institucion_final, ins.nombre_institucion) AS institucion,
        ff.sede_id::text AS sede_id,
        COALESCE(ff.sede_final, se.nombre_sede) AS sede,
        COALESCE(mo.codigo_base, mo.codigo_original) AS modalidad_codigo,
        COALESCE(v.estado_vinculacion, '') AS estado_vinculacion,
        COALESCE(cc.aplica_cobertura, FALSE) AS aplica_cobertura
      FROM nomina_empleados ne
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN personas p ON p.id = v.persona_id
      INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
      LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      LEFT JOIN LATERAL (
        SELECT ca1.focalizacion_final_id
        FROM cobertura_asignaciones ca1
        WHERE ca1.vinculacion_id = v.id
          AND COALESCE(ca1.activo, TRUE) = TRUE
          AND ca1.fecha_inicio <= np.fecha_fin
          AND (ca1.fecha_fin IS NULL OR ca1.fecha_fin >= np.fecha_inicio)
        ORDER BY ca1.fecha_inicio DESC, ca1.id DESC
        LIMIT 1
      ) ca ON TRUE
      LEFT JOIN focalizacion_final ff ON ff.id = ca.focalizacion_final_id
      LEFT JOIN instituciones ins ON ins.id = ff.institucion_id
      LEFT JOIN sedes se ON se.id = ff.sede_id
      LEFT JOIN modalidades mo ON mo.id = ff.modalidad_id
      WHERE np.id = 2
        AND COALESCE(ne.activo, TRUE) = TRUE
    )
    SELECT
      nomina_empleado_id,
      vinculacion_id,
      numero_documento,
      nombre,
      institucion,
      sede,
      modalidad_codigo,
      COUNT(*) OVER (PARTITION BY institucion_id, sede_id) AS institucion_sede_count
    FROM base
    WHERE modalidad_codigo = 'CAARES'
      AND aplica_cobertura = TRUE
      AND estado_vinculacion IN ('ACTIVA', 'ACTIVO')
      AND institucion_id IS NOT NULL
      AND sede_id IS NOT NULL
    ORDER BY institucion_sede_count ASC, nombre ASC
    LIMIT 20
  `);

  console.log(JSON.stringify({ pairings: pairings.rows, caares: caares.rows }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await dbPool.end(); });
