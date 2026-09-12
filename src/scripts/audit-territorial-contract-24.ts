import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';

import { dbPool } from '../config/db';

const CONTRACT_ID = 24;
const REQUIRED_SOURCE_KEYS = ['july', 'august', 'september'] as const;
type SourceKey = (typeof REQUIRED_SOURCE_KEYS)[number];

const normalize = (value: unknown): string => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();

const sourceArg = (key: SourceKey): string | null => {
  const prefix = `--${key}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
};

const headerAliases: Record<string, string[]> = {
  institutionDane: ['DANE INSTITUCION', 'DANE INSTITUCIÓN', 'CODIGO DANE INSTITUCION', 'CODIGO DANE INSTITUCIÓN'],
  sedeDane: ['CODIGO DANE SEDE', 'CÓDIGO DANE SEDE', 'DANE SEDE', 'CODIGO DANE'],
  institution: ['INSTITUCION EDUCATIVA', 'INSTITUCIÓN EDUCATIVA', 'INSTITUCION', 'INSTITUCIÓN'],
  sede: ['SEDE EDUCATIVA', 'SEDE'],
  modalidad: ['MODALIDAD OK', 'MODALIDAD'],
  municipio: ['MUNICIPIO'],
  cupos: ['TOTAL', 'FOCALIZACION TOTAL', 'FOCALIZACIÓN TOTAL'],
  consecutivo: ['CONSECUTIVO'],
  concatenado: ['CONCAENAR', 'CONCATENAR'],
};

const findHeader = (headers: string[], aliases: string[]): number => {
  const normalized = headers.map(normalize);
  const normalizedAliases = new Set(aliases.map(normalize));
  return normalized.findIndex((item) => normalizedAliases.has(item));
};

const sha256 = (buffer: Buffer): string => createHash('sha256').update(buffer).digest('hex');

async function parseSource(key: SourceKey, filename: string) {
  const buffer = await readFile(filename);
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0] ?? '';
  if (!sheetName) throw new Error(`${key}: el XLSX no contiene hojas.`);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`${key}: no se pudo leer la primera hoja.`);
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null });
  const headerRowIndex = raw.findIndex((row) => Array.isArray(row) && row.some((cell) => normalize(cell) === 'MUNICIPIO'));
  if (headerRowIndex < 0) throw new Error(`${key}: no se encontró encabezado con MUNICIPIO.`);
  const headers = (raw[headerRowIndex] ?? []).map((cell) => String(cell ?? ''));
  const indices: Record<string, number> = Object.fromEntries(Object.entries(headerAliases).map(([name, aliases]) => [name, findHeader(headers, aliases)]));
  const index = (name: string): number => indices[name] ?? -1;
  const rows = raw.slice(headerRowIndex + 1).filter((row) => Array.isArray(row) && index('municipio') >= 0 && row[index('municipio')] != null).map((row, offset) => ({
    source: key,
    row: headerRowIndex + offset + 2,
    consecutivo: index('consecutivo') >= 0 ? String(row[index('consecutivo')] ?? '').trim() : null,
    concatenado: index('concatenado') >= 0 ? String(row[index('concatenado')] ?? '').trim() : null,
    institutionDane: index('institutionDane') >= 0 ? String(row[index('institutionDane')] ?? '').trim() : null,
    sedeDane: index('sedeDane') >= 0 ? String(row[index('sedeDane')] ?? '').trim() : null,
    institution: index('institution') >= 0 ? String(row[index('institution')] ?? '').trim() : null,
    sede: index('sede') >= 0 ? String(row[index('sede')] ?? '').trim() : null,
    modalidad: index('modalidad') >= 0 ? String(row[index('modalidad')] ?? '').trim() : null,
    municipio: String(row[index('municipio')] ?? '').trim(),
    cupos: index('cupos') >= 0 ? Number(row[index('cupos')] ?? 0) || 0 : null,
  }));
  return { key, file: path.resolve(filename), sha256: sha256(buffer), sheetName, headerRowIndex: headerRowIndex + 1, headers, indices, rows };
}

async function main(): Promise<void> {
  const files = Object.fromEntries(REQUIRED_SOURCE_KEYS.map((key) => [key, sourceArg(key)])) as Record<SourceKey, string | null>;
  const missing = REQUIRED_SOURCE_KEYS.filter((key) => !files[key]);
  if (missing.length) throw new Error(`AUDITORIA_BLOQUEADA_FUENTES_FALTANTES: ${missing.join(', ')}`);
  const sources = await Promise.all(REQUIRED_SOURCE_KEYS.map((key) => parseSource(key, files[key]!)));
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '60s'`);
    const municipioRows = (await client.query(`SELECT id::text, nombre_municipio, codigo_dane, departamento_id::text FROM municipios WHERE UPPER(nombre_municipio) IN ('PUERTO LLERAS','PUERTO RICO','SAN LUIS DE CUBARRAL','CUBARRAL') ORDER BY id`)).rows;
    const contract = (await client.query(`SELECT id::text, numero_contrato, empresa_id::text FROM contratos WHERE id = $1`, [CONTRACT_ID])).rows[0] ?? null;
    const counts = (await client.query(`SELECT
      (SELECT COUNT(*)::int FROM focalizacion_final WHERE contrato_id=$1) AS focalizacion_final,
      (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE contrato_id=$1) AS focalizacion_vigencias,
      (SELECT COUNT(*)::int FROM cobertura_asignaciones WHERE contrato_id=$1) AS cobertura_asignaciones,
      (SELECT COUNT(*)::int FROM vinculaciones WHERE contrato_id=$1) AS vinculaciones`, [CONTRACT_ID])).rows[0];
    const target = (await client.query(`SELECT ff.id::text, ff.municipio_id::text, mu.nombre_municipio, ff.institucion_final, ff.sede_final, ff.modalidad_final, ff.cupos_aprobados, ff.cobertura_requerida
      FROM focalizacion_final ff LEFT JOIN municipios mu ON mu.id=ff.municipio_id WHERE ff.contrato_id=$1 AND (UPPER(ff.institucion_final) LIKE '%SABANA%' OR UPPER(ff.institucion_final) LIKE '%PRIMAVERA%')`, [CONTRACT_ID])).rows;
    const officialRows = sources.flatMap((source) => source.rows);
    const officialByKey = new Map<string, typeof officialRows>();
    for (const row of officialRows) {
      const key = `${normalize(row.consecutivo)}|${normalize(row.modalidad)}`;
      const existing = officialByKey.get(key) ?? [];
      existing.push(row);
      officialByKey.set(key, existing);
    }
    const finalRows = (await client.query(`SELECT ff.id::text AS focalizacion_final_id, ff.contrato_id::text,
      ff.consecutivo_final, ff.municipio_id::text AS municipio_id_final, COALESCE(mu.nombre_municipio, ff.municipio_texto) AS municipio_final,
      ff.institucion_final, ff.sede_final, ff.modalidad_final, ff.modalidad_id::text AS modalidad_id,
      ff.institucion_id::text AS institucion_id, ff.sede_id::text AS sede_id, ff.sede_modalidad_id::text AS sede_modalidad_id,
      ff.cupos_aprobados, ff.cobertura_requerida, ff.preliminar_id::text,
      i.municipio_id::text AS institucion_municipio_id, i.codigo_dane AS institucion_codigo_dane,
      s.municipio_id::text AS sede_municipio_id, s.codigo_dane AS sede_codigo_dane, s.institucion_id::text AS sede_institucion_id,
      m.nombre_modalidad
      FROM focalizacion_final ff
      LEFT JOIN municipios mu ON mu.id=ff.municipio_id
      LEFT JOIN instituciones i ON i.id=ff.institucion_id
      LEFT JOIN sedes s ON s.id=ff.sede_id
      LEFT JOIN modalidades m ON m.id=ff.modalidad_id
      WHERE ff.contrato_id=$1 ORDER BY ff.id`, [CONTRACT_ID])).rows;
    const comparison = sources.map((source) => {
      const sourceKeys = new Set(source.rows.map((row) => `${normalize(row.consecutivo)}|${normalize(row.modalidad)}`));
      const matches = finalRows.map((finalRow) => {
        const key = `${normalize(finalRow.consecutivo_final)}|${normalize(finalRow.modalidad_final)}`;
        const official = source.rows.find((row) => `${normalize(row.consecutivo)}|${normalize(row.modalidad)}` === key) ?? null;
        if (!official) return { source: source.key, focalizacion_final_id: finalRow.focalizacion_final_id, key, estado: 'EXTRA_EN_BD', final: finalRow };
        const differences = ['municipio', 'institucion', 'sede', 'modalidad'].filter((field) => {
          const current = field === 'municipio' ? finalRow.municipio_final : field === 'institucion' ? finalRow.institucion_final : field === 'sede' ? finalRow.sede_final : finalRow.modalidad_final;
          const expected = field === 'municipio' ? official.municipio : field === 'institucion' ? official.institution : field === 'sede' ? official.sede : official.modalidad;
          return normalize(current) !== normalize(expected);
        });
        return { source: source.key, focalizacion_final_id: finalRow.focalizacion_final_id, key, estado: differences.length ? 'INCONSISTENTE' : 'OK', diferencias: differences, oficial: official, final: finalRow };
      });
      const missing = source.rows.filter((row) => !finalRows.some((finalRow) => `${normalize(finalRow.consecutivo_final)}|${normalize(finalRow.modalidad_final)}` === `${normalize(row.consecutivo)}|${normalize(row.modalidad)}`));
      return { source: source.key, official_rows: source.rows.length, final_rows: finalRows.length, source_keys: sourceKeys.size, missing_in_bd: missing, rows: matches };
    });
    const targetRows = officialRows.filter((row) => /SABANA|PRIMAVERA/i.test(`${row.institution} ${row.sede}`));
    const targetFinal = finalRows.filter((row) => /SABANA|PRIMAVERA/i.test(`${row.institucion_final} ${row.sede_final}`));
    const documents = ['1006691887','40327321','21182728','40398034','31007973','40266636','33222823'];
    const affectedPeople = (await client.query(`SELECT p.id::text AS persona_id, p.numero_documento AS documento,
      CONCAT_WS(' ', p.primer_nombre,p.segundo_nombre,p.primer_apellido,p.segundo_apellido) AS nombre,
      v.id::text AS vinculacion_id, ca.id::text AS cobertura_asignacion_id, ca.focalizacion_final_id::text,
      ca.municipio_id::text AS municipio_asignacion_id, cam.nombre_municipio AS municipio_asignacion,
      ca.institucion, ca.sede, ca.modalidad, ca.fecha_inicio, ca.fecha_fin, ca.activo,
      ff.municipio_id::text AS municipio_final_id, ff.institucion_final, ff.sede_final, ff.modalidad_final
      FROM personas p JOIN vinculaciones v ON v.persona_id=p.id
      LEFT JOIN cobertura_asignaciones ca ON ca.vinculacion_id=v.id
      LEFT JOIN municipios cam ON cam.id=ca.municipio_id
      LEFT JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id
      WHERE v.contrato_id=$1 AND REGEXP_REPLACE(p.numero_documento,'[^0-9A-Za-z]','','g') = ANY($2::text[])
      ORDER BY p.numero_documento, ca.fecha_inicio NULLS FIRST, ca.id`, [CONTRACT_ID, documents])).rows;
    const report = {
      modo: 'READ_ONLY', escrituras_bd: 0, contrato: contract, municipios_verificados: municipioRows,
      fuentes: sources.map(({ key, file, sha256: hash, sheetName, headerRowIndex, headers, indices, rows }) => ({ key, file, sha256: hash, sheetName, headerRowIndex, headers, indices, filas: rows.length, filas_sin_codigo_dane_explicito: rows.filter((row) => !row.institutionDane || !row.sedeDane).length })),
      conteos_bd: counts, filas_objetivo_bd: target,
      resumen_comparacion: comparison.map((item) => ({ source: item.source, official_rows: item.official_rows, final_rows: item.final_rows, missing_in_bd: item.missing_in_bd.length, extra_en_bd: item.rows.filter((row) => row.estado === 'EXTRA_EN_BD').length, inconsistentes: item.rows.filter((row) => row.estado === 'INCONSISTENTE').length })),
      comparacion: comparison,
      puerto_rico_objetivo: { filas_oficiales: targetRows, filas_bd: targetFinal },
      personas_documentos_objetivo: affectedPeople,
      observaciones: [
        'El municipio se compara por texto/catálogo; nunca se deriva por prefijo DANE.',
        'Las tres fuentes deben contener DANE institución y CODIGO_DANE_SEDE explícitos para una aplicación segura.',
        'Este comando no actualiza tablas, asignaciones, vigencias, snapshots ni nómina.',
      ],
    };
    await writeFile(path.resolve('reports/territorial-contract-24-audit.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify({ modo: report.modo, fuentes: report.fuentes.map((item) => ({ key: item.key, filas: item.filas, headers: item.headers.length, indices: item.indices })), municipios_verificados: municipioRows, conteos_bd: counts, resumen_comparacion: report.resumen_comparacion, filas_puerto_rico_oficiales: targetRows.length, filas_puerto_rico_bd: targetFinal.length, personas_afectadas: affectedPeople.length, reporte: 'reports/territorial-contract-24-audit.json' }, null, 2));
    await client.query('ROLLBACK');
  } finally {
    client.release();
    await dbPool.end();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
