import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../config/db';
import { normalizeFocalizacionText } from '../modules/cobertura/cobertura.focalizacion.domain';

const CONTRACT_ID = '24';
const HASH = '6f55c28567d7dd2f9f92182f90f89398f3769b00dbcfbedac19c8ec604422719';
const query = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> => (await client.query<T>(sql, params)).rows;

const main = async () => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const contract = (await query(client, `SELECT c.id::text,c.empresa_id::text,e.nombre_empresa FROM contratos c JOIN empresas e ON e.id=c.empresa_id WHERE c.id=$1::bigint`, [CONTRACT_ID]))[0];
    const counts = (await query(client, `SELECT
      (SELECT COUNT(*)::int FROM instituciones WHERE contrato_id=$1::bigint) instituciones,
      (SELECT COUNT(*)::int FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=$1::bigint) sedes,
      (SELECT COUNT(*)::int FROM sede_modalidades WHERE contrato_id=$1::bigint) sede_modalidades,
      (SELECT COUNT(*)::int FROM instituciones_identidad_historial h JOIN instituciones i ON i.id=h.institucion_id WHERE i.contrato_id=$1::bigint) instituciones_historial,
      (SELECT COUNT(*)::int FROM sedes_identidad_historial h JOIN sedes s ON s.id=h.sede_id JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=$1::bigint) sedes_historial,
      (SELECT COUNT(*)::int FROM sede_institucion_historial h JOIN sedes s ON s.id=h.sede_id JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=$1::bigint) sede_institucion_historial`, [CONTRACT_ID]))[0];
    const integrity = (await query(client, `SELECT
      (SELECT COUNT(*)::int FROM instituciones i LEFT JOIN municipios m ON m.id=i.municipio_id WHERE i.contrato_id=$1::bigint AND m.id IS NULL) instituciones_huerfanas,
      (SELECT COUNT(*)::int FROM sedes s LEFT JOIN instituciones i ON i.id=s.institucion_id WHERE i.id IS NULL) sedes_huerfanas,
      (SELECT COUNT(*)::int FROM sede_modalidades sm LEFT JOIN sedes s ON s.id=sm.sede_id WHERE sm.contrato_id=$1::bigint AND s.id IS NULL) relaciones_sin_sede,
      (SELECT COUNT(*)::int FROM sede_modalidades sm LEFT JOIN modalidades m ON m.id=sm.modalidad_id WHERE sm.contrato_id=$1::bigint AND m.id IS NULL) relaciones_sin_modalidad,
      (SELECT COUNT(*)::int FROM sede_modalidades sm JOIN sedes s ON s.id=sm.sede_id JOIN instituciones i ON i.id=s.institucion_id WHERE sm.contrato_id=$1::bigint AND i.contrato_id<>$1::bigint) relaciones_contrato_incorrecto,
      (SELECT COUNT(*)::int FROM (SELECT s.institucion_id,COALESCE(s.consecutivo_dane,s.consecutivo_sede,s.codigo_dane) clave,COUNT(*) FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=$1::bigint GROUP BY s.institucion_id,COALESCE(s.consecutivo_dane,s.consecutivo_sede,s.codigo_dane) HAVING COUNT(*)>1) d) sedes_duplicadas,
      (SELECT COUNT(*)::int FROM (SELECT sede_id,modalidad_id,contrato_id,COUNT(*) FROM sede_modalidades WHERE contrato_id=$1::bigint GROUP BY sede_id,modalidad_id,contrato_id HAVING COUNT(*)>1) d) relaciones_duplicadas`, [CONTRACT_ID]))[0];
    const institutions = await query<{ id: string; municipio_id: string; nombre_institucion: string }>(client, `SELECT id::text,municipio_id::text,nombre_institucion FROM instituciones WHERE contrato_id=$1::bigint`, [CONTRACT_ID]);
    const institutionKeys = institutions.map((row) => `${row.municipio_id}|${normalizeFocalizacionText(row.nombre_institucion)}`);
    const duplicates = institutionKeys.length - new Set(institutionKeys).size;
    const historyIntegrity = (await query(client, `SELECT
      (SELECT COUNT(*)::int FROM instituciones_identidad_historial h LEFT JOIN instituciones i ON i.id=h.institucion_id WHERE i.id IS NULL) instituciones_historial_huerfano,
      (SELECT COUNT(*)::int FROM sedes_identidad_historial h LEFT JOIN sedes s ON s.id=h.sede_id WHERE s.id IS NULL) sedes_historial_huerfano,
      (SELECT COUNT(*)::int FROM sede_institucion_historial h LEFT JOIN sedes s ON s.id=h.sede_id LEFT JOIN instituciones i ON i.id=h.institucion_id WHERE s.id IS NULL OR i.id IS NULL) relaciones_historial_huerfanas`, []))[0];
    const homonyms = await query(client, `SELECT m.nombre_municipio,i.nombre_institucion,s.nombre_sede,s.id::text sede_id FROM sedes s JOIN instituciones i ON i.id=s.institucion_id JOIN municipios m ON m.id=s.municipio_id WHERE i.contrato_id=$1::bigint AND ((i.nombre_institucion ILIKE '%GABRIELA MISTRAL%' AND s.nombre_sede ILIKE '%PRINCIPAL%') OR (i.nombre_institucion ILIKE '%LUIS CARLOS GALAN%' AND s.nombre_sede ILIKE '%PRINCIPAL%') OR (i.nombre_institucion ILIKE '%JOSE ANTONIO GALAN%' AND s.nombre_sede ILIKE '%PRINCIPAL%') OR (i.nombre_institucion ILIKE '%SIMON BOLIVAR%' AND s.nombre_sede ILIKE '%PRINCIPAL%') OR (i.nombre_institucion ILIKE '%JORGE ELIECER GAITAN%' AND s.nombre_sede ILIKE '%PRINCIPAL%') OR (i.nombre_institucion ILIKE '%RAFAEL URIBE URIBE%' AND s.nombre_sede ILIKE '%PRINCIPAL%')) ORDER BY i.nombre_institucion,m.nombre_municipio`, [CONTRACT_ID]);
    const corrected = await query(client, `SELECT m.nombre_municipio,i.nombre_institucion,s.nombre_sede,COALESCE(s.consecutivo_dane,s.consecutivo_sede,s.codigo_dane) consecutivo,s.id::text sede_id FROM sedes s JOIN instituciones i ON i.id=s.institucion_id JOIN municipios m ON m.id=s.municipio_id WHERE i.contrato_id=$1::bigint AND COALESCE(s.consecutivo_dane,s.consecutivo_sede,s.codigo_dane)=ANY($2::text[]) ORDER BY consecutivo`, [CONTRACT_ID,['25035000005127','25035000005128','15032500025409','15032500025410']]);
    const audit = (await query(client, `SELECT id::text,usuario_id::text,empresa_id::text,contrato_id::text,entidad,accion,fecha_evento,datos_nuevos FROM auditoria_eventos WHERE entidad='bootstrap_maestros' AND accion='BOOTSTRAP_MAESTROS_APPLY' AND contrato_id=$1::bigint AND entidad_id=$2 ORDER BY fecha_evento DESC LIMIT 1`, [CONTRACT_ID,HASH]))[0] ?? null;
    const report = { mode: 'READ_ONLY_POSTCHECK', contract, counts, integrity: { ...integrity, instituciones_duplicadas: duplicates }, history_integrity: historyIntegrity, homonyms, corrected_consecutivos: corrected, audit };
    console.log(JSON.stringify(report, null, 2));
    await writeFile(path.resolve('reports/cobertura-bootstrap-postcheck.json'), JSON.stringify(report, null, 2), 'utf8');
    await client.query('ROLLBACK');
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { client.release(); await dbPool.end(); }
};

main().catch((error: unknown) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
