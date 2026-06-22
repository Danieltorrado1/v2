import { randomUUID } from 'crypto';

import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import {
  calculateRequiredCoverage,
  getEstadoCobertura,
  normalizeModalidadBase
} from './cobertura.calculator';
import {
  CoberturaResumenQuery,
  CreateCoberturaAsignacionInput,
  CreateCoberturaNovedadInput,
  EstadoCobertura,
  ModalidadBase,
  UpdateCoberturaAsignacionInput
} from './cobertura.schemas';
import {
  ensureContratoAplicaCobertura,
  ensureFocalizacionFinalExists,
  ensureUniqueActiveCoverageAssignment,
  ensureVinculacionActivaManipulador
} from './cobertura.validator';

interface CoberturaBaseRow extends QueryResultRow {
  activo: boolean;
  asignados_db: string | number | null;
  categoria_cobertura: string | null;
  clave_sede_modalidad: string | null;
  contrato_id: string;
  contrato_nombre: string | null;
  cupos_aprobados: number | string | null;
  focalizacion_final_id: string;
  institucion: string | null;
  institucion_id: string | null;
  modalidad_base_db: string | null;
  modalidad_id: string | null;
  modalidad_original: string;
  municipio_id: string | null;
  municipio_texto: string | null;
  sede: string | null;
  sede_id: string | null;
  consecutivo_sede: string | null;
}

interface CoberturaAsignacionRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string;
  created_at: Date;
  fecha_fin: Date | string | null;
  fecha_inicio: Date | string;
  focalizacion_final_id: string;
  id: string;
  institucion: string;
  modalidad: string;
  municipio_id: string | null;
  porcentaje_cobertura: string | number;
  observacion: string | null;
  sede: string;
  consecutivo_sede: string | null;
  categoria_cobertura: string | null;
  tipo_asignacion: string;
  vinculacion_id: string;
}

interface ContratoInfoRow extends QueryResultRow {
  contrato_nombre: string | null;
}

interface CountRow extends QueryResultRow {
  total: number;
}

export interface CoberturaResumenItem {
  activo: boolean;
  asignados: number;
  asignados_cobertura: number;
  categoria_cobertura: string | null;
  clave_sede_modalidad: string | null;
  contrato_id: string;
  contrato_nombre: string | null;
  cupos: number;
  cupos_aprobados: number;
  estado_cobertura: EstadoCobertura;
  faltantes: number;
  focalizacion_final_id: string;
  id: string;
  institucion: string | null;
  institucion_id: string | null;
  institucion_nombre: string | null;
  manipuladores_requeridos: number;
  modalidad_base: ModalidadBase;
  modalidad_original: string;
  municipio_id: string | null;
  municipio_nombre: string | null;
  municipio_texto: string | null;
  sede: string | null;
  sede_id: string | null;
  sede_nombre: string | null;
  consecutivo_sede: string | null;
  sobrecobertura: number;
}

export interface CoberturaResumenResponse {
  items: CoberturaResumenItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface CoberturaContratoDetalle {
  contrato_id: string;
  contrato_nombre: string | null;
  resumen: {
    asignados_cobertura: number;
    faltantes: number;
    requeridos: number;
    sobrecobertura: number;
  };
  items: CoberturaResumenItem[];
}

export interface CoberturaSedeModalidadDetalle extends CoberturaResumenItem {
  asignaciones: CoberturaAsignacion[];
}

export interface CoberturaAsignacion {
  activo: boolean;
  categoria_cobertura: string | null;
  consecutivo_sede: string | null;
  contrato_id: string;
  created_at: string;
  fecha_fin: string | null;
  fecha_inicio: string;
  focalizacion_final_id: string;
  id: string;
  institucion: string;
  modalidad: string;
  municipio_id: string | null;
  observacion: string | null;
  porcentaje_cobertura: number;
  sede: string;
  tipo_asignacion: string;
  vinculacion_id: string;
}

export interface CoberturaRecalculoResult {
  contrato_id: string;
  deactivated_keys: number;
  processed_keys: number;
  recalculated_keys: number;
}

export interface CoberturaNovedad {
  cobertura_asignacion_id: string | null;
  contrato_id: string;
  created_at: string;
  descripcion: string;
  fecha_novedad: string;
  focalizacion_final_id: string | null;
  id: string;
  payload: Record<string, unknown> | null;
  tipo_novedad: string;
}

interface CoverageMetrics {
  asignados: number;
  faltantes: number;
  modalidad_base: ModalidadBase;
  manipuladores_requeridos: number;
  sobrecobertura: number;
  estado_cobertura: EstadoCobertura;
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const toNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isModalidadBase = (value: string | null | undefined): value is ModalidadBase => {
  return value === 'CAA' || value === 'CAARES' || value === 'RI';
};

const inferModalidadBaseFromText = (value: string | null | undefined): ModalidadBase | null => {
  if (!value) {
    return null;
  }

  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

  if (normalized.includes('CAARES')) {
    return 'CAARES';
  }

  if (normalized.includes('CAA')) {
    return 'CAA';
  }

  if (normalized.includes('RI')) {
    return 'RI';
  }

  return null;
};

const resolveModalidadBase = (row: {
  modalidad_base_db: string | null;
  modalidad_original: string;
}): ModalidadBase => {
  if (isModalidadBase(row.modalidad_base_db)) {
    return row.modalidad_base_db;
  }

  const inferred = inferModalidadBaseFromText(row.modalidad_original);

  if (inferred) {
    return inferred;
  }

  throw new AppError(
    'Unsupported modalidad for coverage calculation',
    400,
    'MODALIDAD_NO_SOPORTADA',
    { modalidadOriginal: row.modalidad_original }
  );
};

const buildCoverageMetrics = (row: CoberturaBaseRow): CoverageMetrics => {
  const modalidad_base = resolveModalidadBase(row);
  const cupos = toNumber(row.cupos_aprobados);
  const calculation = calculateRequiredCoverage(modalidad_base, cupos);
  const asignados = toNumber(row.asignados_db);
  const faltantes = Math.max(0, Number((calculation.manipuladores_requeridos - asignados).toFixed(6)));
  const sobrecobertura = Math.max(0, Number((asignados - calculation.manipuladores_requeridos).toFixed(6)));

  return {
    modalidad_base,
    manipuladores_requeridos: calculation.manipuladores_requeridos,
    asignados,
    faltantes,
    sobrecobertura,
    estado_cobertura: getEstadoCobertura(calculation.manipuladores_requeridos, asignados)
  };
};

const mapCoberturaRow = (row: CoberturaBaseRow): CoberturaResumenItem => {
  const metrics = buildCoverageMetrics(row);
  const cupos = toNumber(row.cupos_aprobados);

  return {
    id: row.focalizacion_final_id,
    focalizacion_final_id: row.focalizacion_final_id,
    contrato_id: row.contrato_id,
    contrato_nombre: row.contrato_nombre,
    municipio_id: row.municipio_id,
    municipio_nombre: row.municipio_texto,
    municipio_texto: row.municipio_texto,
    institucion_id: row.institucion_id,
    institucion_nombre: row.institucion,
    institucion: row.institucion,
    sede_id: row.sede_id,
    sede_nombre: row.sede,
    sede: row.sede,
    consecutivo_sede: row.consecutivo_sede,
    modalidad_original: row.modalidad_original,
    modalidad_base: metrics.modalidad_base,
    clave_sede_modalidad: row.clave_sede_modalidad,
    cupos,
    cupos_aprobados: cupos,
    manipuladores_requeridos: metrics.manipuladores_requeridos,
    asignados: metrics.asignados,
    asignados_cobertura: metrics.asignados,
    faltantes: metrics.faltantes,
    sobrecobertura: metrics.sobrecobertura,
    estado_cobertura: metrics.estado_cobertura,
    categoria_cobertura: row.categoria_cobertura,
    activo: row.activo
  };
};

const mapCoberturaAsignacion = (row: CoberturaAsignacionRow): CoberturaAsignacion => {
  return {
    id: row.id,
    focalizacion_final_id: row.focalizacion_final_id,
    vinculacion_id: row.vinculacion_id,
    contrato_id: row.contrato_id,
    porcentaje_cobertura: toNumber(row.porcentaje_cobertura),
    fecha_inicio: toDateString(row.fecha_inicio) ?? '',
    fecha_fin: toDateString(row.fecha_fin),
    observacion: row.observacion,
    activo: row.activo,
    created_at: row.created_at.toISOString(),
    institucion: row.institucion,
    sede: row.sede,
    consecutivo_sede: row.consecutivo_sede,
    modalidad: row.modalidad,
    categoria_cobertura: row.categoria_cobertura,
    municipio_id: row.municipio_id,
    tipo_asignacion: row.tipo_asignacion
  };
};

const buildBaseWhereClause = (
  filters: CoberturaResumenQuery
): { params: unknown[]; whereSql: string } => {
  const conditions: string[] = ['COALESCE(ff.activo, TRUE) = TRUE'];
  const params: unknown[] = [];

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`ff.contrato_id::text = $${params.length}`);
  }

  if (filters.municipio_id) {
    params.push(filters.municipio_id);
    conditions.push(`ff.municipio_id::text = $${params.length}`);
  }

  if (filters.institucion_id) {
    params.push(filters.institucion_id);
    conditions.push(`ff.institucion_id::text = $${params.length}`);
  }

  if (filters.sede_id) {
    params.push(filters.sede_id);
    conditions.push(`ff.sede_id::text = $${params.length}`);
  }

  if (filters.categoria_cobertura) {
    params.push(filters.categoria_cobertura);
    conditions.push(`ff.categoria_cobertura = $${params.length}`);
  }

  return {
    params,
    whereSql: `WHERE ${conditions.join(' AND ')}`
  };
};

const getCoberturaBaseRows = async (
  filters: CoberturaResumenQuery
): Promise<CoberturaResumenItem[]> => {
  const { params, whereSql } = buildBaseWhereClause(filters);

  const result = await dbQuery<CoberturaBaseRow>(
    `
      WITH asignadas AS (
        SELECT
          ca.focalizacion_final_id::text AS focalizacion_final_id,
          COALESCE(SUM(COALESCE(ca.porcentaje_cobertura, 0)), 0) AS asignados_db
        FROM cobertura_asignaciones ca
        WHERE COALESCE(ca.activo, TRUE) = TRUE
        GROUP BY ca.focalizacion_final_id::text
      )
      SELECT
        ff.id::text AS focalizacion_final_id,
        ff.contrato_id::text AS contrato_id,
        c.nombre AS contrato_nombre,
        ff.municipio_id::text AS municipio_id,
        ff.municipio_texto,
        ff.institucion_id::text AS institucion_id,
        COALESCE(ff.institucion_final, i.nombre_institucion) AS institucion,
        ff.sede_id::text AS sede_id,
        ff.sede_final AS sede,
        ff.consecutivo_final AS consecutivo_sede,
        ff.modalidad_final AS modalidad_original,
        ff.modalidad_id::text AS modalidad_id,
        m.codigo_base AS modalidad_base_db,
        ff.cupos_aprobados,
        ff.categoria_cobertura,
        ff.clave_sede_modalidad,
        COALESCE(asignadas.asignados_db, 0)::numeric AS asignados_db,
        ff.activo
      FROM focalizacion_final ff
      INNER JOIN contratos c ON c.id = ff.contrato_id
      LEFT JOIN instituciones i ON i.id = ff.institucion_id
      LEFT JOIN modalidades m ON m.id = ff.modalidad_id AND COALESCE(m.activo, TRUE) = TRUE
      LEFT JOIN asignadas ON asignadas.focalizacion_final_id = ff.id::text
      ${whereSql}
      ORDER BY
        COALESCE(ff.municipio_texto, '') ASC,
        COALESCE(ff.institucion_final, i.nombre_institucion) ASC,
        COALESCE(ff.sede_final, '') ASC,
        ff.id ASC
    `,
    params
  );

  return result.rows.map(mapCoberturaRow);
};

const applyFilters = (
  items: CoberturaResumenItem[],
  filters: CoberturaResumenQuery
): CoberturaResumenItem[] => {
  let filtered = items;

  if (filters.modalidad_base) {
    filtered = filtered.filter((item) => item.modalidad_base === filters.modalidad_base);
  }

  if (filters.estado_cobertura) {
    filtered = filtered.filter((item) => item.estado_cobertura === filters.estado_cobertura);
  }

  return filtered;
};

const paginate = (
  items: CoberturaResumenItem[],
  page: number,
  limit: number
): CoberturaResumenResponse => {
  const total = items.length;
  const offset = (page - 1) * limit;
  const paginatedItems = items.slice(offset, offset + limit);

  return {
    items: paginatedItems,
    pagination: {
      page,
      limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
};

const getCoverageSummaryTotals = (items: CoberturaResumenItem[]) => {
  return items.reduce(
    (accumulator, item) => {
      accumulator.requeridos += item.manipuladores_requeridos;
      accumulator.asignados_cobertura += item.asignados;
      accumulator.faltantes += item.estado_cobertura === 'FALTANTE' ? 1 : 0;
      accumulator.sobrecobertura += item.estado_cobertura === 'SOBRECOBERTURA' ? 1 : 0;
      return accumulator;
    },
    {
      requeridos: 0,
      asignados_cobertura: 0,
      faltantes: 0,
      sobrecobertura: 0
    }
  );
};

const getCoberturaAsignacionByIdForUpdate = async (
  client: PoolClient,
  asignacionId: string
): Promise<CoberturaAsignacionRow | null> => {
  const result = await client.query<CoberturaAsignacionRow>(
    `
      SELECT
        id::text AS id,
        focalizacion_final_id::text AS focalizacion_final_id,
        vinculacion_id::text AS vinculacion_id,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        institucion,
        sede,
        consecutivo_sede,
        modalidad,
        categoria_cobertura,
        tipo_asignacion,
        porcentaje_cobertura,
        fecha_inicio,
        fecha_fin,
        observacion,
        activo,
        created_at
      FROM cobertura_asignaciones
      WHERE id::text = $1
      LIMIT 1
      FOR UPDATE
    `,
    [asignacionId]
  );

  return result.rows[0] ?? null;
};

export const getCoberturaResumen = async (
  filters: CoberturaResumenQuery
): Promise<CoberturaResumenResponse> => {
  const baseItems = await getCoberturaBaseRows(filters);
  const filtered = applyFilters(baseItems, filters);
  return paginate(filtered, filters.page, filters.limit);
};

export const getCoberturaContratoDetalle = async (
  contratoId: string
): Promise<CoberturaContratoDetalle> => {
  await ensureContratoAplicaCobertura(contratoId);

  const contratoResult = await dbQuery<ContratoInfoRow>(
    `
      SELECT nombre AS contrato_nombre
      FROM contratos
      WHERE id::text = $1
      LIMIT 1
    `,
    [contratoId]
  );

  const items = await getCoberturaBaseRows({
    contrato_id: contratoId,
    page: 1,
    limit: 1000
  });

  const resumen = getCoverageSummaryTotals(items);

  return {
    contrato_id: contratoId,
    contrato_nombre: contratoResult.rows[0]?.contrato_nombre ?? null,
    resumen,
    items
  };
};

export const getCoberturaSedeModalidadDetalle = async (
  focalizacionFinalId: string
): Promise<CoberturaSedeModalidadDetalle> => {
  const summaryResult = await dbQuery<CoberturaBaseRow>(
    `
      WITH asignadas AS (
        SELECT
          ca.focalizacion_final_id::text AS focalizacion_final_id,
          COALESCE(SUM(COALESCE(ca.porcentaje_cobertura, 0)), 0) AS asignados_db
        FROM cobertura_asignaciones ca
        WHERE COALESCE(ca.activo, TRUE) = TRUE
        GROUP BY ca.focalizacion_final_id::text
      )
      SELECT
        ff.id::text AS focalizacion_final_id,
        ff.contrato_id::text AS contrato_id,
        c.nombre AS contrato_nombre,
        ff.municipio_id::text AS municipio_id,
        ff.municipio_texto,
        ff.institucion_id::text AS institucion_id,
        COALESCE(ff.institucion_final, i.nombre_institucion) AS institucion,
        ff.sede_id::text AS sede_id,
        ff.sede_final AS sede,
        ff.consecutivo_final AS consecutivo_sede,
        ff.modalidad_final AS modalidad_original,
        ff.modalidad_id::text AS modalidad_id,
        m.codigo_base AS modalidad_base_db,
        ff.cupos_aprobados,
        ff.categoria_cobertura,
        ff.clave_sede_modalidad,
        COALESCE(asignadas.asignados_db, 0)::numeric AS asignados_db,
        ff.activo
      FROM focalizacion_final ff
      INNER JOIN contratos c ON c.id = ff.contrato_id
      LEFT JOIN instituciones i ON i.id = ff.institucion_id
      LEFT JOIN modalidades m ON m.id = ff.modalidad_id AND COALESCE(m.activo, TRUE) = TRUE
      LEFT JOIN asignadas ON asignadas.focalizacion_final_id = ff.id::text
      WHERE ff.id::text = $1
      LIMIT 1
    `,
    [focalizacionFinalId]
  );

  const summaryRow = summaryResult.rows[0];

  if (!summaryRow) {
    throw new AppError(
      'Cobertura sede-modalidad not found',
      404,
      'COBERTURA_SEDE_MODALIDAD_NOT_FOUND'
    );
  }

  const assignmentsResult = await dbQuery<CoberturaAsignacionRow>(
    `
      SELECT
        id::text AS id,
        focalizacion_final_id::text AS focalizacion_final_id,
        vinculacion_id::text AS vinculacion_id,
        contrato_id::text AS contrato_id,
        municipio_id::text AS municipio_id,
        institucion,
        sede,
        consecutivo_sede,
        modalidad,
        categoria_cobertura,
        tipo_asignacion,
        porcentaje_cobertura,
        fecha_inicio,
        fecha_fin,
        observacion,
        activo,
        created_at
      FROM cobertura_asignaciones
      WHERE focalizacion_final_id::text = $1
      ORDER BY activo DESC, created_at DESC
    `,
    [focalizacionFinalId]
  );

  return {
    ...mapCoberturaRow(summaryRow),
    asignaciones: assignmentsResult.rows.map(mapCoberturaAsignacion)
  };
};

export const getCoberturaFaltantes = async (
  filters: CoberturaResumenQuery
): Promise<CoberturaResumenResponse> => {
  const baseItems = await getCoberturaBaseRows(filters);
  const filtered = applyFilters(baseItems, {
    ...filters,
    estado_cobertura: 'FALTANTE'
  });

  return paginate(filtered, filters.page, filters.limit);
};

export const getCoberturaSobrecobertura = async (
  filters: CoberturaResumenQuery
): Promise<CoberturaResumenResponse> => {
  const baseItems = await getCoberturaBaseRows(filters);
  const filtered = applyFilters(baseItems, {
    ...filters,
    estado_cobertura: 'SOBRECOBERTURA'
  });

  return paginate(filtered, filters.page, filters.limit);
};

export const recalculateCobertura = async (
  contratoId: string,
  actorUserId: string
): Promise<CoberturaRecalculoResult> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureContratoAplicaCobertura(contratoId, client);

    const activeRows = await client.query<{ id: string }>(
      `
        SELECT id::text AS id
        FROM focalizacion_final
        WHERE contrato_id::text = $1
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [contratoId]
    );
    const processedKeys = activeRows.rowCount ?? 0;

    if (processedKeys > 0) {
      await client.query(
        `
          UPDATE focalizacion_final
          SET updated_at = NOW()
          WHERE contrato_id::text = $1
            AND COALESCE(activo, TRUE) = TRUE
        `,
        [contratoId]
      );
    }

    await client.query('COMMIT');

    return {
      contrato_id: contratoId,
      processed_keys: processedKeys,
      recalculated_keys: processedKeys,
      deactivated_keys: 0
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createCoberturaAsignacion = async (
  input: CreateCoberturaAsignacionInput,
  actorUserId: string
): Promise<CoberturaAsignacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const focalizacion = await ensureFocalizacionFinalExists(
      String(input.focalizacion_final_id),
      client
    );

    await ensureContratoAplicaCobertura(focalizacion.contrato_id, client);
    await ensureVinculacionActivaManipulador(String(input.vinculacion_id), client);
    await ensureUniqueActiveCoverageAssignment(
      String(input.vinculacion_id),
      String(input.focalizacion_final_id),
      client
    );

    const result = await client.query<CoberturaAsignacionRow>(
      `
        INSERT INTO cobertura_asignaciones (
          contrato_id,
          municipio_id,
          focalizacion_final_id,
          vinculacion_id,
          institucion,
          sede,
          consecutivo_sede,
          modalidad,
          categoria_cobertura,
          porcentaje_cobertura,
          fecha_inicio,
          fecha_fin,
          observacion,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11::date,
          $12::date,
          $13,
          TRUE
        )
        RETURNING
          id::text AS id,
          focalizacion_final_id::text AS focalizacion_final_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          municipio_id::text AS municipio_id,
          institucion,
          sede,
          consecutivo_sede,
          modalidad,
          categoria_cobertura,
          tipo_asignacion,
          porcentaje_cobertura,
          fecha_inicio,
          fecha_fin,
          observacion,
          activo,
          created_at
      `,
      [
        String(focalizacion.contrato_id),
        focalizacion.municipio_id ? String(focalizacion.municipio_id) : null,
        String(input.focalizacion_final_id),
        String(input.vinculacion_id),
        focalizacion.institucion_final,
        focalizacion.sede_final,
        focalizacion.consecutivo_final,
        focalizacion.modalidad_final,
        focalizacion.categoria_cobertura,
        input.porcentaje_cobertura ?? 1,
        input.fecha_inicio,
        input.fecha_fin,
        input.observacion
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError(
        'Failed to create cobertura asignacion',
        500,
        'COBERTURA_ASIGNACION_CREATE_FAILED'
      );
    }

    await client.query('COMMIT');
    return mapCoberturaAsignacion(created);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateCoberturaAsignacion = async (
  asignacionId: string,
  input: UpdateCoberturaAsignacionInput,
  actorUserId: string
): Promise<CoberturaAsignacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const current = await getCoberturaAsignacionByIdForUpdate(client, asignacionId);

    if (!current) {
      throw new AppError(
        'Cobertura asignacion not found',
        404,
        'COBERTURA_ASIGNACION_NOT_FOUND'
      );
    }

    await ensureVinculacionActivaManipulador(current.vinculacion_id, client);
    await ensureUniqueActiveCoverageAssignment(
      current.vinculacion_id,
      current.focalizacion_final_id,
      client,
      asignacionId
    );

    const result = await client.query<CoberturaAsignacionRow>(
      `
        UPDATE cobertura_asignaciones
        SET
          porcentaje_cobertura = $2,
          fecha_inicio = $3::date,
          fecha_fin = $4::date,
          observacion = $5,
          activo = $6
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          focalizacion_final_id::text AS focalizacion_final_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          municipio_id::text AS municipio_id,
          institucion,
          sede,
          consecutivo_sede,
          modalidad,
          categoria_cobertura,
          tipo_asignacion,
          porcentaje_cobertura,
          fecha_inicio,
          fecha_fin,
          observacion,
          activo,
          created_at
      `,
      [
        asignacionId,
        input.porcentaje_cobertura ?? toNumber(current.porcentaje_cobertura),
        input.fecha_inicio ?? toDateString(current.fecha_inicio),
        input.fecha_fin !== undefined ? input.fecha_fin : toDateString(current.fecha_fin),
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo ?? current.activo
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to update cobertura asignacion',
        500,
        'COBERTURA_ASIGNACION_UPDATE_FAILED'
      );
    }

    await client.query('COMMIT');
    return mapCoberturaAsignacion(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateCoberturaAsignacion = async (
  asignacionId: string,
  actorUserId: string
): Promise<CoberturaAsignacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const current = await getCoberturaAsignacionByIdForUpdate(client, asignacionId);

    if (!current) {
      throw new AppError(
        'Cobertura asignacion not found',
        404,
        'COBERTURA_ASIGNACION_NOT_FOUND'
      );
    }

    const result = await client.query<CoberturaAsignacionRow>(
      `
        UPDATE cobertura_asignaciones
        SET
          activo = FALSE,
          fecha_fin = COALESCE(fecha_fin, CURRENT_DATE)
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          focalizacion_final_id::text AS focalizacion_final_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          municipio_id::text AS municipio_id,
          institucion,
          sede,
          consecutivo_sede,
          modalidad,
          categoria_cobertura,
          tipo_asignacion,
          porcentaje_cobertura,
          fecha_inicio,
          fecha_fin,
          observacion,
          activo,
          created_at
      `,
      [asignacionId]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to deactivate cobertura asignacion',
        500,
        'COBERTURA_ASIGNACION_DEACTIVATE_FAILED'
      );
    }

    await client.query('COMMIT');
    return mapCoberturaAsignacion(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const createCoberturaNovedad = async (
  input: CreateCoberturaNovedadInput,
  actorUserId: string
): Promise<CoberturaNovedad> => {
  return {
    id: randomUUID(),
    contrato_id: input.contrato_id,
    focalizacion_final_id: input.focalizacion_final_id ?? null,
    cobertura_asignacion_id: input.cobertura_asignacion_id ?? null,
    tipo_novedad: input.tipo_novedad,
    descripcion: input.descripcion,
    fecha_novedad: input.fecha_novedad ?? new Date().toISOString().slice(0, 10),
    payload: input.payload ?? null,
    created_at: new Date().toISOString()
  };
};
