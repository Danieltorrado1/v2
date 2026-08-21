import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../config/db';
import { parseWorkbookRows, resolveMunicipioId } from '../modules/cobertura/cobertura.focalizacion.service';
import {
  buildCsv,
  META26_FILE,
  runPersonalMeta26DryRun,
  type CoveragePreviewRow,
  type DryRunRowReport,
} from '../modules/importaciones/personalMeta26DryRun';
import { matchCoverageAssignmentDetailed } from '../modules/importaciones/personalMeta26DryRun.helpers';
import { readFileSync } from 'node:fs';

const CONTRACT_ID = 24;
const FOCALIZACION_FILE = 'data/focalizacion-agosto-2026.xlsx';
const FOCALIZACION_SHA = '6f55c28567d7dd2f9f92182f90f89398f3769b00dbcfbedac19c8ec604422719';
const OUTPUT_JSON = 'reports/cobertura-maestros-repair-preview.json';
const OUTPUT_CSV = 'reports/cobertura-maestros-repair-preview.csv';

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

interface SimulationSummary {
  decisiones_humanas_despues: number;
  instituciones_no_reconocidas: number;
  manipuladoras_asignables: number;
  municipios_no_reconocidos: number;
  revisar_despues: number;
  sede_modalidad_no_existe: number;
  sedes_no_reconocidas: number;
}

interface ManualDecisionCsvRow {
  tipo_problema: string;
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

const sameMunicipio = (left: string | null | undefined, right: string | null | undefined): boolean =>
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

const loadCatalogs = async (client: PoolClient) => {
  const municipios = await queryRows<MunicipioRow>(client, `SELECT id::text AS id, codigo_dane, nombre_municipio FROM municipios ORDER BY id ASC`);
  const instituciones = await queryRows<InstitucionRow>(client, `SELECT id::text AS id, contrato_id::text AS contrato_id, municipio_id::text AS municipio_id, codigo_dane, nombre_institucion FROM instituciones WHERE COALESCE(activo, TRUE) = TRUE AND contrato_id = $1::bigint ORDER BY id ASC`, [CONTRACT_ID]);
  const sedes = await queryRows<SedeRow>(client, `SELECT id::text AS id, institucion_id::text AS institucion_id, municipio_id::text AS municipio_id, codigo_dane, consecutivo_sede, nombre_sede FROM sedes WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`);
  const modalidades = await queryRows<ModalidadRow>(client, `SELECT id::text AS id, codigo_original, codigo_base, nombre_modalidad FROM modalidades WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`);
  const modalidadAliases = await queryRows<ModalidadAliasRow>(client, `SELECT modalidad_id::text AS modalidad_id, alias FROM modalidad_aliases WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`);
  const institucionAliases = await queryRows<InstitucionAliasRow>(client, `SELECT ih.institucion_id::text AS institucion_id, i.municipio_id::text AS municipio_id, ih.nombre_normalizado, ih.codigo_dane FROM instituciones_identidad_historial ih INNER JOIN instituciones i ON i.id = ih.institucion_id ORDER BY ih.id ASC`);
  const sedeAliases = await queryRows<SedeAliasRow>(client, `SELECT sh.sede_id::text AS sede_id, s.institucion_id::text AS institucion_id, sh.nombre_normalizado, sh.codigo_dane, sh.consecutivo_sede FROM sedes_identidad_historial sh INNER JOIN sedes s ON s.id = sh.sede_id ORDER BY sh.id ASC`);
  const sedeInstitucionHistorial = await queryRows<SedeInstitucionHistRow>(client, `SELECT id::text AS id, sede_id::text AS sede_id, institucion_id::text AS institucion_id, vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta FROM sede_institucion_historial ORDER BY id ASC`);
  const sedeModalidades = await queryRows<SedeModalidadRow>(client, `SELECT id::text AS id, sede_id::text AS sede_id, modalidad_id::text AS modalidad_id, contrato_id::text AS contrato_id FROM sede_modalidades WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`, [CONTRACT_ID]);
  const cargas = await queryRows<CargaRow>(client, `SELECT id::text AS id, nombre_archivo, archivo_sha256, estado, fecha_importacion::text AS fecha_importacion FROM focalizacion_cargas WHERE contrato_id = $1::bigint ORDER BY fecha_importacion DESC, id DESC`, [CONTRACT_ID]);
  const preliminar = await queryRows<PreliminarRow>(client, `SELECT id::text AS id, carga_id::text AS carga_id, fila_origen, municipio_texto, institucion_original, institucion_id_resuelta::text AS institucion_id, sede_original, sede_id_resuelta::text AS sede_id, consecutivo_original, modalidad_original, modalidad_id_resuelta::text AS modalidad_id, cupos_reportados, cobertura_requerida, focalizacion_vigencia_id::text AS focalizacion_vigencia_id, resultado_comparacion, mensaje_resultado FROM focalizacion_preliminar WHERE contrato_id = $1::bigint ORDER BY fila_origen ASC, id ASC`, [CONTRACT_ID]);
  const vigencias = await queryRows<VigenciaRow>(client, `SELECT id::text AS id, contrato_id::text AS contrato_id, carga_id::text AS carga_id, preliminar_id::text AS preliminar_id, municipio_id::text AS municipio_id, institucion_id::text AS institucion_id, sede_id::text AS sede_id, modalidad_id::text AS modalidad_id, focalizacion_total, cobertura_requerida, vigente_desde::text AS vigente_desde, vigente_hasta::text AS vigente_hasta FROM focalizacion_vigencias WHERE contrato_id = $1::bigint AND activo = TRUE ORDER BY id ASC`, [CONTRACT_ID]);
  const finales = await queryRows<FinalRow>(client, `SELECT id::text AS id, contrato_id::text AS contrato_id, carga_id::text AS carga_id, preliminar_id::text AS preliminar_id, municipio_id::text AS municipio_id, municipio_texto, institucion_final, institucion_id::text AS institucion_id, sede_final, sede_id::text AS sede_id, modalidad_final, modalidad_id::text AS modalidad_id, consecutivo_final, sede_modalidad_id::text AS sede_modalidad_id, cupos_aprobados, cobertura_requerida FROM focalizacion_final WHERE contrato_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE ORDER BY id ASC`, [CONTRACT_ID]);

  return {
    cargas,
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

const loadParsedRows = (): ParsedRow[] => {
  const parsed = parseWorkbookRows(readFileSync(path.resolve(FOCALIZACION_FILE)));
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
}): {
  affectedRows: AuditMatrixRow[];
  matrix: AuditMatrixRow[];
  mismatches: Map<string, number>;
} => {
  const finalByKey = new Map<string, FinalRow[]>();
  for (const row of input.finales) {
    const key = rowKey(row.consecutivo_final, row.modalidad_final);
    const list = finalByKey.get(key) ?? [];
    list.push(row);
    finalByKey.set(key, list);
  }

  const preliminarByKey = new Map<string, PreliminarRow[]>();
  for (const row of input.preliminar) {
    const key = rowKey(row.consecutivo_original, row.modalidad_original);
    const list = preliminarByKey.get(key) ?? [];
    list.push(row);
    preliminarByKey.set(key, list);
  }

  const vigenciaByPreliminar = new Map<string, VigenciaRow[]>();
  for (const row of input.vigencias) {
    if (!row.preliminar_id) continue;
    const list = vigenciaByPreliminar.get(row.preliminar_id) ?? [];
    list.push(row);
    vigenciaByPreliminar.set(row.preliminar_id, list);
  }

  const institucionesById = new Map(input.instituciones.map((row) => [row.id, row]));
  const sedesById = new Map(input.sedes.map((row) => [row.id, row]));
  const modalidadesById = new Map(input.modalidades.map((row) => [row.id, row]));
  const municipiosById = new Map(input.municipios.map((row) => [row.id, row]));
  const matrix: AuditMatrixRow[] = [];
  const mismatches = new Map<string, number>();

  for (const row of input.parsedRows) {
    const expectedMunicipioId = resolveMunicipioId(row.municipio, input.municipios, row.consecutivo);
    const sourceKey = rowKey(row.consecutivo, row.modalidad);
    const preliminarRows = preliminarByKey.get(sourceKey) ?? [];
    const finalRows = finalByKey.get(sourceKey) ?? [];
    const finalRow = finalRows[0] ?? null;
    const preliminarRow = preliminarRows.find((item) => item.fila_origen === row.fila_origen) ?? preliminarRows[0] ?? null;
    const vigenciaRow = preliminarRow?.id ? (vigenciaByPreliminar.get(preliminarRow.id) ?? [])[0] ?? null : null;
    const institucionRow = finalRow?.institucion_id ? institucionesById.get(finalRow.institucion_id) ?? null : null;
    const sedeRow = finalRow?.sede_id ? sedesById.get(finalRow.sede_id) ?? null : null;
    const modalidadRow = finalRow?.modalidad_id ? modalidadesById.get(finalRow.modalidad_id) ?? null : null;
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

    if (estado !== 'OK') {
      mismatches.set(estado, (mismatches.get(estado) ?? 0) + 1);
    }

    matrix.push({
      fila_xlsx: row.fila_origen,
      consecutivo: row.consecutivo,
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

  return {
    matrix,
    affectedRows: matrix.filter((row) => row.estado_match !== 'OK'),
    mismatches,
  };
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
  affectedSedeModalidades: Set<number>;
  affectedVigencias: Map<number, number>;
  previewRows: RepairPreviewRow[];
  trees: Record<string, TreeNodeRow[]>;
} => {
  const previewRows: RepairPreviewRow[] = [];
  const municipiosById = new Map(input.municipios.map((row) => [toNumber(row.id)!, row]));
  const finalesByPreliminar = new Map(input.finales.map((row) => [row.preliminar_id ?? `final:${row.id}`, row]));
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
  const affectedSedeModalidades = new Set<number>();
  const affectedVigencias = new Map<number, number>();
  const trees: Record<string, TreeNodeRow[]> = {};

  const municipalityMismatches = input.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO');

  for (const row of municipalityMismatches) {
    const finalRow = input.finales.find((item) => toNumber(item.id) === row.sede_modalidad_id || (rowKey(item.consecutivo_final, item.modalidad_final) === rowKey(row.consecutivo, row.modalidad_xlsx) && toNumber(item.institucion_id) === row.institucion_id));
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
      previewRows.push({
        tabla: 'focalizacion_final',
        id: finalId,
        operacion_propuesta: 'UPDATE municipio_id, municipio_texto',
        valor_actual: `${currentMunicipio?.id ?? finalMatched.municipio_id}|${currentMunicipio?.nombre_municipio ?? finalMatched.municipio_texto}`,
        valor_correcto: `${expectedMunicipio?.id ?? row.municipio_id_esperado}|${expectedMunicipio?.nombre_municipio ?? row.municipio_xlsx}`,
        motivo: `La fila XLSX ${row.fila_xlsx} indica ${row.municipio_xlsx}, pero la fila final quedo asociada a ${currentMunicipio?.nombre_municipio ?? finalMatched.municipio_texto}.`,
        fuente: `${FOCALIZACION_FILE} (${FOCALIZACION_SHA})`,
      });
    }

    if (institucionId !== null) {
      affectedInstituciones.set(institucionId, row.municipio_id_esperado);
    }
    if (sedeId !== null) {
      affectedSedes.set(sedeId, row.municipio_id_esperado);
    }
    if (sedeModalidadId !== null) {
      affectedSedeModalidades.add(sedeModalidadId);
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
      fuente: `${FOCALIZACION_FILE} (${FOCALIZACION_SHA})`,
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
      fuente: `${FOCALIZACION_FILE} (${FOCALIZACION_SHA})`,
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
      fuente: `${FOCALIZACION_FILE} (${FOCALIZACION_SHA})`,
    });
  }

  return {
    affectedInstituciones,
    affectedSedes,
    affectedSedeModalidades,
    affectedVigencias,
    previewRows: previewRows.sort((left, right) => left.tabla.localeCompare(right.tabla, 'es') || left.id - right.id),
    trees,
  };
};

const parseManualDecisionRows = (): ManualDecisionCsvRow[] => {
  const content = readFileSync(path.resolve('reports/personal-meta26-decisiones-humanas-final.csv'), 'utf8');
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  if (!headerLine) {
    return [];
  }
  const headers = headerLine.split(',');
  const tipoIndex = headers.findIndex((item) => item === 'tipo_problema');
  return lines.map((line) => {
    const values: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += character;
      }
    }
    values.push(current);
    return { tipo_problema: values[tipoIndex] ?? '' };
  });
};

const simulatePersonal = (input: {
  affectedInstituciones: Map<number, number>;
  affectedSedes: Map<number, number>;
  finales: FinalRow[];
  instituciones: InstitucionRow[];
  manualDecisionCount: number;
  modalidadAliases: ModalidadAliasRow[];
  modalidades: ModalidadRow[];
  municipios: MunicipioRow[];
  personalReport: Awaited<ReturnType<typeof runPersonalMeta26DryRun>>;
  institucionAliases: InstitucionAliasRow[];
  sedeAliases: SedeAliasRow[];
  sedes: SedeRow[];
}): SimulationSummary => {
  const virtualInstituciones = input.instituciones.map((row) => ({
    id: toNumber(row.id)!,
    municipio_id: input.affectedInstituciones.get(toNumber(row.id)!) ?? toNumber(row.municipio_id),
    codigo_dane: row.codigo_dane,
    nombre_institucion: row.nombre_institucion,
  }));
  const virtualSedes = input.sedes.map((row) => ({
    id: toNumber(row.id)!,
    institucion_id: toNumber(row.institucion_id)!,
    municipio_id: input.affectedSedes.get(toNumber(row.id)!) ?? toNumber(row.municipio_id),
    codigo_dane: row.codigo_dane,
    consecutivo_sede: row.consecutivo_sede,
    nombre_sede: row.nombre_sede,
  }));
  const municipiosById = new Map(input.municipios.map((row) => [toNumber(row.id)!, row.nombre_municipio]));
  const virtualFocalizacion = input.finales.map((row) => ({
    focalizacion_final_id: toNumber(row.id)!,
    sede_modalidad_id: toNumber(row.sede_modalidad_id),
    municipio_id: (() => {
      const sedeId = toNumber(row.sede_id);
      return sedeId === null ? toNumber(row.municipio_id) : (input.affectedSedes.get(sedeId) ?? toNumber(row.municipio_id));
    })(),
    municipio_nombre: (() => {
      const sedeId = toNumber(row.sede_id);
      const municipioId = sedeId === null ? toNumber(row.municipio_id) : (input.affectedSedes.get(sedeId) ?? toNumber(row.municipio_id));
      return municipioId === null ? row.municipio_texto : municipiosById.get(municipioId) ?? row.municipio_texto;
    })(),
    institucion_id: toNumber(row.institucion_id),
    institucion_nombre: row.institucion_final,
    sede_id: toNumber(row.sede_id),
    sede_nombre: row.sede_final,
    modalidad_id: toNumber(row.modalidad_id),
    modalidad_codigo_original: row.modalidad_final,
    modalidad_codigo_base: null,
    modalidad_nombre: row.modalidad_final,
    cobertura_requerida: row.cobertura_requerida,
  }));
  const virtualMunicipios = input.municipios.map((row) => ({
    id: toNumber(row.id)!,
    codigo_dane: row.codigo_dane,
    nombre_municipio: row.nombre_municipio,
  }));
  const virtualModalidades = input.modalidades.map((row) => ({
    id: toNumber(row.id)!,
    codigo_original: row.codigo_original,
    codigo_base: row.codigo_base,
    nombre_modalidad: row.nombre_modalidad,
  }));
  const virtualModalidadAliases = input.modalidadAliases.map((row) => ({
    modalidad_id: toNumber(row.modalidad_id)!,
    alias: row.alias,
  }));
  const virtualInstitucionAliases = input.institucionAliases.map((row) => ({
    institucion_id: toNumber(row.institucion_id)!,
    municipio_id: input.affectedInstituciones.get(toNumber(row.institucion_id)!) ?? toNumber(row.municipio_id),
    nombre_alias: row.nombre_normalizado,
  }));
  const virtualSedeAliases = input.sedeAliases.map((row) => ({
    sede_id: toNumber(row.sede_id)!,
    institucion_id: toNumber(row.institucion_id),
    nombre_alias: row.nombre_normalizado,
  }));

  const coverageProblemCodes = new Set([
    'MUNICIPIO_NO_RECONOCIDO',
    'INSTITUCION_NO_RECONOCIDA',
    'SEDE_NO_RECONOCIDA',
    'SEDE_MODALIDAD_NO_EXISTE',
    'MODALIDAD_NO_RECONOCIDA',
    'AMBIGUA',
  ]);

  let assignable = 0;
  let municipioNo = 0;
  let institucionNo = 0;
  let sedeNo = 0;
  let sedeModalidadNo = 0;
  let reviewAfter = 0;
  let coverageManualBefore = 0;
  let coverageManualResolved = 0;

  const manualDecisionRows = parseManualDecisionRows();
  for (const manualRow of manualDecisionRows) {
    if ([
      'MUNICIPIO_SIN_RESOLUCION_DETERMINISTA',
      'INSTITUCION_REQUIERE_DECISION_HUMANA',
      'SEDE_REQUIERE_DECISION_HUMANA',
      'SEDE_EXISTE_OTRA_MODALIDAD_ADICIONAL',
    ].includes(manualRow.tipo_problema)) {
      coverageManualBefore += 1;
    }
  }

  for (const row of input.personalReport.report_rows) {
    const isManip = normalizeText(row.cargo_origen) === 'MANIPULADORA DE ALIMENTOS' || normalizeText(row.cargo_resuelto) === 'MANIPULADOR A DE ALIMENTOS';
    let simulatedStatus = row.cobertura_estado;

    if (isManip) {
      const result = matchCoverageAssignmentDetailed(
        {
          municipio: row.municipio_origen,
          institucion_educativa: row.institucion_origen,
          sede: row.sede_origen,
          modalidad: row.modalidad_origen,
        },
        virtualFocalizacion,
        virtualInstitucionAliases,
        virtualSedeAliases,
        virtualModalidadAliases,
        virtualMunicipios,
        virtualInstituciones,
        virtualSedes,
        virtualModalidades,
      );
      simulatedStatus = result.status;
      if (simulatedStatus === 'ASIGNACION_OK') {
        assignable += 1;
      } else if (simulatedStatus === 'MUNICIPIO_NO_RECONOCIDO') {
        municipioNo += 1;
      } else if (simulatedStatus === 'INSTITUCION_NO_RECONOCIDA') {
        institucionNo += 1;
      } else if (simulatedStatus === 'SEDE_NO_RECONOCIDA') {
        sedeNo += 1;
      } else if (simulatedStatus === 'SEDE_MODALIDAD_NO_EXISTE') {
        sedeModalidadNo += 1;
      }
    }

    const nonCoverageBlocking = row.problemas_bloqueantes.filter((issue) => !coverageProblemCodes.has(issue));
    const needsReview = nonCoverageBlocking.length > 0 || (isManip && simulatedStatus !== 'ASIGNACION_OK');
    if (needsReview) {
      reviewAfter += 1;
    }
    if (coverageProblemCodes.has(row.cobertura_estado) && simulatedStatus === 'ASIGNACION_OK' && nonCoverageBlocking.length === 0) {
      coverageManualResolved += 1;
    }
  }

  return {
    revisar_despues: reviewAfter,
    manipuladoras_asignables: assignable,
    municipios_no_reconocidos: municipioNo,
    instituciones_no_reconocidas: institucionNo,
    sedes_no_reconocidas: sedeNo,
    sede_modalidad_no_existe: sedeModalidadNo,
    decisiones_humanas_despues: Math.max(0, input.manualDecisionCount - coverageManualResolved),
  };
};

const main = async (): Promise<void> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '60s'`);

    const parsedRows = loadParsedRows();
    const catalogs = await loadCatalogs(client);
    const matrixResult = buildMatrix({
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
      matrix: matrixResult.matrix,
      municipios: catalogs.municipios,
      instituciones: catalogs.instituciones,
      sedes: catalogs.sedes,
      vigencias: catalogs.vigencias,
      finales: catalogs.finales,
    });

    const currentLoad = catalogs.cargas.find((row) => row.archivo_sha256 === FOCALIZACION_SHA) ?? catalogs.cargas[0] ?? null;
    const currentMunicipios = [...new Set(matrixResult.matrix.map((row) => row.municipio_bd).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
    const xlsxMunicipios = [...new Set(parsedRows.map((row) => row.municipio).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, 'es'));
    const misalignedMunicipios = Array.from(new Map(matrixResult.matrix
      .filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO')
      .map((row) => [`${normalizeText(row.municipio_xlsx)}=>${normalizeText(row.municipio_bd)}`, {
        municipio_xlsx: row.municipio_xlsx,
        municipio_bd: row.municipio_bd,
        filas_afectadas: 0,
      }])).values());
    for (const row of matrixResult.matrix.filter((item) => item.estado_match === 'MUNICIPIO_INCORRECTO')) {
      const entry = misalignedMunicipios.find((item) => normalizeText(item.municipio_xlsx) === normalizeText(row.municipio_xlsx) && normalizeText(item.municipio_bd) === normalizeText(row.municipio_bd));
      if (entry) entry.filas_afectadas += 1;
    }

    const personalReport = await runPersonalMeta26DryRun(META26_FILE);
    const simulation = simulatePersonal({
      affectedInstituciones: repairPreview.affectedInstituciones,
      affectedSedes: repairPreview.affectedSedes,
      finales: catalogs.finales,
      instituciones: catalogs.instituciones,
      manualDecisionCount: 87,
      modalidadAliases: catalogs.modalidadAliases,
      modalidades: catalogs.modalidades,
      municipios: catalogs.municipios,
      personalReport,
      institucionAliases: catalogs.institucionAliases,
      sedeAliases: catalogs.sedeAliases,
      sedes: catalogs.sedes,
    });

    const counts = {
      filas_auditadas: matrixResult.matrix.length,
      municipio_correcto: matrixResult.matrix.filter((row) => row.estado_match !== 'MUNICIPIO_INCORRECTO').length,
      municipio_incorrecto: matrixResult.matrix.filter((row) => row.estado_match === 'MUNICIPIO_INCORRECTO').length,
      institucion_correcta: matrixResult.matrix.filter((row) => row.estado_match !== 'INSTITUCION_INCORRECTA').length,
      institucion_incorrecta: matrixResult.matrix.filter((row) => row.estado_match === 'INSTITUCION_INCORRECTA').length,
      sede_correcta: matrixResult.matrix.filter((row) => row.estado_match !== 'SEDE_INCORRECTA').length,
      sede_incorrecta: matrixResult.matrix.filter((row) => row.estado_match === 'SEDE_INCORRECTA').length,
      modalidad_correcta: matrixResult.matrix.filter((row) => row.estado_match !== 'MODALIDAD_INCORRECTA').length,
      modalidad_incorrecta: matrixResult.matrix.filter((row) => row.estado_match === 'MODALIDAD_INCORRECTA').length,
    };

    const previewPayload = {
      archivo: {
        path: FOCALIZACION_FILE,
        sha256: FOCALIZACION_SHA,
      },
      carga_auditada: currentLoad,
      counts,
      municipios_xlsx: xlsxMunicipios,
      municipios_bd: currentMunicipios,
      municipios_desalineados: misalignedMunicipios,
      mismatches: Object.fromEntries([...matrixResult.mismatches.entries()].sort((a, b) => b[1] - a[1])),
      repair_preview: repairPreview.previewRows,
      trees: repairPreview.trees,
      simulation,
      bd_before: personalReport.bd_before,
      bd_after: personalReport.bd_after,
      escrituras_bd: 0,
    };

    await mkdir(path.resolve('reports'), { recursive: true });
    await Promise.all([
      writeFile(path.resolve(OUTPUT_JSON), JSON.stringify(previewPayload, null, 2), 'utf8'),
      writeFile(path.resolve(OUTPUT_CSV), buildCsv(repairPreview.previewRows, [
        'tabla',
        'id',
        'operacion_propuesta',
        'valor_actual',
        'valor_correcto',
        'motivo',
        'fuente',
      ]), 'utf8'),
    ]);

    console.log(JSON.stringify({
      rows_auditadas: counts.filas_auditadas,
      municipios_desalineados: misalignedMunicipios,
      mismatch_counts: previewPayload.mismatches,
      preview_rows: repairPreview.previewRows.length,
      simulation,
      reportes: {
        json: OUTPUT_JSON,
        csv: OUTPUT_CSV,
      },
      escrituras_bd: 0,
    }, null, 2));

    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : JSON.stringify(error));
  process.exitCode = 1;
});
