import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../config/db';
import { registerAuditEntry } from '../modules/auditoria/auditoria.helper';
import {
  MUNICIPIO_REPAIR_CONFIRMATION,
  MUNICIPIO_REPAIR_CONTRACT_ID,
  MUNICIPIO_REPAIR_EXPECTED_SHA,
  MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID,
  runMunicipioRepairTransaction,
  validateMunicipioRepairProtection,
  assertMunicipioRepairPreflight,
} from '../modules/cobertura/cobertura.maestros.municipio-repair';
import { parseWorkbookRows, resolveMunicipioId } from '../modules/cobertura/cobertura.focalizacion.service';
import {
  buildCsv,
  runPersonalMeta26DryRun,
  type CoveragePreviewRow,
  type DryRunRowReport,
} from '../modules/importaciones/personalMeta26DryRun';
import { AppError } from '../utils/AppError';

const CONTRACT_ID = 24;
const EMPRESA_ID = 15;
const OFFICIAL_LOAD_ID = 4;
const ACTOR_USER_ID_DEFAULT = '2';
const FOCALIZACION_FILE = 'data/focalizacion-agosto-2026.xlsx';
const RESULT_JSON = 'reports/cobertura-maestros-repair-result.json';
const RESULT_CSV = 'reports/cobertura-maestros-repair-result.csv';
const POSTCHECK_JSON = 'reports/cobertura-maestros-repair-postcheck.json';
const POSTCHECK_CSV = 'reports/cobertura-maestros-repair-postcheck.csv';

interface MunicipioRow extends QueryResultRow {
  codigo_dane: string;
  id: string;
  nombre_municipio: string;
}

interface InstitucionRow extends QueryResultRow {
  codigo_dane: string | null;
  contrato_id: string | null;
  id: string;
  municipio_id: string | null;
  nombre_institucion: string;
}

interface SedeRow extends QueryResultRow {
  codigo_dane: string | null;
  consecutivo_sede: string | null;
  id: string;
  institucion_id: string;
  municipio_id: string | null;
  nombre_sede: string;
}

interface ModalidadRow extends QueryResultRow {
  codigo_base: string | null;
  codigo_original: string;
  id: string;
  nombre_modalidad: string;
}

interface ModalidadAliasRow extends QueryResultRow {
  alias: string;
  modalidad_id: string;
}

interface InstitucionAliasRow extends QueryResultRow {
  codigo_dane: string | null;
  institucion_id: string;
  municipio_id: string | null;
  nombre_normalizado: string;
}

interface SedeAliasRow extends QueryResultRow {
  codigo_dane: string | null;
  consecutivo_sede: string | null;
  institucion_id: string | null;
  nombre_normalizado: string;
  sede_id: string;
}

interface SedeInstitucionHistRow extends QueryResultRow {
  id: string;
  institucion_id: string;
  sede_id: string;
  vigente_desde: string | null;
  vigente_hasta: string | null;
}

interface SedeModalidadRow extends QueryResultRow {
  contrato_id: string;
  id: string;
  modalidad_id: string;
  sede_id: string;
}

interface CargaRow extends QueryResultRow {
  archivo_sha256: string | null;
  estado: string;
  fecha_importacion: string;
  id: string;
  nombre_archivo: string;
}

interface PreliminarRow extends QueryResultRow {
  carga_id: string;
  consecutivo_original: string | null;
  cobertura_requerida: number | null;
  cupos_reportados: number;
  fila_origen: number;
  focalizacion_vigencia_id: string | null;
  id: string;
  institucion_id: string | null;
  institucion_original: string;
  mensaje_resultado: string | null;
  modalidad_id: string | null;
  modalidad_original: string;
  municipio_texto: string | null;
  resultado_comparacion: string | null;
  sede_id: string | null;
  sede_original: string;
}

interface VigenciaRow extends QueryResultRow {
  carga_id: string | null;
  contrato_id: string;
  cobertura_requerida: number | null;
  focalizacion_total: number;
  id: string;
  institucion_id: string;
  modalidad_id: string;
  municipio_id: string | null;
  preliminar_id: string | null;
  sede_id: string;
  vigente_desde: string;
  vigente_hasta: string | null;
}

interface FinalRow extends QueryResultRow {
  carga_id: string | null;
  consecutivo_final: string | null;
  contrato_id: string;
  cobertura_requerida: number | null;
  cupos_aprobados: number;
  id: string;
  institucion_final: string;
  institucion_id: string | null;
  modalidad_final: string;
  modalidad_id: string | null;
  municipio_id: string | null;
  municipio_texto: string | null;
  preliminar_id: string | null;
  sede_final: string;
  sede_id: string | null;
  sede_modalidad_id: string | null;
}

interface ContractRow extends QueryResultRow {
  empresa_id: string;
  fecha_finalizacion: string | null;
  fecha_inicio: string | null;
  id: string;
  nombre_empresa: string;
  numero_contrato: string | null;
}

interface ParsedRow {
  consecutivo: string | null;
  fila_origen: number;
  focalizacion_total: number | null;
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  sede: string | null;
}

interface AuditMatrixRow {
  consecutivo: string | null;
  cobertura_requerida: number | null;
  estado_match: 'OK' | 'MUNICIPIO_INCORRECTO' | 'INSTITUCION_INCORRECTA' | 'SEDE_INCORRECTA' | 'MODALIDAD_INCORRECTA' | 'RELACION_INCORRECTA' | 'OTRO';
  final_id: number | null;
  fila_xlsx: number;
  focalizacion: number | null;
  institucion_id: number | null;
  institucion_xlsx: string | null;
  modalidad_id: number | null;
  modalidad_xlsx: string | null;
  municipio_bd: string | null;
  municipio_id_bd: number | null;
  municipio_id_esperado: number | null;
  municipio_xlsx: string | null;
  preliminar_id: number | null;
  sede_id: number | null;
  sede_modalidad_id: number | null;
  sede_xlsx: string | null;
}

interface RepairPreviewRow {
  id: number;
  motivo: string;
  operacion_propuesta: string;
  tabla: string;
  valor_actual: string;
  valor_correcto: string;
  fuente: string;
}

interface TreeNodeRow {
  consecutivo: string | null;
  final_id: number | null;
  focalizacion_final_municipio: string | null;
  focalizacion_vigencia_id: number | null;
  institucion_actual: string | null;
  institucion_id: number | null;
  modalidad: string | null;
  modalidad_id: number | null;
  municipio_esperado: string | null;
  sede_actual: string | null;
  sede_id: number | null;
  sede_modalidad_id: number | null;
}

interface TableCounts extends QueryResultRow {
  cobertura_requerida_total: number;
  finales: number;
  finales_huerfanos: number;
  finales_relaciones_contrato_incorrecto: number;
  focalizacion_total: number;
  instituciones: number;
  instituciones_huerfanas: number;
  sede_modalidades: number;
  sede_modalidades_huerfanas: number;
  sedes: number;
  sedes_huerfanas: number;
  vigencias: number;
  vigencias_huerfanas: number;
}

interface DuplicateCounts extends QueryResultRow {
  instituciones_duplicadas_fuertes: number;
  sede_modalidades_duplicadas_fuertes: number;
  sedes_duplicadas_fuertes: number;
}

interface AffectedMunicipioSummary {
  cobertura_requerida: number;
  focalizacion: number;
  instituciones: string[];
  municipio: string;
  sede_modalidades: number;
  sedes: string[];
}

interface AppliedPreviewRow extends RepairPreviewRow {
  estado_aplicacion: 'NO_OP' | 'UPDATED';
}

interface InstitucionCollision {
  collision_type: 'CODIGO_DANE' | 'NOMBRE_NORMALIZADO';
  current_municipio: string | null;
  institucion_id: number;
  nombre_institucion: string;
  other_institucion_id: number;
  other_nombre_institucion: string;
  target_municipio: string | null;
}

interface SedeCollision {
  collision_type: 'CODIGO_DANE' | 'CONSECUTIVO_SEDE';
  current_municipio: string | null;
  institucion_id: number;
  other_sede_id: number;
  sede_id: number;
  sede_nombre: string;
  target_municipio: string | null;
}

interface PreflightContext {
  buffer: Buffer;
  contract: ContractRow;
  currentLoad: CargaRow;
  fileSha: string;
  matrix: AuditMatrixRow[];
  parsedRows: ParsedRow[];
  previewRows: RepairPreviewRow[];
  tableCounts: TableCounts;
  duplicates: DuplicateCounts;
  trees: Record<string, TreeNodeRow[]>;
  catalogs: Awaited<ReturnType<typeof loadCatalogs>>;
  affectedInstituciones: Map<number, number>;
  affectedSedes: Map<number, number>;
  affectedVigencias: Map<number, number>;
  affectedFinales: Map<number, number>;
  institutionCollisions: InstitucionCollision[];
  sedeCollisions: SedeCollision[];
}

const normalizeText = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bI\.?\s*E\.?\b/gi, 'INSTITUCION EDUCATIVA')
    .replace(/\bC\.?\s*E\.?\b/gi, 'CENTRO EDUCATIVO')
    .replace(/[^A-Z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const stripInstitutionPrefix = (value: string | null | undefined): string => normalizeText(value)
  .replace(/^(INSTITUCION\s*EDUCATIVA|CENTRO\s*EDUCATIVO|INST\s*EDUC|I\s*E)\s*/g, '')
  .trim();

const stripSedePrefix = (value: string | null | undefined): string => normalizeText(value)
  .replace(/^(SEDE\s*PRINCIPAL|SEDE|PRINCIPAL)\s*/g, '')
  .trim();

const sameInstitution = (left: string | null | undefined, right: string | null | undefined): boolean =>
  normalizeText(left) === normalizeText(right) || stripInstitutionPrefix(left) === stripInstitutionPrefix(right);

const sameSede = (left: string | null | undefined, right: string | null | undefined): boolean =>
  normalizeText(left) === normalizeText(right) || stripSedePrefix(left) === stripSedePrefix(right);

const sameModalidad = (left: string | null | undefined, right: string | null | undefined): boolean =>
  normalizeText(left) === normalizeText(right);

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const rowKey = (consecutivo: string | null | undefined, modalidad: string | null | undefined): string =>
  `${normalizeText(consecutivo)}|${normalizeText(modalidad)}`;

const queryRows = async <T extends QueryResultRow>(client: PoolClient, sql: string, params: unknown[] = []): Promise<T[]> =>
  (await client.query<T>(sql, params)).rows;

const getArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const readWorkbookBufferShared = async (filePath: string): Promise<Buffer> => {
  try {
    return await readFile(path.resolve(filePath));
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: string }).code) : '';
    if (!['EPERM', 'EACCES', 'EBUSY'].includes(code) || process.platform !== 'win32') {
      throw error;
    }

    const escaped = path.resolve(filePath).replace(/'/g, "''");
    const base64 = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$path = '${escaped}'; $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite); try { $ms = New-Object System.IO.MemoryStream; $fs.CopyTo($ms); [Convert]::ToBase64String($ms.ToArray()) } finally { if ($ms) { $ms.Dispose() }; $fs.Dispose() }`,
      ],
      { encoding: 'utf8' },
    ).trim();

    return Buffer.from(base64, 'base64');
  }
};

const loadCatalogs = async (client: PoolClient) => {
  const municipios = await queryRows<MunicipioRow>(client, `SELECT id::text AS id, codigo_dane, nombre_municipio FROM municipios ORDER BY id ASC`);
  const instituciones = await queryRows<InstitucionRow>(client, `SELECT id::text AS id, contrato_id::text AS contrato_id, municipio_id::text AS municipio_id, codigo_dane, nombre_institucion FROM instituciones WHERE COALESCE(activo, TRUE) = TRUE AND contrato_id = $1::bigint ORDER BY id ASC`, [CONTRACT_ID]);
  const sedes = await queryRows<SedeRow>(client, `SELECT s.id::text AS id, s.institucion_id::text AS institucion_id, s.municipio_id::text AS municipio_id, s.codigo_dane, s.consecutivo_sede, s.nombre_sede FROM sedes s INNER JOIN instituciones i ON i.id = s.institucion_id WHERE COALESCE(s.activo, TRUE) = TRUE AND i.contrato_id = $1::bigint ORDER BY s.id ASC`, [CONTRACT_ID]);
  const modalidades = await queryRows<ModalidadRow>(client, `SELECT id::text AS id, codigo_original, codigo_base, nombre_modalidad FROM modalidades WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`);
  const modalidadAliases = await queryRows<ModalidadAliasRow>(client, `SELECT modalidad_id::text AS modalidad_id, alias FROM modalidad_aliases WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`);
  const institucionAliases = await queryRows<InstitucionAliasRow>(client, `SELECT ih.institucion_id::text AS institucion_id, i.municipio_id::text AS municipio_id, ih.nombre_normalizado, ih.codigo_dane FROM instituciones_identidad_historial ih INNER JOIN instituciones i ON i.id = ih.institucion_id WHERE i.contrato_id = $1::bigint ORDER BY ih.id ASC`, [CONTRACT_ID]);
  const sedeAliases = await queryRows<SedeAliasRow>(client, `SELECT sh.sede_id::text AS sede_id, s.institucion_id::text AS institucion_id, sh.nombre_normalizado, sh.codigo_dane, sh.consecutivo_sede FROM sedes_identidad_historial sh INNER JOIN sedes s ON s.id = sh.sede_id INNER JOIN instituciones i ON i.id = s.institucion_id WHERE i.contrato_id = $1::bigint ORDER BY sh.id ASC`, [CONTRACT_ID]);
  const sedeInstitucionHistorial = await queryRows<SedeInstitucionHistRow>(client, `SELECT sih.id::text AS id, sih.sede_id::text AS sede_id, sih.institucion_id::text AS institucion_id, sih.vigente_desde::text AS vigente_desde, sih.vigente_hasta::text AS vigente_hasta FROM sede_institucion_historial sih INNER JOIN instituciones i ON i.id = sih.institucion_id WHERE i.contrato_id = $1::bigint ORDER BY sih.id ASC`, [CONTRACT_ID]);
  const sedeModalidades = await queryRows<SedeModalidadRow>(client, `SELECT id::text AS id, sede_id::text AS sede_id, modalidad_id::text AS modalidad_id, contrato_id::text AS contrato_id FROM sede_modalidades WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`, [CONTRACT_ID]);
  const cargas = await queryRows<CargaRow>(client, `SELECT id::text AS id, nombre_archivo, archivo_sha256, estado, fecha_importacion::text AS fecha_importacion FROM focalizacion_cargas WHERE contrato_id = $1::bigint ORDER BY fecha_importacion DESC, id DESC`, [CONTRACT_ID]);
  const preliminar = await queryRows<PreliminarRow>(client, `SELECT id::text AS id, carga_id::text AS carga_id, fila_origen, municipio_texto, institucion_original, institucion_id_resuelta::text AS institucion_id, sede_original, sede_id_resuelta::text AS sede_id, consecutivo_original, modalidad_original, modalidad_id_resuelta::text AS modalidad_id, cupos_reportados, cobertura_requerida, focalizacion_vigencia_id::text AS focalizacion_vigencia_id, resultado_comparacion, mensaje_resultado FROM focalizacion_preliminar WHERE contrato_id = $1::bigint ORDER BY fila_origen ASC, id ASC`, [CONTRACT_ID]);
  const vigencias = await queryRows<VigenciaRow>(client, `SELECT id::text AS id, contrato_id::text AS contrato_id, carga_id::text AS carga_id, preliminar_id::text AS preliminar_id, municipio_id::text AS municipio_id, institucion_id::text AS institucion_id, sede_id::text AS sede_id, modalidad_id::text AS modalidad_id, focalizacion_total, cobertura_requerida, vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta FROM focalizacion_vigencias WHERE contrato_id = $1::bigint AND activo = TRUE ORDER BY id ASC`, [CONTRACT_ID]);
  const finales = await queryRows<FinalRow>(client, `SELECT id::text AS id, contrato_id::text AS contrato_id, carga_id::text AS carga_id, preliminar_id::text AS preliminar_id, municipio_id::text AS municipio_id, municipio_texto, institucion_final, institucion_id::text AS institucion_id, sede_final, sede_id::text AS sede_id, modalidad_final, modalidad_id::text AS modalidad_id, consecutivo_final, sede_modalidad_id::text AS sede_modalidad_id, cupos_aprobados, cobertura_requerida FROM focalizacion_final WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`, [CONTRACT_ID]);
  const contract = (await queryRows<ContractRow>(client, `SELECT c.id::text AS id, c.empresa_id::text AS empresa_id, e.nombre_empresa, c.numero_contrato, c.fecha_inicio::text AS fecha_inicio, c.fecha_finalizacion::text AS fecha_finalizacion FROM contratos c INNER JOIN empresas e ON e.id = c.empresa_id WHERE c.id = $1::bigint`, [CONTRACT_ID]))[0] ?? null;

  if (!contract || contract.id !== String(CONTRACT_ID) || contract.empresa_id !== String(EMPRESA_ID)) {
    throw new AppError('Contrato/empresa destino inválidos para la reparación municipal.', 409, 'MUNICIPIO_REPAIR_TARGET_CONTRACT_INVALID');
  }

  return {
    cargas,
    contract,
    finales,
    institucionAliases,
    instituciones,
    modalidadAliases,
    modalidades,
    municipios,
    preliminar,
    sedeAliases,
    sedeInstitucionHistorial,
    sedeModalidades,
    sedes,
    vigencias,
  };
};

const loadParsedRows = (buffer: Buffer): ParsedRow[] => {
  const parsed = parseWorkbookRows(buffer);
  return parsed.rows.map((row) => ({
    fila_origen: row.fila_numero,
    consecutivo: row.consecutivo,
    municipio: row.municipio,
    institucion: row.institucion,
    sede: row.sede,
    modalidad: row.modalidad,
    focalizacion_total: row.focalizacion_total,
  }));
};

const buildMatrix = (input: {
  finales: FinalRow[];
  instituciones: InstitucionRow[];
  modalidades: ModalidadRow[];
  municipios: MunicipioRow[];
  parsedRows: ParsedRow[];
  preliminar: PreliminarRow[];
  sedes: SedeRow[];
  vigencias: VigenciaRow[];
}): AuditMatrixRow[] => {
  const finalByKey = new Map<string, FinalRow[]>();
  for (const row of input.finales) {
    const key = rowKey(row.consecutivo_final, row.modalidad_final);
    const list = finalByKey.get(key) ?? [];
    list.push(row);
    finalByKey.set(key, list);
  }
  const finalByPreliminar = new Map<string, FinalRow[]>();
  for (const row of input.finales) {
    if (!row.preliminar_id) continue;
    const list = finalByPreliminar.get(row.preliminar_id) ?? [];
    list.push(row);
    finalByPreliminar.set(row.preliminar_id, list);
  }

  const preliminarByKey = new Map<string, PreliminarRow[]>();
  for (const row of input.preliminar) {
    const key = rowKey(row.consecutivo_original, row.modalidad_original);
    const list = preliminarByKey.get(key) ?? [];
    list.push(row);
    preliminarByKey.set(key, list);
  }
  const preliminarByFila = new Map<number, PreliminarRow[]>();
  for (const row of input.preliminar) {
    const list = preliminarByFila.get(row.fila_origen) ?? [];
    list.push(row);
    preliminarByFila.set(row.fila_origen, list);
  }

  const vigenciaByPreliminar = new Map<string, VigenciaRow[]>();
  for (const row of input.vigencias) {
    if (!row.preliminar_id) continue;
    const list = vigenciaByPreliminar.get(row.preliminar_id) ?? [];
    list.push(row);
    vigenciaByPreliminar.set(row.preliminar_id, list);
  }

  const municipiosById = new Map(input.municipios.map((row) => [row.id, row]));
  const matrix: AuditMatrixRow[] = [];

  for (const row of input.parsedRows) {
    const expectedMunicipioId = resolveMunicipioId(row.municipio, input.municipios, row.consecutivo);
    const sourceKey = rowKey(row.consecutivo, row.modalidad);
    const preliminarRows = preliminarByFila.get(row.fila_origen) ?? preliminarByKey.get(sourceKey) ?? [];
    const preliminarRow = preliminarRows.find((item) =>
      item.fila_origen === row.fila_origen &&
      rowKey(item.consecutivo_original, item.modalidad_original) === sourceKey,
    ) ?? preliminarRows.find((item) => item.fila_origen === row.fila_origen) ?? preliminarRows[0] ?? null;
    const vigenciaRow = preliminarRow?.id ? (vigenciaByPreliminar.get(preliminarRow.id) ?? [])[0] ?? null : null;
    const finalRows = preliminarRow?.id ? (finalByPreliminar.get(preliminarRow.id) ?? []) : (finalByKey.get(sourceKey) ?? []);
    const finalRow = finalRows.find((item) =>
      (
        vigenciaRow &&
        item.institucion_id === vigenciaRow.institucion_id &&
        item.sede_id === vigenciaRow.sede_id &&
        item.modalidad_id === vigenciaRow.modalidad_id
      ) ||
      (
        preliminarRow &&
        item.institucion_id === preliminarRow.institucion_id &&
        item.sede_id === preliminarRow.sede_id &&
        item.modalidad_id === preliminarRow.modalidad_id
      ),
    ) ?? finalRows[0] ?? null;
    const municipioBd = finalRow?.municipio_id ? municipiosById.get(finalRow.municipio_id) ?? null : null;

    let estado: AuditMatrixRow['estado_match'] = 'OK';
    if (!finalRow || !preliminarRow || !vigenciaRow) {
      estado = 'OTRO';
    } else if (expectedMunicipioId !== toNumber(finalRow.municipio_id)) {
      estado = 'MUNICIPIO_INCORRECTO';
    } else if (!sameInstitution(row.institucion, finalRow.institucion_final)) {
      estado = 'INSTITUCION_INCORRECTA';
    } else if (!sameSede(row.sede, finalRow.sede_final)) {
      estado = 'SEDE_INCORRECTA';
    } else if (!sameModalidad(row.modalidad, finalRow.modalidad_final)) {
      estado = 'MODALIDAD_INCORRECTA';
    } else if (
      finalRow.institucion_id !== vigenciaRow.institucion_id ||
      finalRow.sede_id !== vigenciaRow.sede_id ||
      finalRow.modalidad_id !== vigenciaRow.modalidad_id
    ) {
      estado = 'RELACION_INCORRECTA';
    }

    matrix.push({
      fila_xlsx: row.fila_origen,
      consecutivo: row.consecutivo,
      preliminar_id: toNumber(preliminarRow?.id),
      final_id: toNumber(finalRow?.id),
      municipio_xlsx: row.municipio,
      municipio_id_esperado: expectedMunicipioId,
      municipio_bd: municipioBd?.nombre_municipio ?? finalRow?.municipio_texto ?? null,
      municipio_id_bd: toNumber(finalRow?.municipio_id),
      institucion_xlsx: row.institucion,
      institucion_id: toNumber(finalRow?.institucion_id ?? preliminarRow?.institucion_id),
      sede_xlsx: row.sede,
      sede_id: toNumber(finalRow?.sede_id ?? preliminarRow?.sede_id),
      modalidad_xlsx: row.modalidad,
      modalidad_id: toNumber(finalRow?.modalidad_id ?? preliminarRow?.modalidad_id),
      sede_modalidad_id: toNumber(finalRow?.sede_modalidad_id),
      focalizacion: row.focalizacion_total,
      cobertura_requerida: finalRow?.cobertura_requerida ?? vigenciaRow?.cobertura_requerida ?? preliminarRow?.cobertura_requerida ?? null,
      estado_match: estado,
    });
  }

  return matrix;
};

const buildRepairPreview = (input: {
  finales: FinalRow[];
  instituciones: InstitucionRow[];
  matrix: AuditMatrixRow[];
  municipios: MunicipioRow[];
  sedes: SedeRow[];
  vigencias: VigenciaRow[];
}): {
  affectedInstituciones: Map<number, number>;
  affectedSedes: Map<number, number>;
  affectedVigencias: Map<number, number>;
  affectedFinales: Map<number, number>;
  previewRows: RepairPreviewRow[];
  trees: Record<string, TreeNodeRow[]>;
} => {
  const previewRows: RepairPreviewRow[] = [];
  const municipiosById = new Map(input.municipios.map((row) => [toNumber(row.id)!, row]));
  const institucionesById = new Map(input.instituciones.map((row) => [toNumber(row.id)!, row]));
  const sedesById = new Map(input.sedes.map((row) => [toNumber(row.id)!, row]));
  const vigenciasByKey = new Map<string, VigenciaRow[]>();
  for (const row of input.vigencias) {
    const key = `${row.institucion_id}|${row.sede_id}|${row.modalidad_id}`;
    const list = vigenciasByKey.get(key) ?? [];
    list.push(row);
    vigenciasByKey.set(key, list);
  }

  const affectedInstituciones = new Map<number, number>();
  const affectedSedes = new Map<number, number>();
  const affectedVigencias = new Map<number, number>();
  const affectedFinales = new Map<number, number>();
  const trees: Record<string, TreeNodeRow[]> = {};

  const municipalityMismatches = input.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO');

  for (const row of municipalityMismatches) {
    const finalRow = input.finales.find((item) =>
      toNumber(item.id) === row.final_id ||
      item.preliminar_id === String(row.preliminar_id ?? '') ||
      (
        rowKey(item.consecutivo_final, item.modalidad_final) === rowKey(row.consecutivo, row.modalidad_xlsx) &&
        toNumber(item.institucion_id) === row.institucion_id
      ),
    );
    const finalMatched = finalRow ?? input.finales.find((item) => rowKey(item.consecutivo_final, item.modalidad_final) === rowKey(row.consecutivo, row.modalidad_xlsx));
    if (!finalMatched || row.municipio_id_esperado === null) continue;

    const currentMunicipioId = toNumber(finalMatched.municipio_id);
    const currentMunicipio = currentMunicipioId === null ? null : municipiosById.get(currentMunicipioId);
    const expectedMunicipio = municipiosById.get(row.municipio_id_esperado);
    const finalId = toNumber(finalMatched.id);
    const institucionId = toNumber(finalMatched.institucion_id);
    const sedeId = toNumber(finalMatched.sede_id);
    const modalidadId = toNumber(finalMatched.modalidad_id);
    const sedeModalidadId = toNumber(finalMatched.sede_modalidad_id);

    if (finalId !== null) {
      affectedFinales.set(finalId, row.municipio_id_esperado);
      previewRows.push({
        tabla: 'focalizacion_final',
        id: finalId,
        operacion_propuesta: 'UPDATE municipio_id, municipio_texto',
        valor_actual: `${currentMunicipio?.id ?? finalMatched.municipio_id}|${currentMunicipio?.nombre_municipio ?? finalMatched.municipio_texto}`,
        valor_correcto: `${expectedMunicipio?.id ?? row.municipio_id_esperado}|${expectedMunicipio?.nombre_municipio ?? row.municipio_xlsx}`,
        motivo: `La fila XLSX ${row.fila_xlsx} indica ${row.municipio_xlsx}, pero la fila final quedo asociada a ${currentMunicipio?.nombre_municipio ?? finalMatched.municipio_texto}.`,
        fuente: `${FOCALIZACION_FILE} (${MUNICIPIO_REPAIR_EXPECTED_SHA})`,
      });
    }

    if (institucionId !== null) {
      affectedInstituciones.set(institucionId, row.municipio_id_esperado);
    }
    if (sedeId !== null) {
      affectedSedes.set(sedeId, row.municipio_id_esperado);
    }

    const vigencias = vigenciasByKey.get(`${finalMatched.institucion_id}|${finalMatched.sede_id}|${finalMatched.modalidad_id}`) ?? [];
    for (const vigencia of vigencias) {
      const vigenciaId = toNumber(vigencia.id);
      if (vigenciaId === null) continue;
      affectedVigencias.set(vigenciaId, row.municipio_id_esperado);
    }

    const municipioKey = normalizeText(row.municipio_xlsx);
    const treeList = trees[municipioKey] ?? [];
    treeList.push({
      municipio_esperado: expectedMunicipio?.nombre_municipio ?? row.municipio_xlsx,
      institucion_actual: finalMatched.institucion_final,
      institucion_id: institucionId,
      sede_actual: finalMatched.sede_final,
      sede_id: sedeId,
      modalidad: finalMatched.modalidad_final,
      modalidad_id: modalidadId,
      final_id: finalId,
      focalizacion_final_municipio: currentMunicipio?.nombre_municipio ?? finalMatched.municipio_texto,
      focalizacion_vigencia_id: null,
      sede_modalidad_id: sedeModalidadId,
      consecutivo: row.consecutivo,
    });
    trees[municipioKey] = treeList;
  }

  for (const [institucionId, municipioEsperado] of affectedInstituciones.entries()) {
    const institucion = institucionesById.get(institucionId);
    const actualMunicipioId = institucion?.municipio_id ? toNumber(institucion.municipio_id) : null;
    const actualMunicipio = actualMunicipioId === null ? null : municipiosById.get(actualMunicipioId);
    const esperado = municipiosById.get(municipioEsperado);
    previewRows.push({
      tabla: 'instituciones',
      id: institucionId,
      operacion_propuesta: 'UPDATE municipio_id',
      valor_actual: `${actualMunicipio?.id ?? institucion?.municipio_id}|${actualMunicipio?.nombre_municipio ?? 'SIN_MUNICIPIO'}`,
      valor_correcto: `${esperado?.id ?? municipioEsperado}|${esperado?.nombre_municipio ?? 'SIN_MUNICIPIO'}`,
      motivo: `La institucion ${institucion?.nombre_institucion ?? institucionId} fue creada/reutilizada bajo municipio incorrecto por priorizar el consecutivo sobre el nombre del XLSX.`,
      fuente: `${FOCALIZACION_FILE} (${MUNICIPIO_REPAIR_EXPECTED_SHA})`,
    });
  }

  for (const [sedeId, municipioEsperado] of affectedSedes.entries()) {
    const sede = sedesById.get(sedeId);
    const actualMunicipioId = sede?.municipio_id ? toNumber(sede.municipio_id) : null;
    const actualMunicipio = actualMunicipioId === null ? null : municipiosById.get(actualMunicipioId);
    const esperado = municipiosById.get(municipioEsperado);
    previewRows.push({
      tabla: 'sedes',
      id: sedeId,
      operacion_propuesta: 'UPDATE municipio_id',
      valor_actual: `${actualMunicipio?.id ?? sede?.municipio_id}|${actualMunicipio?.nombre_municipio ?? 'SIN_MUNICIPIO'}`,
      valor_correcto: `${esperado?.id ?? municipioEsperado}|${esperado?.nombre_municipio ?? 'SIN_MUNICIPIO'}`,
      motivo: `La sede ${sede?.nombre_sede ?? sedeId} conserva el municipio incorrecto heredado de la misma resolucion defectuosa.`,
      fuente: `${FOCALIZACION_FILE} (${MUNICIPIO_REPAIR_EXPECTED_SHA})`,
    });
  }

  for (const [vigenciaId, municipioEsperado] of affectedVigencias.entries()) {
    const vigencia = input.vigencias.find((row) => toNumber(row.id) === vigenciaId);
    const actualMunicipioId = vigencia?.municipio_id ? toNumber(vigencia.municipio_id) : null;
    const actualMunicipio = actualMunicipioId === null ? null : municipiosById.get(actualMunicipioId);
    const esperado = municipiosById.get(municipioEsperado);
    previewRows.push({
      tabla: 'focalizacion_vigencias',
      id: vigenciaId,
      operacion_propuesta: 'UPDATE municipio_id',
      valor_actual: `${actualMunicipio?.id ?? vigencia?.municipio_id}|${actualMunicipio?.nombre_municipio ?? 'SIN_MUNICIPIO'}`,
      valor_correcto: `${esperado?.id ?? municipioEsperado}|${esperado?.nombre_municipio ?? 'SIN_MUNICIPIO'}`,
      motivo: 'La vigencia activa alimenta focalizacion_final y debe quedar alineada con la fila oficial del XLSX.',
      fuente: `${FOCALIZACION_FILE} (${MUNICIPIO_REPAIR_EXPECTED_SHA})`,
    });
  }

  return {
    affectedInstituciones,
    affectedSedes,
    affectedVigencias,
    affectedFinales,
    previewRows: previewRows.sort((left, right) => left.tabla.localeCompare(right.tabla, 'es') || left.id - right.id),
    trees,
  };
};

const loadTableCounts = async (client: PoolClient): Promise<TableCounts> => {
  const row = (await queryRows<TableCounts>(client, `
    SELECT
      (SELECT COUNT(*)::int FROM instituciones WHERE contrato_id = $1::bigint) AS instituciones,
      (SELECT COUNT(*)::int FROM sedes s INNER JOIN instituciones i ON i.id = s.institucion_id WHERE i.contrato_id = $1::bigint) AS sedes,
      (SELECT COUNT(*)::int FROM sede_modalidades WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE) AS sede_modalidades,
      (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE contrato_id = $1::bigint AND activo = TRUE) AS vigencias,
      (SELECT COUNT(*)::int FROM focalizacion_final WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE) AS finales,
      (SELECT COALESCE(SUM(cupos_aprobados), 0)::int FROM focalizacion_final WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE) AS focalizacion_total,
      (SELECT COALESCE(SUM(cobertura_requerida), 0)::int FROM focalizacion_final WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE) AS cobertura_requerida_total,
      (SELECT COUNT(*)::int FROM instituciones i LEFT JOIN municipios m ON m.id = i.municipio_id WHERE i.contrato_id = $1::bigint AND m.id IS NULL) AS instituciones_huerfanas,
      (SELECT COUNT(*)::int FROM sedes s LEFT JOIN instituciones i ON i.id = s.institucion_id WHERE s.id IN (SELECT s2.id FROM sedes s2 INNER JOIN instituciones i2 ON i2.id = s2.institucion_id WHERE i2.contrato_id = $1::bigint) AND i.id IS NULL) AS sedes_huerfanas,
      (SELECT COUNT(*)::int FROM sede_modalidades sm LEFT JOIN sedes s ON s.id = sm.sede_id LEFT JOIN modalidades m ON m.id = sm.modalidad_id WHERE sm.contrato_id = $1::bigint AND (s.id IS NULL OR m.id IS NULL)) AS sede_modalidades_huerfanas,
      (SELECT COUNT(*)::int FROM focalizacion_vigencias fv LEFT JOIN instituciones i ON i.id = fv.institucion_id LEFT JOIN sedes s ON s.id = fv.sede_id LEFT JOIN modalidades m ON m.id = fv.modalidad_id WHERE fv.contrato_id = $1::bigint AND fv.activo = TRUE AND (i.id IS NULL OR s.id IS NULL OR m.id IS NULL)) AS vigencias_huerfanas,
      (SELECT COUNT(*)::int FROM focalizacion_final ff LEFT JOIN instituciones i ON i.id = ff.institucion_id LEFT JOIN sedes s ON s.id = ff.sede_id LEFT JOIN modalidades m ON m.id = ff.modalidad_id LEFT JOIN sede_modalidades sm ON sm.id = ff.sede_modalidad_id WHERE ff.contrato_id = $1::bigint AND COALESCE(ff.activo, TRUE) = TRUE AND (i.id IS NULL OR s.id IS NULL OR m.id IS NULL OR sm.id IS NULL)) AS finales_huerfanos,
      (SELECT COUNT(*)::int FROM focalizacion_final ff INNER JOIN instituciones i ON i.id = ff.institucion_id INNER JOIN sedes s ON s.id = ff.sede_id INNER JOIN sede_modalidades sm ON sm.id = ff.sede_modalidad_id WHERE ff.contrato_id = $1::bigint AND COALESCE(ff.activo, TRUE) = TRUE AND (i.contrato_id <> $1::bigint OR sm.contrato_id <> $1::bigint)) AS finales_relaciones_contrato_incorrecto
  `, [CONTRACT_ID]))[0];

  if (!row) {
    throw new AppError('No fue posible cargar conteos de cobertura.', 500, 'MUNICIPIO_REPAIR_COUNTS_UNAVAILABLE');
  }

  return row;
};

const loadDuplicateCounts = async (client: PoolClient): Promise<DuplicateCounts> => {
  const row = (await queryRows<DuplicateCounts>(client, `
    SELECT
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT municipio_id, UPPER(TRIM(REGEXP_REPLACE(nombre_institucion, '\\s+', ' ', 'g'))) AS nombre_key, COUNT(*)
          FROM instituciones
          WHERE contrato_id = $1::bigint
          GROUP BY municipio_id, UPPER(TRIM(REGEXP_REPLACE(nombre_institucion, '\\s+', ' ', 'g')))
          HAVING COUNT(*) > 1
        ) duplicates
      ) AS instituciones_duplicadas_fuertes,
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT COALESCE(s.consecutivo_sede, s.codigo_dane) AS sede_key, COUNT(*)
          FROM sedes s
          INNER JOIN instituciones i ON i.id = s.institucion_id
          WHERE i.contrato_id = $1::bigint
            AND COALESCE(s.consecutivo_sede, s.codigo_dane) IS NOT NULL
          GROUP BY COALESCE(s.consecutivo_sede, s.codigo_dane)
          HAVING COUNT(*) > 1
        ) duplicates
      ) AS sedes_duplicadas_fuertes,
      (
        SELECT COUNT(*)::int
        FROM (
          SELECT sede_id, modalidad_id, contrato_id, COUNT(*)
          FROM sede_modalidades
          WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE
          GROUP BY sede_id, modalidad_id, contrato_id
          HAVING COUNT(*) > 1
        ) duplicates
      ) AS sede_modalidades_duplicadas_fuertes
  `, [CONTRACT_ID]))[0];

  if (!row) {
    throw new AppError('No fue posible cargar duplicados fuertes.', 500, 'MUNICIPIO_REPAIR_DUPLICATES_UNAVAILABLE');
  }

  return row;
};

const detectCollisions = (input: {
  affectedInstituciones: Map<number, number>;
  affectedSedes: Map<number, number>;
  institucionAliases: InstitucionAliasRow[];
  instituciones: InstitucionRow[];
  municipios: MunicipioRow[];
  sedeAliases: SedeAliasRow[];
  sedes: SedeRow[];
}): { institutionCollisions: InstitucionCollision[]; sedeCollisions: SedeCollision[] } => {
  const municipiosById = new Map(input.municipios.map((row) => [toNumber(row.id)!, row.nombre_municipio]));
  const institucionesById = new Map(input.instituciones.map((row) => [toNumber(row.id)!, row]));
  const sedesById = new Map(input.sedes.map((row) => [toNumber(row.id)!, row]));

  const institutionCollisions: InstitucionCollision[] = [];
  for (const [institucionId, targetMunicipioId] of input.affectedInstituciones.entries()) {
    const institucion = institucionesById.get(institucionId);
    if (!institucion) continue;
    const currentMunicipio = institucion.municipio_id ? municipiosById.get(toNumber(institucion.municipio_id) ?? -1) ?? null : null;
    const targetMunicipio = municipiosById.get(targetMunicipioId) ?? null;
    const nameKey = normalizeText(institucion.nombre_institucion);

    for (const other of input.instituciones) {
      const otherId = toNumber(other.id);
      if (!otherId || otherId === institucionId) continue;
      if (toNumber(other.municipio_id) !== targetMunicipioId) continue;

      if (other.codigo_dane && institucion.codigo_dane && other.codigo_dane === institucion.codigo_dane) {
        institutionCollisions.push({
          collision_type: 'CODIGO_DANE',
          current_municipio: currentMunicipio,
          institucion_id: institucionId,
          nombre_institucion: institucion.nombre_institucion,
          other_institucion_id: otherId,
          other_nombre_institucion: other.nombre_institucion,
          target_municipio: targetMunicipio,
        });
      } else if (normalizeText(other.nombre_institucion) === nameKey) {
        institutionCollisions.push({
          collision_type: 'NOMBRE_NORMALIZADO',
          current_municipio: currentMunicipio,
          institucion_id: institucionId,
          nombre_institucion: institucion.nombre_institucion,
          other_institucion_id: otherId,
          other_nombre_institucion: other.nombre_institucion,
          target_municipio: targetMunicipio,
        });
      }
    }

    for (const alias of input.institucionAliases) {
      const aliasInstitutionId = toNumber(alias.institucion_id);
      if (!aliasInstitutionId || aliasInstitutionId === institucionId) continue;
      if (toNumber(alias.municipio_id) !== targetMunicipioId) continue;
      if (normalizeText(alias.nombre_normalizado) !== nameKey) continue;
      const other = institucionesById.get(aliasInstitutionId);
      institutionCollisions.push({
        collision_type: 'NOMBRE_NORMALIZADO',
        current_municipio: currentMunicipio,
        institucion_id: institucionId,
        nombre_institucion: institucion.nombre_institucion,
        other_institucion_id: aliasInstitutionId,
        other_nombre_institucion: other?.nombre_institucion ?? alias.nombre_normalizado,
        target_municipio: targetMunicipio,
      });
    }
  }

  const sedeCollisions: SedeCollision[] = [];
  for (const [sedeId, targetMunicipioId] of input.affectedSedes.entries()) {
    const sede = sedesById.get(sedeId);
    if (!sede) continue;
    const currentMunicipio = sede.municipio_id ? municipiosById.get(toNumber(sede.municipio_id) ?? -1) ?? null : null;
    const targetMunicipio = municipiosById.get(targetMunicipioId) ?? null;
    const sedeInstitutionId = toNumber(sede.institucion_id);
    if (!sedeInstitutionId) continue;

    for (const other of input.sedes) {
      const otherId = toNumber(other.id);
      if (!otherId || otherId === sedeId) continue;
      if (toNumber(other.institucion_id) !== sedeInstitutionId) continue;

      if (sede.consecutivo_sede && other.consecutivo_sede && sede.consecutivo_sede === other.consecutivo_sede) {
        sedeCollisions.push({
          collision_type: 'CONSECUTIVO_SEDE',
          current_municipio: currentMunicipio,
          institucion_id: sedeInstitutionId,
          other_sede_id: otherId,
          sede_id: sedeId,
          sede_nombre: sede.nombre_sede,
          target_municipio: targetMunicipio,
        });
      } else if (sede.codigo_dane && other.codigo_dane && sede.codigo_dane === other.codigo_dane) {
        sedeCollisions.push({
          collision_type: 'CODIGO_DANE',
          current_municipio: currentMunicipio,
          institucion_id: sedeInstitutionId,
          other_sede_id: otherId,
          sede_id: sedeId,
          sede_nombre: sede.nombre_sede,
          target_municipio: targetMunicipio,
        });
      }
    }

    for (const alias of input.sedeAliases) {
      const aliasSedeId = toNumber(alias.sede_id);
      if (!aliasSedeId || aliasSedeId === sedeId) continue;
      if (toNumber(alias.institucion_id) !== sedeInstitutionId) continue;
      if (sede.consecutivo_sede && alias.consecutivo_sede && sede.consecutivo_sede === alias.consecutivo_sede) {
        sedeCollisions.push({
          collision_type: 'CONSECUTIVO_SEDE',
          current_municipio: currentMunicipio,
          institucion_id: sedeInstitutionId,
          other_sede_id: aliasSedeId,
          sede_id: sedeId,
          sede_nombre: sede.nombre_sede,
          target_municipio: targetMunicipio,
        });
      } else if (sede.codigo_dane && alias.codigo_dane && sede.codigo_dane === alias.codigo_dane) {
        sedeCollisions.push({
          collision_type: 'CODIGO_DANE',
          current_municipio: currentMunicipio,
          institucion_id: sedeInstitutionId,
          other_sede_id: aliasSedeId,
          sede_id: sedeId,
          sede_nombre: sede.nombre_sede,
          target_municipio: targetMunicipio,
        });
      }
    }
  }

  return {
    institutionCollisions: [...new Map(institutionCollisions.map((item) => [`${item.collision_type}|${item.institucion_id}|${item.other_institucion_id}`, item])).values()],
    sedeCollisions: [...new Map(sedeCollisions.map((item) => [`${item.collision_type}|${item.sede_id}|${item.other_sede_id}`, item])).values()],
  };
};

const buildPreflightContext = async (client: PoolClient): Promise<PreflightContext> => {
  const buffer = await readWorkbookBufferShared(FOCALIZACION_FILE);
  const fileSha = createHash('sha256').update(buffer).digest('hex');
  if (fileSha !== MUNICIPIO_REPAIR_EXPECTED_SHA) {
    throw new AppError('SHA-256 del XLSX oficial no coincide con el esperado.', 409, 'MUNICIPIO_REPAIR_SHA_MISMATCH', { expected: MUNICIPIO_REPAIR_EXPECTED_SHA, got: fileSha });
  }

  const catalogs = await loadCatalogs(client);
  const currentLoad = catalogs.cargas.find((row) => row.id === String(OFFICIAL_LOAD_ID)) ?? null;
  if (!currentLoad) {
    throw new AppError('No existe la carga oficial solicitada.', 404, 'MUNICIPIO_REPAIR_OFFICIAL_LOAD_NOT_FOUND');
  }
  if (currentLoad.archivo_sha256 !== MUNICIPIO_REPAIR_EXPECTED_SHA) {
    throw new AppError('La carga oficial en BD no coincide con el SHA esperado.', 409, 'MUNICIPIO_REPAIR_OFFICIAL_LOAD_SHA_MISMATCH', { load_sha: currentLoad.archivo_sha256, expected_sha: MUNICIPIO_REPAIR_EXPECTED_SHA });
  }

  const parsedRows = loadParsedRows(buffer);
  if (parsedRows.length !== 687) {
    throw new AppError('El XLSX oficial no contiene 687 filas útiles de focalización.', 409, 'MUNICIPIO_REPAIR_XLSX_ROWS_MISMATCH', { rows: parsedRows.length });
  }

  const matrix = buildMatrix({
    parsedRows,
    municipios: catalogs.municipios,
    instituciones: catalogs.instituciones,
    sedes: catalogs.sedes,
    modalidades: catalogs.modalidades,
    preliminar: catalogs.preliminar,
    vigencias: catalogs.vigencias,
    finales: catalogs.finales,
  });
  const repairPreview = buildRepairPreview({
    matrix,
    municipios: catalogs.municipios,
    instituciones: catalogs.instituciones,
    sedes: catalogs.sedes,
    vigencias: catalogs.vigencias,
    finales: catalogs.finales,
  });
  const tableCounts = await loadTableCounts(client);
  const duplicates = await loadDuplicateCounts(client);
  const collisions = detectCollisions({
    affectedInstituciones: repairPreview.affectedInstituciones,
    affectedSedes: repairPreview.affectedSedes,
    institucionAliases: catalogs.institucionAliases,
    instituciones: catalogs.instituciones,
    municipios: catalogs.municipios,
    sedeAliases: catalogs.sedeAliases,
    sedes: catalogs.sedes,
  });

  return {
    buffer,
    fileSha,
    currentLoad,
    contract: catalogs.contract,
    parsedRows,
    matrix,
    previewRows: repairPreview.previewRows,
    trees: repairPreview.trees,
    tableCounts,
    duplicates,
    catalogs,
    affectedInstituciones: repairPreview.affectedInstituciones,
    affectedSedes: repairPreview.affectedSedes,
    affectedVigencias: repairPreview.affectedVigencias,
    affectedFinales: repairPreview.affectedFinales,
    institutionCollisions: collisions.institutionCollisions,
    sedeCollisions: collisions.sedeCollisions,
  };
};

const lockAffectedRows = async (client: PoolClient, preflight: PreflightContext): Promise<void> => {
  await client.query(`SELECT id FROM focalizacion_cargas WHERE id = $1::bigint FOR UPDATE`, [OFFICIAL_LOAD_ID]);
  if (preflight.affectedInstituciones.size > 0) {
    await client.query(`SELECT id FROM instituciones WHERE id = ANY($1::bigint[]) FOR UPDATE`, [[...preflight.affectedInstituciones.keys()]]);
  }
  if (preflight.affectedSedes.size > 0) {
    await client.query(`SELECT id FROM sedes WHERE id = ANY($1::bigint[]) FOR UPDATE`, [[...preflight.affectedSedes.keys()]]);
  }
  if (preflight.affectedVigencias.size > 0) {
    await client.query(`SELECT id FROM focalizacion_vigencias WHERE id = ANY($1::bigint[]) FOR UPDATE`, [[...preflight.affectedVigencias.keys()]]);
  }
  if (preflight.affectedFinales.size > 0) {
    await client.query(`SELECT id FROM focalizacion_final WHERE id = ANY($1::bigint[]) FOR UPDATE`, [[...preflight.affectedFinales.keys()]]);
  }
};

const applyRepair = async (client: PoolClient, preflight: PreflightContext): Promise<{
  appliedRows: AppliedPreviewRow[];
  auditPayload: Record<string, unknown>;
  updated: { finales: number; instituciones: number; sedes: number; vigencias: number };
}> => {
  const municipiosById = new Map(preflight.catalogs.municipios.map((row) => [toNumber(row.id)!, row.nombre_municipio]));
  const updated = { instituciones: 0, sedes: 0, vigencias: 0, finales: 0 };

  for (const [institucionId, municipioId] of preflight.affectedInstituciones.entries()) {
    const result = await client.query(
      `UPDATE instituciones SET municipio_id = $2::bigint WHERE id = $1::bigint AND municipio_id IS DISTINCT FROM $2::bigint`,
      [institucionId, municipioId],
    );
    updated.instituciones += result.rowCount ?? 0;
  }

  for (const [sedeId, municipioId] of preflight.affectedSedes.entries()) {
    const result = await client.query(
      `UPDATE sedes SET municipio_id = $2::bigint WHERE id = $1::bigint AND municipio_id IS DISTINCT FROM $2::bigint`,
      [sedeId, municipioId],
    );
    updated.sedes += result.rowCount ?? 0;
  }

  for (const [vigenciaId, municipioId] of preflight.affectedVigencias.entries()) {
    const result = await client.query(
      `UPDATE focalizacion_vigencias SET municipio_id = $2::bigint WHERE id = $1::bigint AND municipio_id IS DISTINCT FROM $2::bigint`,
      [vigenciaId, municipioId],
    );
    updated.vigencias += result.rowCount ?? 0;
  }

  for (const [finalId, municipioId] of preflight.affectedFinales.entries()) {
    const municipioNombre = municipiosById.get(municipioId);
    const result = await client.query(
      `UPDATE focalizacion_final SET municipio_id = $2::bigint, municipio_texto = $3 WHERE id = $1::bigint AND (municipio_id IS DISTINCT FROM $2::bigint OR municipio_texto IS DISTINCT FROM $3)`,
      [finalId, municipioId, municipioNombre ?? null],
    );
    updated.finales += result.rowCount ?? 0;
  }

  const appliedRows: AppliedPreviewRow[] = preflight.previewRows.map((row) => ({
    ...row,
    estado_aplicacion: 'UPDATED',
  }));

  const auditPayload = {
    tipo: 'reparacion_tecnica',
    causa: 'BUG_RESOLUCION_MUNICIPIO',
    contrato_id: CONTRACT_ID,
    empresa_id: EMPRESA_ID,
    official_load_id: OFFICIAL_LOAD_ID,
    sha256: preflight.fileSha,
    instituciones_afectadas: preflight.affectedInstituciones.size,
    sedes_afectadas: preflight.affectedSedes.size,
    relaciones_afectadas: preflight.affectedFinales.size,
    updates: updated,
  };

  await registerAuditEntry({
    accion: 'REPARACION_TECNICA',
    client,
    descripcion: 'Reparación técnica de municipios mal resueltos en focalización oficial por BUG_RESOLUCION_MUNICIPIO.',
    registro_id: String(OFFICIAL_LOAD_ID),
    tabla: 'focalizacion_cargas',
    usuario_id: ACTOR_USER_ID_DEFAULT,
    before: {
      contrato_id: CONTRACT_ID,
      empresa_id: EMPRESA_ID,
      pending_relaciones: preflight.affectedFinales.size,
      pending_instituciones: preflight.affectedInstituciones.size,
      pending_sedes: preflight.affectedSedes.size,
      sha256: preflight.fileSha,
    },
    after: auditPayload,
  });

  return { appliedRows, updated, auditPayload };
};

const buildAffectedMunicipioSummary = (matrix: AuditMatrixRow[]): AffectedMunicipioSummary[] => {
  const grouped = new Map<string, AffectedMunicipioSummary>();
  for (const row of matrix) {
    const municipio = row.municipio_xlsx ?? row.municipio_bd ?? 'SIN_MUNICIPIO';
    const current = grouped.get(municipio) ?? {
      municipio,
      instituciones: [],
      sedes: [],
      sede_modalidades: 0,
      focalizacion: 0,
      cobertura_requerida: 0,
    };
    if (row.institucion_xlsx && !current.instituciones.includes(row.institucion_xlsx)) {
      current.instituciones.push(row.institucion_xlsx);
    }
    if (row.sede_xlsx && !current.sedes.includes(row.sede_xlsx)) {
      current.sedes.push(row.sede_xlsx);
    }
    current.sede_modalidades += 1;
    current.focalizacion += row.focalizacion ?? 0;
    current.cobertura_requerida += row.cobertura_requerida ?? 0;
    grouped.set(municipio, current);
  }
  return [...grouped.values()].sort((a, b) => a.municipio.localeCompare(b.municipio, 'es'));
};

const summarizePersonal = (report: Awaited<ReturnType<typeof runPersonalMeta26DryRun>>) => {
  const coverageCounts = new Map<string, number>();
  for (const row of report.report_rows) {
    coverageCounts.set(row.cobertura_estado, (coverageCounts.get(row.cobertura_estado) ?? 0) + 1);
  }
  return {
    filas: report.report_rows.length,
    manipuladoras: report.report_rows.filter((row) => normalizeText(row.cargo_resuelto) === 'MANIPULADOR A DE ALIMENTOS').length,
    revisar: report.review_rows.length,
    manipuladoras_asignables: report.coverage_summary.asignadas_total,
    municipio_no_reconocido: coverageCounts.get('MUNICIPIO_NO_RECONOCIDO') ?? 0,
    institucion_no_reconocida: coverageCounts.get('INSTITUCION_NO_RECONOCIDA') ?? 0,
    sede_no_reconocida: coverageCounts.get('SEDE_NO_RECONOCIDA') ?? 0,
    sede_modalidad_no_existe: coverageCounts.get('SEDE_MODALIDAD_NO_EXISTE') ?? 0,
    decisiones_humanas_restantes: report.manual_decision_rows.length,
    aliases_propuestos: report.proposed_aliases.length,
  };
};

const writeReports = async (input: {
  resultJson: Record<string, unknown>;
  resultRows: AppliedPreviewRow[];
  postcheckJson: Record<string, unknown>;
  postcheckMatrix: AuditMatrixRow[];
}): Promise<void> => {
  await mkdir(path.resolve('reports'), { recursive: true });
  await Promise.all([
    writeFile(path.resolve(RESULT_JSON), JSON.stringify(input.resultJson, null, 2), 'utf8'),
    writeFile(path.resolve(RESULT_CSV), buildCsv(input.resultRows, [
      'tabla',
      'id',
      'operacion_propuesta',
      'valor_actual',
      'valor_correcto',
      'motivo',
      'fuente',
      'estado_aplicacion',
    ]), 'utf8'),
    writeFile(path.resolve(POSTCHECK_JSON), JSON.stringify(input.postcheckJson, null, 2), 'utf8'),
    writeFile(path.resolve(POSTCHECK_CSV), buildCsv(input.postcheckMatrix, [
      'fila_xlsx',
      'consecutivo',
      'municipio_xlsx',
      'municipio_id_esperado',
      'municipio_bd',
      'municipio_id_bd',
      'institucion_xlsx',
      'institucion_id',
      'sede_xlsx',
      'sede_id',
      'modalidad_xlsx',
      'modalidad_id',
      'sede_modalidad_id',
      'focalizacion',
      'cobertura_requerida',
      'estado_match',
    ]), 'utf8'),
  ]);
};

const main = async (): Promise<void> => {
  const apply = process.argv.includes('--apply');
  const contractId = getArg('contract-id');
  const officialLoadId = getArg('official-load-id');
  const confirm = getArg('confirm');
  validateMunicipioRepairProtection({ apply, contractId, officialLoadId, confirm });

  if (!apply) {
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = '60s'`);
      const preflight = await buildPreflightContext(client);
      const summary = {
        mode: 'DRY_RUN_ONLY',
        required_confirmation: MUNICIPIO_REPAIR_CONFIRMATION,
        usage: 'node dist/scripts/cobertura-maestros-repair-7-4.js --apply --contract-id=24 --official-load-id=4 --confirm=REPARAR_MUNICIPIOS_FOCALIZACION_META26',
        sha256: preflight.fileSha,
        relaciones_incorrectas: preflight.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO').length,
        instituciones_afectadas: preflight.affectedInstituciones.size,
        sedes_afectadas: preflight.affectedSedes.size,
        colisiones_institucion: preflight.institutionCollisions.length,
        colisiones_sede: preflight.sedeCollisions.length,
        reportes_previos: {
          preview_json: 'reports/cobertura-maestros-repair-preview.json',
          preview_csv: 'reports/cobertura-maestros-repair-preview.csv',
        },
      };
      console.log(JSON.stringify(summary, null, 2));
      await client.query('ROLLBACK');
      return;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
      await dbPool.end().catch(() => undefined);
    }
  }

  const beforeClient = await dbPool.connect();
  let resultJson: Record<string, unknown>;
  let resultRows: AppliedPreviewRow[];

  try {
    let beforeCounts: TableCounts | null = null;
    let beforeDuplicates: DuplicateCounts | null = null;
    let preflightSnapshot: PreflightContext | null = null;
    let transactionResult: Awaited<ReturnType<typeof applyRepair>> | null = null;

    await runMunicipioRepairTransaction(beforeClient, async () => {
      await beforeClient.query(`SET LOCAL statement_timeout = '120s'`);
      await beforeClient.query(`SET LOCAL lock_timeout = '15s'`);

      const preflight = await buildPreflightContext(beforeClient);
      preflightSnapshot = preflight;
      beforeCounts = preflight.tableCounts;
      beforeDuplicates = preflight.duplicates;

      assertMunicipioRepairPreflight({
        relacionesIncorrectas: preflight.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO').length,
        institucionesAfectadas: preflight.affectedInstituciones.size,
        sedesAfectadas: preflight.affectedSedes.size,
      });

      if (preflight.institutionCollisions.length > 0 || preflight.sedeCollisions.length > 0) {
        throw new AppError('Se detectaron colisiones de identidad previas a la reparación.', 409, 'MUNICIPIO_REPAIR_COLLISION_DETECTED', {
          institution_collisions: preflight.institutionCollisions,
          sede_collisions: preflight.sedeCollisions,
        });
      }

      if (preflight.affectedFinales.size === 0) {
        transactionResult = {
          appliedRows: [],
          updated: { instituciones: 0, sedes: 0, vigencias: 0, finales: 0 },
          auditPayload: {
            tipo: 'reparacion_tecnica',
            causa: 'BUG_RESOLUCION_MUNICIPIO',
            contrato_id: CONTRACT_ID,
            empresa_id: EMPRESA_ID,
            official_load_id: OFFICIAL_LOAD_ID,
            sha256: preflight.fileSha,
            already_repaired: true,
          },
        };
        return;
      }

      await lockAffectedRows(beforeClient, preflight);
      transactionResult = await applyRepair(beforeClient, preflight);
      const catalogsAfterUpdate = await loadCatalogs(beforeClient);
      const postMatrixInTx = buildMatrix({
        parsedRows: preflight.parsedRows,
        municipios: catalogsAfterUpdate.municipios,
        instituciones: catalogsAfterUpdate.instituciones,
        sedes: catalogsAfterUpdate.sedes,
        modalidades: catalogsAfterUpdate.modalidades,
        preliminar: catalogsAfterUpdate.preliminar,
        vigencias: catalogsAfterUpdate.vigencias,
        finales: catalogsAfterUpdate.finales,
      });
      const remainingMunicipioMismatches = postMatrixInTx.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO');
      if (remainingMunicipioMismatches.length > 0) {
        console.error(JSON.stringify({
          postcheck_in_tx_failed: remainingMunicipioMismatches.slice(0, 15),
          updated_counts: transactionResult.updated,
          affected_finales: preflight.affectedFinales.size,
          affected_instituciones: preflight.affectedInstituciones.size,
          affected_sedes: preflight.affectedSedes.size,
          affected_vigencias: preflight.affectedVigencias.size,
        }, null, 2));
        throw new AppError('El postcheck dentro de la transacción todavía detecta municipios incorrectos.', 409, 'MUNICIPIO_REPAIR_POSTCHECK_FAILED_IN_TX');
      }

      const afterCountsInTx = await loadTableCounts(beforeClient);
      if (
        afterCountsInTx.focalizacion_total !== beforeCounts.focalizacion_total ||
        afterCountsInTx.cobertura_requerida_total !== beforeCounts.cobertura_requerida_total
      ) {
        throw new AppError('La reparación alteró focalización o cobertura requerida, lo cual está prohibido.', 409, 'MUNICIPIO_REPAIR_TOTALS_CHANGED', {
          before: beforeCounts,
          after: afterCountsInTx,
        });
      }
    });

    if (!preflightSnapshot || !beforeCounts || !beforeDuplicates || !transactionResult) {
      throw new AppError('La reparación no produjo un contexto transaccional válido.', 500, 'MUNICIPIO_REPAIR_INTERNAL_STATE_INVALID');
    }
    const committedPreflight: PreflightContext = preflightSnapshot;
    const committedBeforeCounts: TableCounts = beforeCounts;
    const committedBeforeDuplicates: DuplicateCounts = beforeDuplicates;
    const committedTransactionResult: Awaited<ReturnType<typeof applyRepair>> = transactionResult;

    const postClient = await dbPool.connect();
    try {
      await postClient.query('BEGIN READ ONLY');
      await postClient.query(`SET LOCAL statement_timeout = '120s'`);
      const postflight = await buildPreflightContext(postClient);
      const postCounts = postflight.tableCounts;
      const postDuplicates = postflight.duplicates;
      const affectedSummaries = buildAffectedMunicipioSummary(postflight.matrix.filter((row) =>
        ['BARRANCA DE UPIA', 'EL DORADO', 'PUERTO CONCORDIA', 'URIBE'].includes(normalizeText(row.municipio_xlsx)),
      ));

      const pendingAfter = postflight.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO').length;
      const idempotentStatus = pendingAfter === 0;

      const personalDryRun = await runPersonalMeta26DryRun();
      const personalSummary = summarizePersonal(personalDryRun);

      resultRows = committedTransactionResult.appliedRows.length > 0
        ? committedTransactionResult.appliedRows
        : committedPreflight.previewRows.map((row) => ({ ...row, estado_aplicacion: 'NO_OP' as const }));

      resultJson = {
        sha256: committedPreflight.fileSha,
        preflight: {
          relaciones_incorrectas: committedPreflight.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO').length,
          instituciones_afectadas: committedPreflight.affectedInstituciones.size,
          sedes_afectadas: committedPreflight.affectedSedes.size,
          colisiones_institucion: committedPreflight.institutionCollisions,
          colisiones_sede: committedPreflight.sedeCollisions,
        },
        transaction: {
          resultado: 'COMMIT',
          updated: committedTransactionResult.updated,
        },
        counts_before: committedBeforeCounts,
        counts_after: postCounts,
        duplicates_before: committedBeforeDuplicates,
        duplicates_after: postDuplicates,
        audit: committedTransactionResult.auditPayload,
        idempotencia: {
          reparaciones_pendientes: pendingAfter,
          estado: idempotentStatus ? 'NO_OP' : 'PENDIENTE',
        },
      };

      const postcheckJson = {
        sha256: committedPreflight.fileSha,
        municipios_incorrectos: pendingAfter,
        mismatches: Object.fromEntries(
          [...new Set(postflight.matrix.map((row) => row.estado_match))]
            .map((status) => [status, postflight.matrix.filter((row) => row.estado_match === status).length]),
        ),
        counts: postCounts,
        duplicates: postDuplicates,
        affected_municipios: affectedSummaries,
        personal_dry_run: personalSummary,
      };

      await writeReports({
        resultJson,
        resultRows,
        postcheckJson,
        postcheckMatrix: postflight.matrix,
      });

      console.log(JSON.stringify({
        sha256: committedPreflight.fileSha,
        preflight: resultJson.preflight,
        transaction: resultJson.transaction,
        postcheck: {
          municipios_incorrectos: pendingAfter,
          counts_after: postCounts,
          duplicates_after: postDuplicates,
        },
        personal_dry_run: personalSummary,
        reportes: {
          result_json: RESULT_JSON,
          result_csv: RESULT_CSV,
          postcheck_json: POSTCHECK_JSON,
          postcheck_csv: POSTCHECK_CSV,
        },
      }, null, 2));

      await postClient.query('ROLLBACK');
    } catch (error) {
      await postClient.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      postClient.release();
    }
  } finally {
    beforeClient.release();
    await dbPool.end().catch(() => undefined);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error));
  process.exitCode = 1;
});
