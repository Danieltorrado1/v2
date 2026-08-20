import * as XLSX from 'xlsx';

import { normalizeFocalizacionText, coerceOptionalInteger } from './cobertura.focalizacion.domain';

export type BootstrapAction = 'CREAR' | 'REUTILIZAR' | 'REVISAR';
export type BootstrapStatus = 'OK' | BootstrapAction | 'ERROR';

export interface BootstrapSourceRow {
  fila: number;
  municipio: string;
  institucion: string;
  sede: string;
  modalidad: string;
  consecutivo: string | null;
  focalizacion: unknown;
}

export interface BootstrapCatalogs {
  municipios: Array<{ id: string; codigo_dane: string | null; nombre_municipio: string }>;
  instituciones: Array<{ id: string; contrato_id: string | null; municipio_id: string | null; codigo_dane: string | null; nombre_institucion: string }>;
  sedes: Array<{ id: string; institucion_id: string; municipio_id: string | null; codigo_dane: string | null; consecutivo_sede: string | null; nombre_sede: string }>;
  modalidades: Array<{ id: string; codigo_original: string | null; codigo_base: string | null; nombre_modalidad: string }>;
  modalidadAliases: Array<{ modalidad_id: string; alias: string }>;
  institucionHistorial: Array<{ institucion_id: string; nombre_normalizado: string; codigo_dane: string | null }>;
  sedeHistorial: Array<{ sede_id: string; nombre_normalizado: string; codigo_dane: string | null; consecutivo_sede: string | null }>;
  sedeModalidades: Array<{ id: string; sede_id: string; modalidad_id: string; contrato_id: string }>;
}

export interface BootstrapDetail {
  fila: number;
  municipio_original: string;
  municipio_resuelto: string | null;
  institucion_original: string;
  institucion_normalizada: string;
  institucion_id_existente: string | null;
  accion_institucion: BootstrapAction;
  sede_original: string;
  sede_normalizada: string;
  sede_id_existente: string | null;
  accion_sede: BootstrapAction;
  modalidad_original: string;
  modalidad_resuelta: string | null;
  modalidad_id: string | null;
  accion_sede_modalidad: BootstrapAction;
  focalizacion_original: unknown;
  estado: BootstrapStatus;
  observaciones: string[];
}

export interface ParsedBootstrapWorkbook {
  hoja: string;
  columnas: string[];
  filas: BootstrapSourceRow[];
}

const text = (value: unknown): string => value === null || value === undefined ? '' : String(value).trim();
const code = (value: string | null): string => normalizeFocalizacionText(value);
const unique = <T>(items: T[]): T[] => Array.from(new Set(items));

const presentation = (value: string): string => {
  const normalized = normalizeFocalizacionText(value);
  return normalized.replace(/^INSTITUCION EDUCATIVA\b/, 'INSTITUCIÓN EDUCATIVA');
};

export const parseBootstrapWorkbook = (buffer: Buffer): ParsedBootstrapWorkbook => {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const hoja = workbook.SheetNames.find((name) => normalizeFocalizacionText(name) === 'DETALLADO') ?? workbook.SheetNames[0];
  if (!hoja || !workbook.Sheets[hoja]) throw new Error('XLSX_SIN_HOJAS');
  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[hoja], { header: 1, defval: null, raw: true }) as unknown[][];
  const headerIndex = rows.findIndex((row) => {
    const cells = row.map((cell) => code(text(cell)));
    return cells.includes('MUNICIPIO') && cells.some((cell) => cell.includes('INSTITUCION EDUCATIVA')) && cells.some((cell) => cell.includes('SEDE EDUCATIVA')) && cells.some((cell) => cell.includes('MODALIDAD'));
  });
  if (headerIndex < 0) throw new Error('XLSX_ENCABEZADOS_NO_RECONOCIDOS');
  const header = rows[headerIndex] ?? [];
  const normalized = header.map((cell) => code(text(cell)));
  const find = (predicate: (value: string) => boolean): number => normalized.findIndex(predicate);
  const indexes = {
    consecutivo: find((v) => v === 'CONSECUTIVO'),
    municipio: find((v) => v === 'MUNICIPIO'),
    institucion: find((v) => v.includes('INSTITUCION EDUCATIVA')),
    sede: find((v) => v.includes('SEDE EDUCATIVA')),
    modalidad: find((v) => v.includes('MODALIDAD')),
  };
  const previous = rows[headerIndex - 1] ?? [];
  let group = '';
  let focalizacion = -1;
  for (let index = 0; index < Math.max(previous.length, header.length); index += 1) {
    const groupCell = code(text(previous[index]));
    if (groupCell) group = groupCell;
    if (group.includes('FOCALIZACION') && code(text(header[index])) === 'TOTAL') focalizacion = index;
  }
  if (Object.values(indexes).some((index) => index < 0) || focalizacion < 0) throw new Error('XLSX_COLUMNAS_REQUERIDAS_FALTANTES');
  const parsed: BootstrapSourceRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const institucion = text(row[indexes.institucion]);
    const sede = text(row[indexes.sede]);
    const modalidad = text(row[indexes.modalidad]);
    const municipio = text(row[indexes.municipio]);
    // Totales, notas y artefactos de formato no son filas maestras útiles.
    if (!municipio || !institucion || !sede || !modalidad) continue;
    parsed.push({
      fila: index + 1,
      municipio,
      institucion,
      sede,
      modalidad,
      consecutivo: text(row[indexes.consecutivo]) || null,
      focalizacion: coerceOptionalInteger(row[focalizacion]),
    });
  }
  return { hoja, columnas: header.map(text).filter(Boolean), filas: parsed };
};

const institutionCode = (consecutivo: string | null): string | null => {
  const digits = consecutivo?.replace(/\D/g, '') ?? '';
  return digits.length >= 12 ? digits.slice(0, 12) : null;
};

const matchesByPriority = <T extends { id: string }>(groups: T[][]): T[] => {
  for (const group of groups) if (group.length > 0) return group;
  return [];
};

export const planBootstrap = (rows: BootstrapSourceRow[], catalogs: BootstrapCatalogs, contratoId: string | null): BootstrapDetail[] => {
  const plannedInstitutions = new Map<string, BootstrapAction>();
  const plannedSedes = new Map<string, BootstrapAction>();
  const plannedRelations = new Set<string>();
  const exactRows = new Map<string, number[]>();
  const sedeNamesByCode = new Map<string, Set<string>>();
  for (const row of rows) {
    const signature = [code(row.municipio), code(row.institucion), code(row.sede), code(row.modalidad), String(row.focalizacion ?? '')].join('|');
    exactRows.set(signature, [...(exactRows.get(signature) ?? []), row.fila]);
    const sedeCode = row.consecutivo?.replace(/\D/g, '') ?? '';
    if (sedeCode) {
      const names = sedeNamesByCode.get(sedeCode) ?? new Set<string>();
      names.add(code(row.sede));
      sedeNamesByCode.set(sedeCode, names);
    }
  }

  return rows.map((row) => {
    const observations: string[] = [];
    const rowDigits = row.consecutivo?.replace(/\D/g, '') ?? '';
    const municipioCode = rowDigits.length >= 6 ? rowDigits.slice(1, 6) : null;
    const byMunicipioCode = catalogs.municipios.filter((item) => !!municipioCode && item.codigo_dane === municipioCode);
    const municipioMatches = byMunicipioCode.length > 0
      ? byMunicipioCode
      : catalogs.municipios.filter((item) => code(item.nombre_municipio) === code(row.municipio) || code(item.codigo_dane) === code(row.municipio));
    const municipio = municipioMatches.length === 1 ? municipioMatches[0] : undefined;
    if (!municipio) observations.push('MUNICIPIO_NO_RECONOCIDO');
    const instNorm = code(row.institucion);
    const instCode = institutionCode(row.consecutivo);
    const historyIds = unique(catalogs.institucionHistorial.filter((h) => h.nombre_normalizado === instNorm || (!!instCode && h.codigo_dane === instCode)).map((h) => h.institucion_id));
    const institutionCandidates = catalogs.instituciones.filter((item) =>
      (!contratoId || item.contrato_id === contratoId) && (!municipio || item.municipio_id === municipio.id)
    );
    const institutionMatches = matchesByPriority([
      institutionCandidates.filter((item) => historyIds.includes(item.id)),
      institutionCandidates.filter((item) => !!instCode && item.codigo_dane === instCode),
      institutionCandidates.filter((item) => code(item.nombre_institucion) === instNorm && (!municipio || item.municipio_id === municipio.id)),
    ]);
    const institution = institutionMatches.length === 1 ? institutionMatches[0] : undefined;
    const instKey = `${municipio?.id ?? code(row.municipio)}|${instCode ?? ''}|${instNorm}`;
    let instAction: BootstrapAction = institutionMatches.length > 1 ? 'REVISAR' : institution ? 'REUTILIZAR' : municipio ? 'CREAR' : 'REVISAR';
    if (plannedInstitutions.has(instKey)) instAction = plannedInstitutions.get(instKey) as BootstrapAction;
    else plannedInstitutions.set(instKey, instAction);
    if (institutionMatches.length > 1) observations.push('INSTITUCION_AMBIGUA');

    const sedeNorm = code(row.sede);
    const sedeCode = row.consecutivo?.replace(/\D/g, '') || null;
    const sedeCodeConflict = !!sedeCode && (sedeNamesByCode.get(sedeCode)?.size ?? 0) > 1;
    const sedeHistoryIds = unique(catalogs.sedeHistorial.filter((h) => h.nombre_normalizado === sedeNorm || (!!sedeCode && (h.codigo_dane === sedeCode || h.consecutivo_sede === sedeCode))).map((h) => h.sede_id));
    const sedeCandidates = catalogs.sedes.filter((item) => !institution || item.institucion_id === institution.id);
    const sedeMatches = matchesByPriority([
      sedeCandidates.filter((item) => sedeHistoryIds.includes(item.id)),
      sedeCandidates.filter((item) => !!sedeCode && (item.codigo_dane === sedeCode || item.consecutivo_sede === sedeCode)),
      sedeCandidates.filter((item) => code(item.nombre_sede) === sedeNorm && (!municipio || item.municipio_id === municipio.id)),
    ]);
    const sede = sedeMatches.length === 1 ? sedeMatches[0] : undefined;
    const sedeKey = `${institution?.id ?? instKey}|${sedeCode ?? ''}|${sedeNorm}`;
    let sedeAction: BootstrapAction = sedeCodeConflict || sedeMatches.length > 1 ? 'REVISAR' : sede ? 'REUTILIZAR' : instAction === 'REVISAR' ? 'REVISAR' : 'CREAR';
    if (plannedSedes.has(sedeKey)) sedeAction = plannedSedes.get(sedeKey) as BootstrapAction;
    else plannedSedes.set(sedeKey, sedeAction);
    if (sedeMatches.length > 1) observations.push('SEDE_AMBIGUA');
    if (sedeCodeConflict) observations.push(`SEDE_CODIGO_CONFLICTIVO:${sedeCode}`);

    const modalidadNorm = code(row.modalidad);
    const original = catalogs.modalidades.filter((item) => code(item.codigo_original) === modalidadNorm);
    const aliasIds = unique(catalogs.modalidadAliases.filter((item) => code(item.alias) === modalidadNorm).map((item) => item.modalidad_id));
    const byAlias = catalogs.modalidades.filter((item) => aliasIds.includes(item.id));
    const bySecondaryText = catalogs.modalidades.filter((item) => [item.codigo_base, item.nombre_modalidad].some((v) => code(v) === modalidadNorm));
    const modalidadMatches = matchesByPriority([original, byAlias, bySecondaryText]);
    const modalidad = modalidadMatches.length === 1 ? modalidadMatches[0] : undefined;
    if (!modalidad) observations.push('MODALIDAD_NO_RECONOCIDA');
    const relationKey = `${sede?.id ?? sedeKey}|${modalidad?.id ?? modalidadNorm}|${contratoId ?? 'SIN_CONTRATO'}`;
    const relation = sede && modalidad && contratoId ? catalogs.sedeModalidades.find((item) => item.sede_id === sede.id && item.modalidad_id === modalidad.id && item.contrato_id === contratoId) : undefined;
    let relationAction: BootstrapAction = !modalidad || sedeAction === 'REVISAR' ? 'REVISAR' : relation ? 'REUTILIZAR' : 'CREAR';
    if (plannedRelations.has(relationKey) && !relation) relationAction = 'CREAR';
    plannedRelations.add(relationKey);
    const duplicates = exactRows.get([code(row.municipio), instNorm, sedeNorm, modalidadNorm, String(row.focalizacion ?? '')].join('|')) ?? [];
    if (duplicates.length > 1) observations.push(`DUPLICADO_EXACTO:${duplicates.filter((n) => n !== row.fila).join(',')}`);
    if (!contratoId) observations.push('CONTRATO_DESTINO_NO_EXISTE');
    const actions = [instAction, sedeAction, relationAction];
    const estado: BootstrapStatus = observations.some((o) => o.includes('NO_RECONOCIDO') || o === 'CONTRATO_DESTINO_NO_EXISTE') ? 'ERROR' : actions.includes('REVISAR') ? 'REVISAR' : actions.includes('CREAR') ? 'CREAR' : actions.every((a) => a === 'REUTILIZAR') ? 'REUTILIZAR' : 'OK';
    return {
      fila: row.fila, municipio_original: row.municipio, municipio_resuelto: municipio?.nombre_municipio ?? null,
      institucion_original: row.institucion, institucion_normalizada: presentation(row.institucion), institucion_id_existente: institution?.id ?? null, accion_institucion: instAction,
      sede_original: row.sede, sede_normalizada: presentation(row.sede), sede_id_existente: sede?.id ?? null, accion_sede: sedeAction,
      modalidad_original: row.modalidad, modalidad_resuelta: modalidad?.codigo_original ?? modalidad?.nombre_modalidad ?? null, modalidad_id: modalidad?.id ?? null, accion_sede_modalidad: relationAction,
      focalizacion_original: row.focalizacion, estado, observaciones: observations,
    };
  });
};

export const summarizeBootstrap = (details: BootstrapDetail[]) => {
  const countUnique = (key: (row: BootstrapDetail) => string) => new Set(details.map(key)).size;
  const actions = (field: 'accion_institucion' | 'accion_sede' | 'accion_sede_modalidad', key: (row: BootstrapDetail) => string) => {
    const selected = new Map<string, BootstrapAction>();
    for (const row of details) selected.set(key(row), row[field]);
    return { crear: [...selected.values()].filter((v) => v === 'CREAR').length, reutilizar: [...selected.values()].filter((v) => v === 'REUTILIZAR').length, revisar: [...selected.values()].filter((v) => v === 'REVISAR').length };
  };
  return {
    filas_procesadas: details.length,
    municipios_unicos: countUnique((r) => code(r.municipio_original)),
    municipios_reconocidos: new Set(details.filter((r) => r.municipio_resuelto).map((r) => code(r.municipio_original))).size,
    municipios_no_reconocidos: unique(details.filter((r) => r.observaciones.includes('MUNICIPIO_NO_RECONOCIDO')).map((r) => r.municipio_original)),
    instituciones: { unicas: countUnique((r) => `${code(r.municipio_original)}|${r.institucion_normalizada}`), ...actions('accion_institucion', (r) => `${code(r.municipio_original)}|${r.institucion_normalizada}`) },
    sedes: { unicas: countUnique((r) => `${code(r.municipio_original)}|${r.institucion_normalizada}|${r.sede_normalizada}`), ...actions('accion_sede', (r) => `${code(r.municipio_original)}|${r.institucion_normalizada}|${r.sede_normalizada}`) },
    modalidades: { encontradas: unique(details.map((r) => r.modalidad_original)), reconocidas: unique(details.filter((r) => r.modalidad_id).map((r) => r.modalidad_original)), no_reconocidas: unique(details.filter((r) => !r.modalidad_id).map((r) => r.modalidad_original)) },
    sede_modalidades: { unicas: countUnique((r) => `${code(r.municipio_original)}|${r.institucion_normalizada}|${r.sede_normalizada}|${r.modalidad_id ?? code(r.modalidad_original)}`), ...actions('accion_sede_modalidad', (r) => `${code(r.municipio_original)}|${r.institucion_normalizada}|${r.sede_normalizada}|${r.modalidad_id ?? code(r.modalidad_original)}`) },
    duplicados: details.filter((r) => r.observaciones.some((o) => o.startsWith('DUPLICADO_EXACTO'))).length,
    conflictos: details.filter((r) => r.estado === 'REVISAR').length,
    errores: details.filter((r) => r.estado === 'ERROR').length,
    advertencias: details.filter((r) => r.observaciones.length > 0).length,
  };
};
