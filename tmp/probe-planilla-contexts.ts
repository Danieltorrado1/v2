import { dbPool } from '../src/config/db';

async function main() {
  const rows = await dbPool.query(`
    SELECT
      ne.id::text AS nomina_empleado_id,
      ne.vinculacion_id::text,
      p.numero_documento,
      CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS nombre,
      ff.municipio_id::text AS municipio_id,
      COALESCE(ff.municipio_texto, mu.nombre_municipio) AS municipio,
      ff.institucion_id::text AS institucion_id,
      COALESCE(ff.institucion_final, ins.nombre_institucion) AS institucion,
      ff.sede_id::text AS sede_id,
      COALESCE(ff.sede_final, se.nombre_sede) AS sede,
      ff.modalidad_id::text AS modalidad_id,
      COALESCE(mo.codigo_base, mo.codigo_original) AS modalidad_codigo,
      COALESCE(mo.nombre_modalidad, ff.modalidad_final) AS modalidad
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
      AND ne.id IN (766,697,265,524,606,539,194,396,481,560)
    ORDER BY ne.id
  `);
  console.log(JSON.stringify(rows.rows, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await dbPool.end(); });
