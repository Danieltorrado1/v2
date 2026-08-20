import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';

const main = async () => {
  const rows = await dbPool.query(`
    SELECT p.fila_origen, p.id::text AS preliminar_id, p.estado_procesamiento,
      p.cupos_reportados AS preliminar_focalizacion, p.cobertura_requerida AS preliminar_cobertura,
      fv.id::text AS vigencia_id, fv.vigente_desde::text, fv.vigente_hasta::text,
      fv.focalizacion_total, fv.cobertura_requerida, fv.cobertura_estado,
      fv.regla_config_id::text, fv.valor_anterior_id::text, fv.origen,
      fv.carga_id::text, fv.created_by::text AS actor_id,
      mu.nombre_municipio AS municipio, i.nombre_institucion AS institucion,
      s.nombre_sede AS sede, s.id::text AS sede_id, m.codigo_original AS modalidad,
      ff.id::text AS final_id, ff.cupos_aprobados AS final_focalizacion,
      ff.cobertura_requerida AS final_cobertura, ff.cobertura_estado AS final_estado,
      ff.vigente_desde::text AS final_desde, ff.vigente_hasta::text AS final_hasta,
      ff.preliminar_id::text AS final_preliminar_id
    FROM focalizacion_preliminar p
    LEFT JOIN focalizacion_vigencias fv ON fv.id=p.focalizacion_vigencia_id
    LEFT JOIN focalizacion_final ff ON ff.preliminar_id=p.id
    LEFT JOIN municipios mu ON mu.id=fv.municipio_id
    LEFT JOIN instituciones i ON i.id=fv.institucion_id
    LEFT JOIN sedes s ON s.id=fv.sede_id
    LEFT JOIN modalidades m ON m.id=fv.modalidad_id
    WHERE p.carga_id=2
    ORDER BY p.fila_origen
  `);
  const checks = await dbPool.query(`SELECT
    (SELECT COUNT(*)::int FROM instituciones WHERE contrato_id=24) AS instituciones,
    (SELECT COUNT(*)::int FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=24) AS sedes,
    (SELECT COUNT(*)::int FROM sede_modalidades WHERE contrato_id=24) AS sede_modalidades,
    (SELECT COUNT(*)::int FROM focalizacion_preliminar WHERE carga_id=2) AS preliminares,
    (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE carga_id=2) AS vigencias,
    (SELECT COUNT(*)::int FROM focalizacion_final WHERE carga_id=2) AS finales,
    (SELECT COUNT(*)::int FROM focalizacion_vigencias fv LEFT JOIN sedes s ON s.id=fv.sede_id LEFT JOIN modalidades m ON m.id=fv.modalidad_id LEFT JOIN instituciones i ON i.id=fv.institucion_id WHERE fv.carga_id=2 AND (s.id IS NULL OR m.id IS NULL OR i.id IS NULL)) AS vigencias_huerfanas,
    (SELECT COUNT(*)::int FROM focalizacion_final ff LEFT JOIN sede_modalidades sm ON sm.id=ff.sede_modalidad_id LEFT JOIN sedes s ON s.id=ff.sede_id LEFT JOIN modalidades m ON m.id=ff.modalidad_id WHERE ff.carga_id=2 AND (sm.id IS NULL OR s.id IS NULL OR m.id IS NULL)) AS finales_huerfanos,
    (SELECT COUNT(*)::int FROM (SELECT contrato_id,sede_id,modalidad_id,vigente_desde,COUNT(*) FROM focalizacion_vigencias WHERE carga_id=2 GROUP BY 1,2,3,4 HAVING COUNT(*)>1) d) AS duplicados_vigencia,
    (SELECT COUNT(*)::int FROM (SELECT contrato_id,sede_modalidad_id,COUNT(*) FROM focalizacion_final WHERE contrato_id=24 GROUP BY 1,2 HAVING COUNT(*)>1) d) AS duplicados_final,
    (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE carga_id=2 AND contrato_id<>24) AS contrato_incorrecto,
    (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE carga_id=2 AND regla_config_id IS NULL) AS reglas_faltantes,
    (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE carga_id=2 AND valor_anterior_id IS NOT NULL) AS con_valor_anterior
  `);
  const result = { carga_id: 2, checks: checks.rows[0], rows: rows.rows };
  await writeFile(path.resolve('reports/focalizacion-smoke-postcheck.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify(result, null, 2));
  await dbPool.end();
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
