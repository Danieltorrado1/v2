import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';

interface V4Row {
  categoria_final: string;
  cedula: string | null;
  fila_origen: number;
  subtipo_retiro: string | null;
}

interface V4Report {
  report_rows: V4Row[];
}

const main = async (): Promise<void> => {
  const report = JSON.parse(await readFile(path.resolve('reports/personal-meta26-dry-run-v4.json'), 'utf8')) as V4Report;
  const pending = report.report_rows.filter((row) => row.categoria_final === 'REVISAR');
  const documents = [...new Set(pending.map((row) => String(row.cedula ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()).filter(Boolean))];
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '60s'`);
    const countsBefore = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM personas) personas,
        (SELECT COUNT(*)::int FROM vinculaciones) vinculaciones,
        (SELECT COUNT(*)::int FROM cobertura_asignaciones) cobertura_asignaciones,
        (SELECT COUNT(*)::int FROM personal_asignaciones_laborales) personal_asignaciones_laborales,
        (SELECT COUNT(*)::int FROM personal_presentaciones_licitacion) personal_presentaciones_licitacion
    `);
    const people = await client.query(`
      SELECT UPPER(REGEXP_REPLACE(TRIM(pi.numero_documento), '[^0-9A-Za-z]+', '', 'g')) documento,
             td.codigo tipo_documento,
             p.id persona_id,
             CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) nombre_bd,
             p.fecha_nacimiento,
             v.id vinculacion_id,
             v.contrato_id,
             v.fecha_inicio,
             v.fecha_fin,
             v.estado_vinculacion,
             tv.codigo tipo_vinculacion,
             cc.nombre_cargo
      FROM persona_identificaciones pi
      JOIN personas p ON p.id = pi.persona_id
      JOIN tipos_documentos td ON td.id = pi.tipo_documento_id
      LEFT JOIN vinculaciones v ON v.persona_id = p.id
      LEFT JOIN tipos_vinculacion tv ON tv.id = v.tipo_vinculacion_id
      LEFT JOIN contrato_cargos cc ON cc.id = v.contrato_cargo_id
      WHERE pi.es_vigente = TRUE
        AND UPPER(REGEXP_REPLACE(TRIM(pi.numero_documento), '[^0-9A-Za-z]+', '', 'g')) = ANY($1::text[])
      ORDER BY documento, v.fecha_inicio DESC NULLS LAST, v.id DESC
    `, [documents]);
    const documentTypes = await client.query(`
      SELECT id, codigo, nombre_documento, es_identificacion_personal
      FROM tipos_documentos
      ORDER BY id
    `);
    const vincTypes = await client.query(`SELECT id, codigo, nombre_vinculacion FROM tipos_vinculacion ORDER BY id`);
    const cargos = await client.query(`
      SELECT cc.id, cc.nombre_cargo, cc.activo
      FROM contrato_cargos cc WHERE cc.contrato_id = 24 ORDER BY cc.id
    `);
    const locations = await client.query(`
      SELECT id, nombre_ubicacion, activo
      FROM contrato_ubicaciones_laborales WHERE contrato_id = 24 ORDER BY id
    `);
    const profiles = await client.query(`
      SELECT cpl.codigo_perfil, cpl.nombre_perfil, cpl.cantidad_requerida,
             cpl.contrato_cargo_equivalente_id, cc.nombre_cargo cargo_equivalente
      FROM contrato_perfiles_licitacion cpl
      LEFT JOIN contrato_cargos cc ON cc.id = cpl.contrato_cargo_equivalente_id
      WHERE cpl.contrato_id = 24 ORDER BY cpl.id
    `);
    const pendingPersonIds = [...new Set(people.rows.map((row) => Number(row.persona_id)).filter(Number.isFinite))];
    const coverageAssignments = pendingPersonIds.length === 0 ? { rows: [] } : await client.query(`
      SELECT ca.*, v.persona_id
      FROM cobertura_asignaciones ca JOIN vinculaciones v ON v.id = ca.vinculacion_id
      WHERE v.persona_id = ANY($1::bigint[]) ORDER BY ca.id
    `, [pendingPersonIds]);
    const laborAssignments = pendingPersonIds.length === 0 ? { rows: [] } : await client.query(`
      SELECT pal.*, v.persona_id
      FROM personal_asignaciones_laborales pal JOIN vinculaciones v ON v.id = pal.vinculacion_id
      WHERE v.persona_id = ANY($1::bigint[]) ORDER BY pal.id
    `, [pendingPersonIds]);
    const economicColumns = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name ILIKE '%caso%especial%' OR column_name ILIKE '%valor%' OR column_name ILIKE '%vigencia%')
        AND table_name IN ('personas', 'vinculaciones', 'nomina_empleados', 'personal_asignaciones_laborales')
      ORDER BY table_name, ordinal_position
    `);
    const countsAfter = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM personas) personas,
        (SELECT COUNT(*)::int FROM vinculaciones) vinculaciones,
        (SELECT COUNT(*)::int FROM cobertura_asignaciones) cobertura_asignaciones,
        (SELECT COUNT(*)::int FROM personal_asignaciones_laborales) personal_asignaciones_laborales,
        (SELECT COUNT(*)::int FROM personal_presentaciones_licitacion) personal_presentaciones_licitacion
    `);
    await client.query('ROLLBACK');
    const output = {
      total_filas_revisar: pending.length,
      filas_retiro: pending.filter((row) => row.subtipo_retiro).map((row) => row.fila_origen),
      people: people.rows,
      document_types: documentTypes.rows,
      vinc_types: vincTypes.rows,
      cargos: cargos.rows,
      locations: locations.rows,
      profiles: profiles.rows,
      coverage_assignments: coverageAssignments.rows,
      labor_assignments: laborAssignments.rows,
      economic_columns: economicColumns.rows,
      bd_before: countsBefore.rows[0],
      bd_after: countsAfter.rows[0],
      escrituras_bd: 0,
    };
    await writeFile(path.resolve('reports/personal-meta26-pendientes-auditoria.json'), JSON.stringify(output, null, 2), 'utf8');
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await dbPool.end();
  }
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
