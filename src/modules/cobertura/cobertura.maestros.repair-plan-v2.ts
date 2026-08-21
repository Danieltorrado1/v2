import { resolveMunicipioId } from './cobertura.focalizacion.service';

export type MunicipioEstado = 'MUNICIPIO_INCORRECTO' | 'OK';
export type RepairTableName = 'focalizacion_final' | 'focalizacion_vigencias' | 'instituciones' | 'sedes';
export type RepairSafety = 'NO' | 'SI';

export interface ParsedWorkbookLineageRow {
  consecutivo: string | null;
  fila_origen: number;
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  sede: string | null;
}

export interface RepairMunicipioRow {
  codigo_dane?: string | null;
  id: string | number;
  nombre_municipio: string;
}

export interface RepairInstitucionRow {
  id: string | number;
  municipio_id: string | number | null;
  nombre_institucion: string;
}

export interface RepairSedeRow {
  consecutivo_sede: string | null;
  id: string | number;
  institucion_id: string | number;
  municipio_id: string | number | null;
  nombre_sede: string;
}

export interface RepairModalidadRow {
  id: string | number;
  nombre_modalidad: string;
}

export interface RepairPreliminarRow {
  fila_origen: number;
  focalizacion_vigencia_id: string | number | null;
  id: string | number;
}

export interface RepairVigenciaRow {
  id: string | number;
  municipio_id: string | number | null;
  preliminar_id: string | number | null;
}

export interface RepairFinalRow {
  id: string | number;
  institucion_final: string;
  institucion_id: string | number | null;
  modalidad_final: string;
  modalidad_id: string | number | null;
  municipio_id: string | number | null;
  municipio_texto: string | null;
  preliminar_id: string | number | null;
  sede_final: string;
  sede_id: string | number | null;
  sede_modalidad_id: string | number | null;
}

export interface ExactMunicipioMatrixRow {
  consecutivo: string | null;
  estado_municipio: MunicipioEstado;
  final_id: number;
  fila_origen: number;
  institucion_bd: string | null;
  institucion_id: number;
  institucion_municipio_id_actual: number | null;
  institucion_xlsx: string | null;
  modalidad_bd: string | null;
  modalidad_xlsx: string | null;
  municipio_bd_actual: string | null;
  municipio_id_bd_actual: number | null;
  municipio_id_esperado: number;
  municipio_xlsx: string | null;
  preliminar_id: number;
  sede_bd: string | null;
  sede_id: number;
  sede_modalidad_id: number;
  sede_municipio_id_actual: number | null;
  sede_xlsx: string | null;
  vigencia_id: number;
  vigencia_municipio_id_actual: number | null;
}

export interface EntityMunicipioAssessment {
  entity_id: number;
  entity_label: string;
  expected_municipio_ids: number[];
  expected_municipios: string[];
  filas_oficiales: number[];
  seguridad: 'INSTITUCION_MIXTA_NO_SEGURA' | 'INSTITUCION_SEGURA_PARA_UPDATE' | 'SEDE_MIXTA_NO_SEGURA' | 'SEDE_SEGURA_PARA_UPDATE';
  tabla: 'instituciones' | 'sedes';
}

export interface RepairPlanOperation {
  campo: string;
  fila_origen_evidencia: number;
  id: number;
  motivo: string;
  preliminar_id: number;
  seguro_si_no: RepairSafety;
  tabla: RepairTableName;
  valor_actual: string;
  valor_nuevo: string;
}

const normalizeText = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const ensureUnique = <T extends { id: string | number }>(
  target: Map<number, T>,
  rows: T[],
  label: string,
): void => {
  for (const row of rows) {
    const id = toNumber(row.id);
    if (id === null) {
      throw new Error(`${label} without numeric id.`);
    }
    if (target.has(id)) {
      throw new Error(`Duplicate ${label} id ${id}.`);
    }
    target.set(id, row);
  }
};

const ensureUniqueByKey = <T>(
  rows: T[],
  getKey: (row: T) => string | number | null,
  label: string,
): Map<string, T> => {
  const map = new Map<string, T>();
  for (const row of rows) {
    const rawKey = getKey(row);
    if (rawKey === null || rawKey === undefined || rawKey === '') {
      throw new Error(`${label} without key.`);
    }
    const key = String(rawKey);
    if (map.has(key)) {
      throw new Error(`Duplicate ${label} key ${key}.`);
    }
    map.set(key, row);
  }
  return map;
};

export const buildExactMunicipioMatrix = (input: {
  finales: RepairFinalRow[];
  instituciones: RepairInstitucionRow[];
  modalidades: RepairModalidadRow[];
  municipios: RepairMunicipioRow[];
  parsedRows: ParsedWorkbookLineageRow[];
  preliminar: RepairPreliminarRow[];
  sedes: RepairSedeRow[];
  vigencias: RepairVigenciaRow[];
}): ExactMunicipioMatrixRow[] => {
  const municipiosById = new Map<number, RepairMunicipioRow>();
  ensureUnique(municipiosById, input.municipios, 'municipio');

  const institucionesById = new Map<number, RepairInstitucionRow>();
  ensureUnique(institucionesById, input.instituciones, 'institucion');

  const sedesById = new Map<number, RepairSedeRow>();
  ensureUnique(sedesById, input.sedes, 'sede');

  const modalidadesById = new Map<number, RepairModalidadRow>();
  ensureUnique(modalidadesById, input.modalidades, 'modalidad');

  const preliminarByFila = ensureUniqueByKey(input.preliminar, (row) => row.fila_origen, 'preliminar fila_origen');
  const vigenciaById = new Map<number, RepairVigenciaRow>();
  ensureUnique(vigenciaById, input.vigencias, 'vigencia');
  const finalByPreliminar = ensureUniqueByKey(input.finales, (row) => row.preliminar_id, 'final preliminar_id');

  const matrix: ExactMunicipioMatrixRow[] = [];

  for (const parsedRow of input.parsedRows) {
    const preliminar = preliminarByFila.get(String(parsedRow.fila_origen));
    if (!preliminar) {
      throw new Error(`Missing preliminar for fila_origen ${parsedRow.fila_origen}.`);
    }

    const preliminarId = toNumber(preliminar.id);
    const vigenciaId = toNumber(preliminar.focalizacion_vigencia_id);
    if (preliminarId === null || vigenciaId === null) {
      throw new Error(`Broken lineage for fila_origen ${parsedRow.fila_origen}.`);
    }

    const vigencia = vigenciaById.get(vigenciaId);
    if (!vigencia) {
      throw new Error(`Missing vigencia ${vigenciaId} for fila_origen ${parsedRow.fila_origen}.`);
    }
    if (toNumber(vigencia.preliminar_id) !== preliminarId) {
      throw new Error(`Vigencia ${vigenciaId} does not point back to preliminar ${preliminarId}.`);
    }

    const finalRow = finalByPreliminar.get(String(preliminarId));
    if (!finalRow) {
      throw new Error(`Missing final for preliminar ${preliminarId}.`);
    }

    const finalId = toNumber(finalRow.id);
    const institucionId = toNumber(finalRow.institucion_id);
    const sedeId = toNumber(finalRow.sede_id);
    const sedeModalidadId = toNumber(finalRow.sede_modalidad_id);
    const modalidadId = toNumber(finalRow.modalidad_id);
    if (
      finalId === null ||
      institucionId === null ||
      sedeId === null ||
      sedeModalidadId === null ||
      modalidadId === null
    ) {
      throw new Error(`Incomplete final lineage for fila_origen ${parsedRow.fila_origen}.`);
    }

    const institucion = institucionesById.get(institucionId) ?? null;
    const sede = sedesById.get(sedeId) ?? null;
    const modalidad = modalidadesById.get(modalidadId) ?? null;
    const expectedMunicipioId = resolveMunicipioId(parsedRow.municipio, input.municipios as never, parsedRow.consecutivo);
    if (expectedMunicipioId === null) {
      throw new Error(`Municipio XLSX could not be resolved for fila_origen ${parsedRow.fila_origen}.`);
    }

    const currentMunicipioId = toNumber(finalRow.municipio_id);
    const currentMunicipio = currentMunicipioId === null ? null : municipiosById.get(currentMunicipioId) ?? null;

    matrix.push({
      fila_origen: parsedRow.fila_origen,
      consecutivo: parsedRow.consecutivo,
      preliminar_id: preliminarId,
      vigencia_id: vigenciaId,
      final_id: finalId,
      sede_modalidad_id: sedeModalidadId,
      sede_id: sedeId,
      institucion_id: institucionId,
      municipio_xlsx: parsedRow.municipio,
      municipio_id_esperado: expectedMunicipioId,
      municipio_bd_actual: currentMunicipio?.nombre_municipio ?? finalRow.municipio_texto ?? null,
      municipio_id_bd_actual: currentMunicipioId,
      institucion_xlsx: parsedRow.institucion,
      institucion_bd: finalRow.institucion_final ?? institucion?.nombre_institucion ?? null,
      modalidad_xlsx: parsedRow.modalidad,
      modalidad_bd: finalRow.modalidad_final ?? modalidad?.nombre_modalidad ?? null,
      sede_xlsx: parsedRow.sede,
      sede_bd: finalRow.sede_final ?? sede?.nombre_sede ?? null,
      estado_municipio: expectedMunicipioId === currentMunicipioId ? 'OK' : 'MUNICIPIO_INCORRECTO',
      vigencia_municipio_id_actual: toNumber(vigencia.municipio_id),
      institucion_municipio_id_actual: institucion ? toNumber(institucion.municipio_id) : null,
      sede_municipio_id_actual: sede ? toNumber(sede.municipio_id) : null,
    });
  }

  return matrix.sort((left, right) => left.fila_origen - right.fila_origen);
};

const buildEntityAssessment = (
  matrix: ExactMunicipioMatrixRow[],
  affectedEntityIds: Set<number>,
  table: 'instituciones' | 'sedes',
): EntityMunicipioAssessment[] => {
  const grouped = new Map<number, ExactMunicipioMatrixRow[]>();
  for (const row of matrix) {
    const entityId = table === 'instituciones' ? row.institucion_id : row.sede_id;
    if (!affectedEntityIds.has(entityId)) continue;
    const list = grouped.get(entityId) ?? [];
    list.push(row);
    grouped.set(entityId, list);
  }

  return [...grouped.entries()]
    .map(([entityId, rows]) => {
      const municipiosById = new Map<number, string>();
      for (const row of rows) {
        municipiosById.set(row.municipio_id_esperado, row.municipio_xlsx ?? '');
      }
      const expectedMunicipioIds = [...municipiosById.keys()].sort((left, right) => left - right);
      const expectedMunicipios = expectedMunicipioIds.map((id) => municipiosById.get(id) ?? String(id));
      const seguridad: EntityMunicipioAssessment['seguridad'] = table === 'instituciones'
        ? (expectedMunicipioIds.length === 1 ? 'INSTITUCION_SEGURA_PARA_UPDATE' : 'INSTITUCION_MIXTA_NO_SEGURA')
        : (expectedMunicipioIds.length === 1 ? 'SEDE_SEGURA_PARA_UPDATE' : 'SEDE_MIXTA_NO_SEGURA');
      return {
        entity_id: entityId,
        entity_label: table === 'instituciones' ? (rows[0]?.institucion_bd ?? String(entityId)) : (rows[0]?.sede_bd ?? String(entityId)),
        expected_municipio_ids: expectedMunicipioIds,
        expected_municipios: expectedMunicipios,
        filas_oficiales: rows.map((row) => row.fila_origen).sort((left, right) => left - right),
        seguridad,
        tabla: table,
      };
    })
    .sort((left, right) => left.entity_id - right.entity_id);
};

export const classifyAffectedEntities = (matrix: ExactMunicipioMatrixRow[]): {
  instituciones: EntityMunicipioAssessment[];
  sedes: EntityMunicipioAssessment[];
} => {
  const affectedRows = matrix.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO');
  return {
    instituciones: buildEntityAssessment(
      matrix,
      new Set(affectedRows.map((row) => row.institucion_id)),
      'instituciones',
    ),
    sedes: buildEntityAssessment(
      matrix,
      new Set(affectedRows.map((row) => row.sede_id)),
      'sedes',
    ),
  };
};

const formatMunicipioValue = (
  municipioId: number | null | undefined,
  municipiosById: Map<number, RepairMunicipioRow>,
  fallbackLabel?: string | null,
): string => {
  if (municipioId === null || municipioId === undefined) {
    return `NULL|${fallbackLabel ?? 'SIN_MUNICIPIO'}`;
  }
  const municipio = municipiosById.get(municipioId);
  return `${municipioId}|${municipio?.nombre_municipio ?? fallbackLabel ?? 'SIN_MUNICIPIO'}`;
};

const upsertOperation = (
  target: Map<string, RepairPlanOperation>,
  operation: RepairPlanOperation,
): void => {
  const key = `${operation.tabla}|${operation.id}|${operation.campo}`;
  const existing = target.get(key);
  if (!existing) {
    target.set(key, operation);
    return;
  }

  if (
    existing.valor_nuevo !== operation.valor_nuevo ||
    existing.seguro_si_no !== operation.seguro_si_no
  ) {
    throw new Error(`Conflicting operation for ${key}.`);
  }

  if (operation.fila_origen_evidencia < existing.fila_origen_evidencia) {
    target.set(key, operation);
  }
};

export const buildRepairPlanV2 = (input: {
  finales: RepairFinalRow[];
  instituciones: RepairInstitucionRow[];
  matrix: ExactMunicipioMatrixRow[];
  municipios: RepairMunicipioRow[];
  sedes: RepairSedeRow[];
  vigencias: RepairVigenciaRow[];
}): {
  discarded_operations: RepairPlanOperation[];
  safe_operations: RepairPlanOperation[];
} => {
  const municipiosById = new Map<number, RepairMunicipioRow>();
  ensureUnique(municipiosById, input.municipios, 'municipio');

  const institucionesById = new Map<number, RepairInstitucionRow>();
  ensureUnique(institucionesById, input.instituciones, 'institucion');

  const sedesById = new Map<number, RepairSedeRow>();
  ensureUnique(sedesById, input.sedes, 'sede');

  const vigenciasById = new Map<number, RepairVigenciaRow>();
  ensureUnique(vigenciasById, input.vigencias, 'vigencia');

  const finalesById = new Map<number, RepairFinalRow>();
  ensureUnique(finalesById, input.finales, 'final');

  const affected = input.matrix.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO');
  const assessments = classifyAffectedEntities(input.matrix);
  const institucionesBySafety = new Map<number, EntityMunicipioAssessment>(
    assessments.instituciones.map((item) => [item.entity_id, item]),
  );
  const sedesBySafety = new Map<number, EntityMunicipioAssessment>(
    assessments.sedes.map((item) => [item.entity_id, item]),
  );

  const safeOperations = new Map<string, RepairPlanOperation>();
  const discardedOperations = new Map<string, RepairPlanOperation>();

  for (const row of affected) {
    const expectedValue = formatMunicipioValue(row.municipio_id_esperado, municipiosById, row.municipio_xlsx);
    const finalRow = finalesById.get(row.final_id);
    const vigenciaRow = vigenciasById.get(row.vigencia_id);
    const institucionRow = institucionesById.get(row.institucion_id);
    const sedeRow = sedesById.get(row.sede_id);
    if (!finalRow || !vigenciaRow || !institucionRow || !sedeRow) {
      throw new Error(`Missing entity row for fila_origen ${row.fila_origen}.`);
    }

    upsertOperation(safeOperations, {
      tabla: 'focalizacion_final',
      id: row.final_id,
      campo: 'municipio_id, municipio_texto',
      valor_actual: formatMunicipioValue(toNumber(finalRow.municipio_id), municipiosById, finalRow.municipio_texto),
      valor_nuevo: expectedValue,
      fila_origen_evidencia: row.fila_origen,
      preliminar_id: row.preliminar_id,
      motivo: `Linaje exacto fila_origen ${row.fila_origen}: final ${row.final_id} debe usar el municipio explícito del XLSX.`,
      seguro_si_no: 'SI',
    });

    upsertOperation(safeOperations, {
      tabla: 'focalizacion_vigencias',
      id: row.vigencia_id,
      campo: 'municipio_id',
      valor_actual: formatMunicipioValue(toNumber(vigenciaRow.municipio_id), municipiosById),
      valor_nuevo: expectedValue,
      fila_origen_evidencia: row.fila_origen,
      preliminar_id: row.preliminar_id,
      motivo: `Linaje exacto fila_origen ${row.fila_origen}: vigencia ${row.vigencia_id} deriva exclusivamente del preliminar ${row.preliminar_id}.`,
      seguro_si_no: 'SI',
    });

    const institucionAssessment = institucionesBySafety.get(row.institucion_id);
    if (!institucionAssessment) {
      throw new Error(`Missing institution assessment for ${row.institucion_id}.`);
    }
    const institucionOperation: RepairPlanOperation = {
      tabla: 'instituciones',
      id: row.institucion_id,
      campo: 'municipio_id',
      valor_actual: formatMunicipioValue(toNumber(institucionRow.municipio_id), municipiosById),
      valor_nuevo: institucionAssessment.expected_municipio_ids.length === 1
        ? formatMunicipioValue(institucionAssessment.expected_municipio_ids[0], municipiosById)
        : institucionAssessment.expected_municipio_ids.map((id) => formatMunicipioValue(id, municipiosById)).join(' | '),
      fila_origen_evidencia: row.fila_origen,
      preliminar_id: row.preliminar_id,
      motivo: institucionAssessment.expected_municipio_ids.length === 1
        ? `Todas las filas oficiales de institucion_id ${row.institucion_id} esperan el mismo municipio.`
        : `institucion_id ${row.institucion_id} aparece en filas oficiales con municipios esperados distintos: ${institucionAssessment.filas_oficiales.join(', ')}.`,
      seguro_si_no: institucionAssessment.seguridad === 'INSTITUCION_SEGURA_PARA_UPDATE' ? 'SI' : 'NO',
    };
    upsertOperation(
      institucionAssessment.seguridad === 'INSTITUCION_SEGURA_PARA_UPDATE' ? safeOperations : discardedOperations,
      institucionOperation,
    );

    const sedeAssessment = sedesBySafety.get(row.sede_id);
    if (!sedeAssessment) {
      throw new Error(`Missing sede assessment for ${row.sede_id}.`);
    }
    const sedeOperation: RepairPlanOperation = {
      tabla: 'sedes',
      id: row.sede_id,
      campo: 'municipio_id',
      valor_actual: formatMunicipioValue(toNumber(sedeRow.municipio_id), municipiosById),
      valor_nuevo: sedeAssessment.expected_municipio_ids.length === 1
        ? formatMunicipioValue(sedeAssessment.expected_municipio_ids[0], municipiosById)
        : sedeAssessment.expected_municipio_ids.map((id) => formatMunicipioValue(id, municipiosById)).join(' | '),
      fila_origen_evidencia: row.fila_origen,
      preliminar_id: row.preliminar_id,
      motivo: sedeAssessment.expected_municipio_ids.length === 1
        ? `Todas las filas oficiales de sede_id ${row.sede_id} esperan el mismo municipio.`
        : `sede_id ${row.sede_id} aparece en filas oficiales con municipios esperados distintos: ${sedeAssessment.filas_oficiales.join(', ')}.`,
      seguro_si_no: sedeAssessment.seguridad === 'SEDE_SEGURA_PARA_UPDATE' ? 'SI' : 'NO',
    };
    upsertOperation(
      sedeAssessment.seguridad === 'SEDE_SEGURA_PARA_UPDATE' ? safeOperations : discardedOperations,
      sedeOperation,
    );
  }

  return {
    safe_operations: [...safeOperations.values()].sort((left, right) =>
      left.tabla.localeCompare(right.tabla, 'es') ||
      left.id - right.id ||
      left.fila_origen_evidencia - right.fila_origen_evidencia,
    ),
    discarded_operations: [...discardedOperations.values()].sort((left, right) =>
      left.tabla.localeCompare(right.tabla, 'es') ||
      left.id - right.id ||
      left.fila_origen_evidencia - right.fila_origen_evidencia,
    ),
  };
};

export const simulateMunicipioRepairMatrix = (input: {
  matrix: ExactMunicipioMatrixRow[];
  operations: RepairPlanOperation[];
  municipios: RepairMunicipioRow[];
}): ExactMunicipioMatrixRow[] => {
  const municipiosById = new Map<number, RepairMunicipioRow>();
  ensureUnique(municipiosById, input.municipios, 'municipio');

  const finalMunicipioById = new Map<number, number | null>(
    input.matrix.map((row) => [row.final_id, row.municipio_id_bd_actual]),
  );

  for (const operation of input.operations) {
    if (operation.seguro_si_no !== 'SI') continue;
    if (operation.tabla !== 'focalizacion_final') continue;
    const targetMunicipioId = Number(operation.valor_nuevo.split('|')[0]);
    finalMunicipioById.set(operation.id, Number.isFinite(targetMunicipioId) ? targetMunicipioId : null);
  }

  return input.matrix.map((row) => {
    const nextMunicipioId = finalMunicipioById.get(row.final_id) ?? row.municipio_id_bd_actual;
    const municipio = nextMunicipioId === null ? null : municipiosById.get(nextMunicipioId) ?? null;
    return {
      ...row,
      municipio_id_bd_actual: nextMunicipioId,
      municipio_bd_actual: municipio?.nombre_municipio ?? row.municipio_bd_actual,
      estado_municipio: nextMunicipioId === row.municipio_id_esperado ? 'OK' : 'MUNICIPIO_INCORRECTO',
    };
  });
};

export const summarizeDistinctAffectedIds = (matrix: ExactMunicipioMatrixRow[]): {
  finales: number[];
  instituciones: number[];
  sede_modalidades: number[];
  sedes: number[];
  vigencias: number[];
} => {
  const affected = matrix.filter((row) => row.estado_municipio === 'MUNICIPIO_INCORRECTO');
  return {
    instituciones: [...new Set(affected.map((row) => row.institucion_id))].sort((left, right) => left - right),
    sedes: [...new Set(affected.map((row) => row.sede_id))].sort((left, right) => left - right),
    sede_modalidades: [...new Set(affected.map((row) => row.sede_modalidad_id))].sort((left, right) => left - right),
    vigencias: [...new Set(affected.map((row) => row.vigencia_id))].sort((left, right) => left - right),
    finales: [...new Set(affected.map((row) => row.final_id))].sort((left, right) => left - right),
  };
};

export const countStrongInstitutionDuplicates = (
  instituciones: Array<Pick<RepairInstitucionRow, 'id' | 'municipio_id' | 'nombre_institucion'>>,
): number => {
  const grouped = new Map<string, number>();
  for (const row of instituciones) {
    const key = `${toNumber(row.municipio_id) ?? 'NULL'}|${normalizeText(row.nombre_institucion)}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped.values()].filter((count) => count > 1).length;
};
