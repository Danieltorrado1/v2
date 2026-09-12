import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

import { dbPool } from '../config/db';
import { env } from '../config/env';
import { registerAuditEntry } from '../modules/auditoria/auditoria.helper';

const CONTRACT_ID = 24;
const CONFIRMATION = 'CORRECCION_TERRITORIAL_FOCALIZACION_24';
const PRODUCTION_AUTHORIZATION = 'CORRECCION_TERRITORIAL_FOCALIZACION_24_PRODUCCION_AUTORIZADA';
const MUNICIPIO_CORRECTO = 734;
const MUNICIPIO_INCORRECTO = 728;
const EXPECTED_FINAL_IDS = [...Array.from({ length: 9 }, (_, index) => 643 + index), ...Array.from({ length: 16 }, (_, index) => 666 + index)];
const SOURCE_FILES = ['data/focalizacion-julio-2026.xlsx', 'data/focalizacion-agosto-2026.xlsx', 'data/focalizacion-septiembre-2026.xlsx'];

const normalize = (value: unknown): string => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
const institutionKey = (value: unknown): string => normalize(value).replace(/^CENTRO EDUCATIVO /, '').replace(/^CE /, '').replace(/^INSTITUCION EDUCATIVA /, '').replace(/^IE /, '');
const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');
const arg = (name: string): string | null => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;

async function sourceRows(filename: string) {
  const buffer = await readFile(filename);
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error(`FUENTE_SIN_HOJA:${filename}`);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, { header: 1, defval: null });
  const headerIndex = rows.findIndex((row) => row.some((cell) => normalize(cell) === 'MUNICIPIO'));
  if (headerIndex < 0) throw new Error(`FUENTE_SIN_ENCABEZADO:${filename}`);
  const headers = rows[headerIndex]!.map((cell) => normalize(cell));
  const idx = (name: string): number => headers.indexOf(name);
  const result = rows.slice(headerIndex + 1).filter((row) => row[idx('MUNICIPIO')] != null).map((row) => ({
    consecutivo: String(row[idx('CONSECUTIVO')] ?? '').trim(),
    institution: String(row[idx('INSTITUCION EDUCATIVA')] ?? '').trim(),
    sede: String(row[idx('SEDE EDUCATIVA')] ?? '').trim(),
    modalidad: String(row[idx('MODALIDAD OK')] ?? '').trim(),
    municipio: String(row[idx('MUNICIPIO')] ?? '').trim(),
  }));
  return { filename, sha256: sha256(buffer), rows: result };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  if (apply && env.APP_NAME === 'Empiria V2 Backend' && env.NODE_ENV !== 'production') throw new Error('PRODUCCION_REQUIERE_NODE_ENV_PRODUCTION');
  if (apply && env.NODE_ENV === 'production' && env.APP_NAME !== 'Empiria V2 Backend') throw new Error('PRODUCCION_APP_NO_COINCIDE');
  if (apply && !['Empiria QA Local', 'Empiria Territorial QA', 'Empiria V2 Backend'].includes(env.APP_NAME)) throw new Error('ENTORNO_NO_AUTORIZADO');
  if (apply && env.NODE_ENV === 'production' && arg('production-authorize') !== PRODUCTION_AUTHORIZATION) throw new Error(`REQUIERE --production-authorize=${PRODUCTION_AUTHORIZATION}`);
  if (apply && env.APP_NAME === 'Empiria Territorial QA' && !['127.0.0.1', 'localhost'].includes(new URL(env.DATABASE_URL).hostname.toLowerCase())) throw new Error('TARGET_TERRITORIAL_NO_LOCAL');
  if (apply && arg('contract-id') !== String(CONTRACT_ID)) throw new Error(`REQUIERE --contract-id=${CONTRACT_ID}`);
  if (apply && arg('confirm') !== CONFIRMATION) throw new Error(`REQUIERE --confirm=${CONFIRMATION}`);
  const sources = await Promise.all(SOURCE_FILES.map(sourceRows));
  const targetBySource = sources.map((source) => source.rows.filter((row) => row.municipio && normalize(row.municipio) === 'PUERTO RICO' && ['CE LA SABANA', 'INSTITUCION EDUCATIVA LA PRIMAVERA'].includes(institutionKey(row.institution) === 'LA SABANA' ? 'CE LA SABANA' : institutionKey(row.institution) === 'LA PRIMAVERA' ? 'INSTITUCION EDUCATIVA LA PRIMAVERA' : '')));
  const targetKeys = new Set(targetBySource.flat().map((row) => `${row.consecutivo}|${normalize(row.modalidad)}`));
  if (targetKeys.size !== 25 || targetBySource.some((rows) => rows.length !== 25)) throw new Error('PREFLIGHT_FUENTES_TARGET_NO_COINCIDE_25_COMBINACIONES');
  for (const key of targetKeys) {
    const rows = targetBySource.map((items) => items.find((row) => `${row.consecutivo}|${normalize(row.modalidad)}` === key));
    if (rows.some((row) => !row) || new Set(rows.map((row) => `${institutionKey(row!.institution)}|${normalize(row!.sede)}|${normalize(row!.modalidad)}|${normalize(row!.municipio)}`)).size !== 1) throw new Error(`PREFLIGHT_FUENTES_AMBIGUAS:${key}`);
  }
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '120s'`);
    const municipios = (await client.query(`SELECT id::text, nombre_municipio, codigo_dane, departamento_id::text FROM municipios WHERE id = ANY($1::bigint[])`, [[MUNICIPIO_INCORRECTO, MUNICIPIO_CORRECTO]])).rows;
    const contract = (await client.query(`SELECT id::text, empresa_id::text, numero_contrato FROM contratos WHERE id=$1`, [CONTRACT_ID])).rows[0];
    if (apply && (!contract || contract.empresa_id !== '15')) throw new Error('PREFLIGHT_CONTRATO_EMPRESA_INVALIDO');
    const correcto = municipios.find((row) => row.id === String(MUNICIPIO_CORRECTO));
    const incorrecto = municipios.find((row) => row.id === String(MUNICIPIO_INCORRECTO));
    if (!correcto || correcto.nombre_municipio !== 'PUERTO RICO' || correcto.codigo_dane !== '50590' || correcto.departamento_id !== '16' || !incorrecto || incorrecto.nombre_municipio !== 'PUERTO LLERAS') throw new Error('PREFLIGHT_MUNICIPIOS_INVALIDO');
    const candidateFinals = (await client.query(`SELECT id::text, preliminar_id::text, consecutivo_final, modalidad_final, municipio_id::text, institucion_id::text, sede_id::text, cupos_aprobados, cobertura_requerida FROM focalizacion_final WHERE contrato_id=$1 AND consecutivo_final = ANY($2::text[]) FOR UPDATE`, [CONTRACT_ID, [...new Set([...targetKeys].map((key) => key.split('|')[0]))]])).rows;
    const finals = candidateFinals.filter((row) => targetKeys.has(`${row.consecutivo_final}|${normalize(row.modalidad_final)}`));
    if (finals.length !== 25) throw new Error(`PREFLIGHT_FINAL_INCOMPLETO:${finals.length}`);
    if (new Set(finals.map((row) => Number(row.id))).size !== EXPECTED_FINAL_IDS.length || EXPECTED_FINAL_IDS.some((id) => !finals.some((row) => Number(row.id) === id))) throw new Error('PREFLIGHT_FINAL_IDS_NO_COINCIDEN_EXACTAMENTE');
    if (finals.some((row) => row.municipio_id !== String(MUNICIPIO_INCORRECTO) && row.municipio_id !== String(MUNICIPIO_CORRECTO))) throw new Error('PREFLIGHT_MUNICIPIO_FINAL_AMBIGUO');
    const scopedInstitutionIds = [...new Set(finals.map((row) => row.institucion_id))];
    const scopedSedeIds = [...new Set(finals.map((row) => row.sede_id))];
    const scopedInstitutions = (await client.query(`SELECT id,nombre_institucion FROM instituciones WHERE contrato_id=$1 AND id = ANY($2::bigint[])`, [CONTRACT_ID, scopedInstitutionIds])).rows;
    const scopedSedes = (await client.query(`SELECT id FROM sedes WHERE id = ANY($1::bigint[])`, [scopedSedeIds])).rows;
    const allowedInstitutions = new Set(['LA SABANA', 'LA PRIMAVERA']);
    if (scopedInstitutions.length !== 2 || scopedInstitutions.some((row) => !allowedInstitutions.has(institutionKey(row.nombre_institucion))) || scopedSedes.length !== 24) throw new Error('PREFLIGHT_ALCANCE_INSTITUCIONES_SEDES_INVALIDO');
    const relatedAssignments = (await client.query(`SELECT id FROM cobertura_asignaciones WHERE contrato_id=$1 AND focalizacion_final_id = ANY($2::bigint[])`, [CONTRACT_ID, finals.map((row) => row.id)])).rows;
    if (apply && relatedAssignments.length !== 7) throw new Error(`PREFLIGHT_ASIGNACIONES_ESPERADAS_7:${relatedAssignments.length}`);
    const beforeTotals = (await client.query(`SELECT COALESCE(SUM(cupos_aprobados),0)::int AS cupos, COALESCE(SUM(cobertura_requerida),0)::int AS cobertura FROM focalizacion_final WHERE contrato_id=$1`, [CONTRACT_ID])).rows[0];
    if (!apply) {
      await client.query('ROLLBACK');
      console.log(JSON.stringify({ modo: 'DRY_RUN', escrituras_bd: 0, contrato_id: CONTRACT_ID, municipio_correcto: correcto, municipio_incorrecto: incorrecto, combinaciones: finals.length, pendientes: finals.filter((row) => row.municipio_id === String(MUNICIPIO_INCORRECTO)).length, cupos: beforeTotals, fuentes: sources.map((source) => ({ file: source.filename, sha256: source.sha256 })) }, null, 2));
      return;
    }
    const ids = finals.map((row) => row.id);
    const institucionIds = [...new Set(finals.map((row) => row.institucion_id))];
    const sedeIds = [...new Set(finals.map((row) => row.sede_id))];
    const updates = { instituciones: 0, sedes: 0, vigencias: 0, finales: 0, asignaciones: 0 };
    for (const id of institucionIds) updates.instituciones += (await client.query(`UPDATE instituciones SET municipio_id=$2 WHERE id=$1 AND contrato_id=$3 AND municipio_id=$4`, [id, MUNICIPIO_CORRECTO, CONTRACT_ID, MUNICIPIO_INCORRECTO])).rowCount ?? 0;
    for (const id of sedeIds) updates.sedes += (await client.query(`UPDATE sedes SET municipio_id=$2 WHERE id=$1 AND municipio_id=$3`, [id, MUNICIPIO_CORRECTO, MUNICIPIO_INCORRECTO])).rowCount ?? 0;
    updates.vigencias += (await client.query(`UPDATE focalizacion_vigencias SET municipio_id=$2 WHERE contrato_id=$1 AND preliminar_id = ANY($3::bigint[]) AND municipio_id=$4`, [CONTRACT_ID, MUNICIPIO_CORRECTO, finals.map((row) => row.preliminar_id), MUNICIPIO_INCORRECTO])).rowCount ?? 0;
    updates.finales += (await client.query(`UPDATE focalizacion_final SET municipio_id=$2, municipio_texto=$3 WHERE contrato_id=$1 AND id = ANY($4::bigint[]) AND municipio_id=$5`, [CONTRACT_ID, MUNICIPIO_CORRECTO, correcto.nombre_municipio, ids, MUNICIPIO_INCORRECTO])).rowCount ?? 0;
    updates.asignaciones += (await client.query(`UPDATE cobertura_asignaciones SET municipio_id=$2 WHERE contrato_id=$1 AND focalizacion_final_id = ANY($3::bigint[]) AND municipio_id=$4`, [CONTRACT_ID, MUNICIPIO_CORRECTO, ids, MUNICIPIO_INCORRECTO])).rowCount ?? 0;
    await registerAuditEntry({ client, accion: 'CORRECCION_TERRITORIAL_FOCALIZACION', contrato_id: CONTRACT_ID, empresa_id: '15', registro_id: String(CONTRACT_ID), tabla: 'contrato_24', descripcion: 'Corrección según focalizaciones oficiales julio/agosto/septiembre 2026', usuario_id: null, before: { municipio_id: MUNICIPIO_INCORRECTO, combinaciones: finals.length }, after: { municipio_id: MUNICIPIO_CORRECTO, updates } });
    const afterTotals = (await client.query(`SELECT COALESCE(SUM(cupos_aprobados),0)::int AS cupos, COALESCE(SUM(cobertura_requerida),0)::int AS cobertura FROM focalizacion_final WHERE contrato_id=$1`, [CONTRACT_ID])).rows[0];
    if (beforeTotals.cupos !== afterTotals.cupos || beforeTotals.cobertura !== afterTotals.cobertura) throw new Error('POSTCHECK_TOTALES_CUPOS_COBERTURA_CAMBIARON');
    await client.query('COMMIT');
    console.log(JSON.stringify({ modo: 'APPLY_COMMIT', updates, idempotente: updates.finales === 0, motor_economico_modificado: false }, null, 2));
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; } finally { client.release(); await dbPool.end(); }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
