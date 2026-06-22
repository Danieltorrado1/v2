import { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import { buildSstIndicadoresSnapshot, SstIndicadoresSnapshot } from './sst.indicadores';
import {
  CreateSstAccidenteInput,
  CreateSstAccionAccidenteInput,
  CalculateSstIndicadoresInput,
  CreateSstDotacionEppEntregaInput,
  CreateSstDotacionEppInput,
  CreateSstExamenOcupacionalInput,
  CreateSstExamenPersonaInput,
  CreateSstCapacitacionInput,
  CreateSstCapacitacionPersonaInput,
  CreateSstEventoInput,
  CreateSstPlanAccionInput,
  ListSstAccidentesAlertasQuery,
  ListSstAccidentesDashboardQuery,
  ListSstAccidentesQuery,
  ListSstAccionesAccidenteQuery,
  ListSstDotacionEppAlertasQuery,
  ListSstDotacionEppDashboardQuery,
  ListSstDotacionEppEntregasQuery,
  ListSstDotacionEppQuery,
  ListSstExamenesAlertasQuery,
  ListSstExamenesDashboardQuery,
  ListSstExamenesOcupacionalesQuery,
  ListSstExamenesPersonaQuery,
  ListSstAlertasQuery,
  ListSstCapacitacionesPersonaQuery,
  ListSstCapacitacionesQuery,
  ListSstDashboardQuery,
  ListSstEventosQuery,
  ListSstIndicadoresQuery,
  ListSstPlanesQuery,
  SstAccidenteEstado,
  SstAccidenteSeveridad,
  SstAccidenteTipoEvento,
  SstAccionAccidenteEstado,
  SstDotacionEppEstadoEntrega,
  SstDotacionEppTipoItem,
  SstExamenOcupacionalConceptoMedico,
  SstExamenOcupacionalTipoExamen,
  SstEstado,
  SstTipoEvento,
  UpdateSstAccidenteInput,
  UpdateSstAccionAccidenteInput,
  UpdateSstDotacionEppEntregaInput,
  UpdateSstDotacionEppInput,
  UpdateSstExamenOcupacionalInput,
  UpdateSstExamenPersonaInput,
  UpdateSstCapacitacionInput,
  UpdateSstCapacitacionPersonaInput,
  UpdateSstEventoInput,
  UpdateSstPlanAccionInput
} from './sst.schemas';
import {
  ensureContratoExists,
  ensureEmpresaExists,
  ensurePersonaExists,
  ensureSstEventoExists,
  ensureSstPlanAccionExists,
  ensureVinculacionExists,
  validateSstEventoRelations
} from './sst.validator';

interface CountRow extends QueryResultRow {
  total: number;
}

interface SstEventoRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string | null;
  created_at: Date;
  descripcion: string | null;
  empresa_id: string | null;
  estado: SstEstado;
  fecha_cierre: Date | string | null;
  fecha_evento: Date | string;
  id: string;
  metadata: Record<string, unknown> | null;
  persona_id: string | null;
  tipo_evento: SstTipoEvento;
  titulo: string;
  ubicacion: string | null;
  updated_at: Date;
  vinculacion_id: string | null;
}

interface SstPlanAccionRow extends QueryResultRow {
  activo: boolean;
  created_at: Date;
  descripcion: string;
  estado: SstEstado;
  evento_id: string;
  fecha_cierre: Date | string | null;
  fecha_compromiso: Date | string;
  id: string;
  observaciones: string | null;
  responsable: string;
  responsable_id: string | null;
  updated_at: Date;
}

interface SstIndicadorRow extends QueryResultRow {
  contrato_id: string | null;
  created_at: Date;
  empresa_id: string | null;
  fecha_desde: Date | string;
  fecha_hasta: Date | string;
  id: string;
  planes_abiertos: number;
  planes_cerrados: number;
  planes_vencidos: number;
  porcentaje_cierre_planes: number;
  tasa_accidentalidad: number;
  total_accidentes_trabajo: number;
  total_capacitaciones: number;
  total_enfermedades_laborales: number;
  total_entregas_epp: number;
  total_eventos: number;
  total_incidentes: number;
  trabajadores_base: number;
  updated_at: Date;
}

interface AggregateEventCountsRow extends QueryResultRow {
  total_accidentes_trabajo: number;
  total_capacitaciones: number;
  total_enfermedades_laborales: number;
  total_entregas_epp: number;
  total_eventos: number;
  total_incidentes: number;
}

interface AggregatePlanCountsRow extends QueryResultRow {
  planes_abiertos: number;
  planes_cerrados: number;
  planes_vencidos: number;
}

interface AggregateTrabajadoresRow extends QueryResultRow {
  trabajadores_base: number;
}

export interface SstEvento {
  activo: boolean;
  contrato_id: string | null;
  created_at: string;
  descripcion: string | null;
  empresa_id: string | null;
  estado: SstEstado;
  fecha_cierre: string | null;
  fecha_evento: string;
  id: string;
  metadata: Record<string, unknown> | null;
  persona_id: string | null;
  tipo_evento: SstTipoEvento;
  titulo: string;
  ubicacion: string | null;
  updated_at: string;
  vinculacion_id: string | null;
}

export interface SstPlanAccion {
  activo: boolean;
  created_at: string;
  descripcion: string;
  estado: SstEstado;
  evento_id: string;
  fecha_cierre: string | null;
  fecha_compromiso: string;
  id: string;
  observaciones: string | null;
  responsable: string;
  responsable_id: string | null;
  updated_at: string;
}

export interface SstIndicador extends SstIndicadoresSnapshot {
  contrato_id: string | null;
  created_at: string;
  empresa_id: string | null;
  fecha_desde: string;
  fecha_hasta: string;
  id: string;
  updated_at: string;
}

export interface PaginatedSstEventos {
  items: SstEvento[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstPlanesAccion {
  items: SstPlanAccion[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

interface AuditPayload {
  action:
    | 'EVENTO_CREATE'
    | 'EVENTO_UPDATE'
    | 'EVENTO_CLOSE'
    | 'PLAN_CREATE'
    | 'PLAN_UPDATE'
    | 'PLAN_CLOSE'
    | 'RECALCULAR';
  actorUserId: string;
  after?: unknown;
  auditMeta?: AuditRequestMeta;
  before?: unknown;
  description: string;
  entityId: string;
  entityType: 'sst_eventos' | 'sst_planes_accion' | 'sst_indicadores';
}

const hasOwn = <T extends object>(value: T, key: PropertyKey): boolean => {
  return Object.prototype.hasOwnProperty.call(value, key);
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const mapSstEvento = (row: SstEventoRow): SstEvento => {
  return {
    id: row.id,
    persona_id: row.persona_id,
    vinculacion_id: row.vinculacion_id,
    contrato_id: row.contrato_id,
    empresa_id: row.empresa_id,
    tipo_evento: row.tipo_evento,
    estado: row.estado,
    fecha_evento: toDateString(row.fecha_evento) ?? '',
    fecha_cierre: toDateString(row.fecha_cierre),
    titulo: row.titulo,
    descripcion: row.descripcion,
    ubicacion: row.ubicacion,
    metadata: row.metadata,
    activo: row.activo,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
};

const mapSstPlanAccion = (row: SstPlanAccionRow): SstPlanAccion => {
  return {
    id: row.id,
    evento_id: row.evento_id,
    responsable: row.responsable,
    responsable_id: row.responsable_id,
    descripcion: row.descripcion,
    fecha_compromiso: toDateString(row.fecha_compromiso) ?? '',
    fecha_cierre: toDateString(row.fecha_cierre),
    estado: row.estado,
    observaciones: row.observaciones,
    activo: row.activo,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
};

const mapSstIndicador = (row: SstIndicadorRow): SstIndicador => {
  return {
    id: row.id,
    empresa_id: row.empresa_id,
    contrato_id: row.contrato_id,
    fecha_desde: toDateString(row.fecha_desde) ?? '',
    fecha_hasta: toDateString(row.fecha_hasta) ?? '',
    total_eventos: row.total_eventos,
    total_accidentes_trabajo: row.total_accidentes_trabajo,
    total_incidentes: row.total_incidentes,
    total_enfermedades_laborales: row.total_enfermedades_laborales,
    total_capacitaciones: row.total_capacitaciones,
    total_entregas_epp: row.total_entregas_epp,
    planes_abiertos: row.planes_abiertos,
    planes_cerrados: row.planes_cerrados,
    planes_vencidos: row.planes_vencidos,
    trabajadores_base: row.trabajadores_base,
    tasa_accidentalidad: Number(row.tasa_accidentalidad),
    porcentaje_cierre_planes: Number(row.porcentaje_cierre_planes),
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString()
  };
};

const getSstEventoSelect = (): string => {
  return `
    SELECT
      se.id::text AS id,
      se.persona_id::text AS persona_id,
      se.vinculacion_id::text AS vinculacion_id,
      se.contrato_id::text AS contrato_id,
      se.empresa_id::text AS empresa_id,
      se.tipo_evento,
      se.estado,
      se.fecha_evento,
      se.fecha_cierre,
      se.titulo,
      se.descripcion,
      se.ubicacion,
      se.metadata,
      se.activo,
      se.created_at,
      se.updated_at
    FROM sst_eventos se
  `;
};

const getSstPlanAccionSelect = (): string => {
  return `
    SELECT
      spa.id::text AS id,
      spa.evento_id::text AS evento_id,
      spa.responsable,
      spa.responsable_id::text AS responsable_id,
      spa.descripcion,
      spa.fecha_compromiso,
      spa.fecha_cierre,
      spa.estado,
      spa.observaciones,
      spa.activo,
      spa.created_at,
      spa.updated_at
    FROM sst_planes_accion spa
  `;
};

const recordAudit = async (client: PoolClient, payload: AuditPayload): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: payload.actorUserId,
    accion: payload.action,
    tabla: payload.entityType,
    registro_id: payload.entityId,
    descripcion: payload.description,
    before: payload.before,
    after: payload.after,
    ip: payload.auditMeta?.ip ?? null,
    user_agent: payload.auditMeta?.user_agent ?? null
  });
};

const buildEventosFilters = (
  filters: ListSstEventosQuery
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`se.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`se.contrato_id::text = $${params.length}`);
  }

  if (filters.vinculacion_id) {
    params.push(filters.vinculacion_id);
    conditions.push(`se.vinculacion_id::text = $${params.length}`);
  }

  if (filters.tipo_evento) {
    params.push(filters.tipo_evento);
    conditions.push(`se.tipo_evento = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`se.estado = $${params.length}`);
  }

  if (filters.fecha_desde) {
    params.push(filters.fecha_desde);
    conditions.push(`se.fecha_evento >= $${params.length}`);
  }

  if (filters.fecha_hasta) {
    params.push(filters.fecha_hasta);
    conditions.push(`se.fecha_evento <= $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildPlanesFilters = (
  filters: ListSstPlanesQuery
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.evento_id) {
    params.push(filters.evento_id);
    conditions.push(`spa.evento_id::text = $${params.length}`);
  }

  if (filters.responsable_id) {
    params.push(filters.responsable_id);
    conditions.push(`spa.responsable_id::text = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`spa.estado = $${params.length}`);
  }

  if (filters.fecha_compromiso_desde) {
    params.push(filters.fecha_compromiso_desde);
    conditions.push(`spa.fecha_compromiso >= $${params.length}`);
  }

  if (filters.fecha_compromiso_hasta) {
    params.push(filters.fecha_compromiso_hasta);
    conditions.push(`spa.fecha_compromiso <= $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildIndicadoresFilterSql = (
  filters: {
    contrato_id?: string | null;
    empresa_id?: string | null;
    fecha_desde?: string | null;
    fecha_hasta?: string | null;
  },
  tableAlias: string
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`${tableAlias}.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`${tableAlias}.contrato_id::text = $${params.length}`);
  }

  if (filters.fecha_desde) {
    params.push(filters.fecha_desde);
    conditions.push(`${tableAlias}.fecha_evento >= $${params.length}`);
  }

  if (filters.fecha_hasta) {
    params.push(filters.fecha_hasta);
    conditions.push(`${tableAlias}.fecha_evento <= $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

export const listSstEventos = async (
  filters: ListSstEventosQuery
): Promise<PaginatedSstEventos> => {
  const { params, whereClause } = buildEventosFilters(filters);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_eventos se
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstEventoRow>(
    `
      ${getSstEventoSelect()}
      ${whereClause}
      ORDER BY se.fecha_evento DESC, se.created_at DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstEvento),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getSstEventoById = async (eventoId: string): Promise<SstEvento | null> => {
  const result = await dbQuery<SstEventoRow>(
    `
      ${getSstEventoSelect()}
      WHERE se.id::text = $1
      LIMIT 1
    `,
    [eventoId]
  );

  const row = result.rows[0];
  return row ? mapSstEvento(row) : null;
};

export const createSstEvento = async (
  input: CreateSstEventoInput,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstEvento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const relations = await validateSstEventoRelations(
      {
        persona_id: input.persona_id,
        vinculacion_id: input.vinculacion_id,
        contrato_id: input.contrato_id,
        empresa_id: input.empresa_id
      },
      client
    );

    const result = await client.query<SstEventoRow>(
      `
        INSERT INTO sst_eventos (
          persona_id,
          vinculacion_id,
          contrato_id,
          empresa_id,
          tipo_evento,
          estado,
          fecha_evento,
          fecha_cierre,
          titulo,
          descripcion,
          ubicacion,
          metadata,
          activo,
          created_by
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::uuid,
          $4::uuid,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12::jsonb,
          $13,
          $14::uuid
        )
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          empresa_id::text AS empresa_id,
          tipo_evento,
          estado,
          fecha_evento,
          fecha_cierre,
          titulo,
          descripcion,
          ubicacion,
          metadata,
          activo,
          created_at,
          updated_at
      `,
      [
        relations.persona_id,
        relations.vinculacion_id,
        relations.contrato_id,
        relations.empresa_id,
        input.tipo_evento,
        input.estado,
        input.fecha_evento,
        input.fecha_cierre,
        input.titulo,
        input.descripcion,
        input.ubicacion,
        JSON.stringify(input.metadata),
        input.activo,
        actorUserId
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create SST event', 500, 'SST_EVENTO_CREATE_FAILED');
    }

    const evento = mapSstEvento(created);

    await recordAudit(client, {
      action: 'EVENTO_CREATE',
      actorUserId,
      after: evento,
      auditMeta,
      description: 'Creacion de evento SST',
      entityId: evento.id,
      entityType: 'sst_eventos'
    });

    await client.query('COMMIT');
    return evento;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstEvento = async (
  eventoId: string,
  input: UpdateSstEventoInput,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstEvento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentLookup = await ensureSstEventoExists(eventoId, client);
    const current = await getSstEventoById(eventoId);

    if (!current) {
      throw new AppError('SST event not found', 404, 'SST_EVENTO_NOT_FOUND');
    }

    const relations = await validateSstEventoRelations(
      {
        persona_id: hasOwn(input, 'persona_id') ? input.persona_id ?? null : current.persona_id,
        vinculacion_id: hasOwn(input, 'vinculacion_id')
          ? input.vinculacion_id ?? null
          : current.vinculacion_id,
        contrato_id: hasOwn(input, 'contrato_id') ? input.contrato_id ?? null : current.contrato_id,
        empresa_id: hasOwn(input, 'empresa_id') ? input.empresa_id ?? null : current.empresa_id
      },
      client
    );

    const result = await client.query<SstEventoRow>(
      `
        UPDATE sst_eventos
        SET
          persona_id = $2::uuid,
          vinculacion_id = $3::uuid,
          contrato_id = $4::uuid,
          empresa_id = $5::uuid,
          tipo_evento = $6,
          estado = $7,
          fecha_evento = $8,
          fecha_cierre = $9,
          titulo = $10,
          descripcion = $11,
          ubicacion = $12,
          metadata = $13::jsonb,
          activo = $14,
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          empresa_id::text AS empresa_id,
          tipo_evento,
          estado,
          fecha_evento,
          fecha_cierre,
          titulo,
          descripcion,
          ubicacion,
          metadata,
          activo,
          created_at,
          updated_at
      `,
      [
        eventoId,
        relations.persona_id,
        relations.vinculacion_id,
        relations.contrato_id,
        relations.empresa_id,
        input.tipo_evento ?? current.tipo_evento,
        input.estado ?? currentLookup.estado,
        input.fecha_evento ?? current.fecha_evento,
        input.fecha_cierre !== undefined ? input.fecha_cierre : current.fecha_cierre,
        input.titulo ?? current.titulo,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        input.ubicacion !== undefined ? input.ubicacion : current.ubicacion,
        JSON.stringify(input.metadata !== undefined ? input.metadata : current.metadata),
        input.activo ?? current.activo
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to update SST event', 500, 'SST_EVENTO_UPDATE_FAILED');
    }

    const evento = mapSstEvento(updated);

    await recordAudit(client, {
      action: 'EVENTO_UPDATE',
      actorUserId,
      auditMeta,
      before: current,
      after: evento,
      description: 'Actualizacion de evento SST',
      entityId: evento.id,
      entityType: 'sst_eventos'
    });

    await client.query('COMMIT');
    return evento;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstEvento = async (
  eventoId: string,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstEvento> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureSstEventoExists(eventoId, client);
    const current = await getSstEventoById(eventoId);

    if (!current) {
      throw new AppError('SST event not found', 404, 'SST_EVENTO_NOT_FOUND');
    }

    const result = await client.query<SstEventoRow>(
      `
        UPDATE sst_eventos
        SET
          activo = FALSE,
          estado = 'ANULADO',
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          persona_id::text AS persona_id,
          vinculacion_id::text AS vinculacion_id,
          contrato_id::text AS contrato_id,
          empresa_id::text AS empresa_id,
          tipo_evento,
          estado,
          fecha_evento,
          fecha_cierre,
          titulo,
          descripcion,
          ubicacion,
          metadata,
          activo,
          created_at,
          updated_at
      `,
      [eventoId]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to deactivate SST event',
        500,
        'SST_EVENTO_DEACTIVATE_FAILED'
      );
    }

    const evento = mapSstEvento(updated);

    await recordAudit(client, {
      action: 'EVENTO_CLOSE',
      actorUserId,
      auditMeta,
      before: current,
      after: evento,
      description: 'Desactivacion logica de evento SST',
      entityId: evento.id,
      entityType: 'sst_eventos'
    });

    await client.query('COMMIT');
    return evento;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listSstPlanesAccion = async (
  filters: ListSstPlanesQuery
): Promise<PaginatedSstPlanesAccion> => {
  const { params, whereClause } = buildPlanesFilters(filters);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_planes_accion spa
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstPlanAccionRow>(
    `
      ${getSstPlanAccionSelect()}
      ${whereClause}
      ORDER BY spa.fecha_compromiso ASC, spa.created_at DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstPlanAccion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const getSstPlanAccionById = async (planId: string): Promise<SstPlanAccion | null> => {
  const result = await dbQuery<SstPlanAccionRow>(
    `
      ${getSstPlanAccionSelect()}
      WHERE spa.id::text = $1
      LIMIT 1
    `,
    [planId]
  );

  const row = result.rows[0];
  return row ? mapSstPlanAccion(row) : null;
};

export const createSstPlanAccion = async (
  input: CreateSstPlanAccionInput,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureSstEventoExists(input.evento_id, client);

    const result = await client.query<SstPlanAccionRow>(
      `
        INSERT INTO sst_planes_accion (
          evento_id,
          responsable,
          responsable_id,
          descripcion,
          fecha_compromiso,
          fecha_cierre,
          estado,
          observaciones,
          activo,
          created_by
        )
        VALUES (
          $1::uuid,
          $2,
          $3::uuid,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10::uuid
        )
        RETURNING
          id::text AS id,
          evento_id::text AS evento_id,
          responsable,
          responsable_id::text AS responsable_id,
          descripcion,
          fecha_compromiso,
          fecha_cierre,
          estado,
          observaciones,
          activo,
          created_at,
          updated_at
      `,
      [
        input.evento_id,
        input.responsable,
        input.responsable_id,
        input.descripcion,
        input.fecha_compromiso,
        input.fecha_cierre,
        input.estado,
        input.observaciones,
        input.activo,
        actorUserId
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError(
        'Failed to create SST action plan',
        500,
        'SST_PLAN_ACCION_CREATE_FAILED'
      );
    }

    const plan = mapSstPlanAccion(created);

    await recordAudit(client, {
      action: 'PLAN_CREATE',
      actorUserId,
      after: plan,
      auditMeta,
      description: 'Creacion de plan de accion SST',
      entityId: plan.id,
      entityType: 'sst_planes_accion'
    });

    await client.query('COMMIT');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstPlanAccion = async (
  planId: string,
  input: UpdateSstPlanAccionInput,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentLookup = await ensureSstPlanAccionExists(planId, client);
    const current = await getSstPlanAccionById(planId);

    if (!current) {
      throw new AppError('SST action plan not found', 404, 'SST_PLAN_ACCION_NOT_FOUND');
    }

    const result = await client.query<SstPlanAccionRow>(
      `
        UPDATE sst_planes_accion
        SET
          responsable = $2,
          responsable_id = $3::uuid,
          descripcion = $4,
          fecha_compromiso = $5,
          fecha_cierre = $6,
          estado = $7,
          observaciones = $8,
          activo = $9,
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          evento_id::text AS evento_id,
          responsable,
          responsable_id::text AS responsable_id,
          descripcion,
          fecha_compromiso,
          fecha_cierre,
          estado,
          observaciones,
          activo,
          created_at,
          updated_at
      `,
      [
        planId,
        input.responsable ?? current.responsable,
        input.responsable_id !== undefined ? input.responsable_id : current.responsable_id,
        input.descripcion ?? current.descripcion,
        input.fecha_compromiso ?? current.fecha_compromiso,
        input.fecha_cierre !== undefined ? input.fecha_cierre : current.fecha_cierre,
        input.estado ?? currentLookup.estado,
        input.observaciones !== undefined ? input.observaciones : current.observaciones,
        input.activo ?? current.activo
      ]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to update SST action plan',
        500,
        'SST_PLAN_ACCION_UPDATE_FAILED'
      );
    }

    const plan = mapSstPlanAccion(updated);

    await recordAudit(client, {
      action: 'PLAN_UPDATE',
      actorUserId,
      auditMeta,
      before: current,
      after: plan,
      description: 'Actualizacion de plan de accion SST',
      entityId: plan.id,
      entityType: 'sst_planes_accion'
    });

    await client.query('COMMIT');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const closeSstPlanAccion = async (
  planId: string,
  input: { fecha_cierre: string; observaciones?: string | null },
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstPlanAccion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureSstPlanAccionExists(planId, client);
    const current = await getSstPlanAccionById(planId);

    if (!current) {
      throw new AppError('SST action plan not found', 404, 'SST_PLAN_ACCION_NOT_FOUND');
    }

    const result = await client.query<SstPlanAccionRow>(
      `
        UPDATE sst_planes_accion
        SET
          estado = 'CERRADO',
          fecha_cierre = $2,
          observaciones = COALESCE($3, observaciones),
          updated_at = NOW()
        WHERE id::text = $1
        RETURNING
          id::text AS id,
          evento_id::text AS evento_id,
          responsable,
          responsable_id::text AS responsable_id,
          descripcion,
          fecha_compromiso,
          fecha_cierre,
          estado,
          observaciones,
          activo,
          created_at,
          updated_at
      `,
      [planId, input.fecha_cierre, input.observaciones ?? null]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError(
        'Failed to close SST action plan',
        500,
        'SST_PLAN_ACCION_CLOSE_FAILED'
      );
    }

    const plan = mapSstPlanAccion(updated);

    await recordAudit(client, {
      action: 'PLAN_CLOSE',
      actorUserId,
      auditMeta,
      before: current,
      after: plan,
      description: 'Cierre de plan de accion SST',
      entityId: plan.id,
      entityType: 'sst_planes_accion'
    });

    await client.query('COMMIT');
    return plan;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const listSstIndicadores = async (
  filters: ListSstIndicadoresQuery
): Promise<SstIndicador[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`si.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`si.contrato_id::text = $${params.length}`);
  }

  if (filters.fecha_desde) {
    params.push(filters.fecha_desde);
    conditions.push(`si.fecha_desde >= $${params.length}`);
  }

  if (filters.fecha_hasta) {
    params.push(filters.fecha_hasta);
    conditions.push(`si.fecha_hasta <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery<SstIndicadorRow>(
    `
      SELECT
        si.id::text AS id,
        si.empresa_id::text AS empresa_id,
        si.contrato_id::text AS contrato_id,
        si.fecha_desde,
        si.fecha_hasta,
        si.total_eventos,
        si.total_accidentes_trabajo,
        si.total_incidentes,
        si.total_enfermedades_laborales,
        si.total_capacitaciones,
        si.total_entregas_epp,
        si.planes_abiertos,
        si.planes_cerrados,
        si.planes_vencidos,
        si.trabajadores_base,
        si.tasa_accidentalidad,
        si.porcentaje_cierre_planes,
        si.created_at,
        si.updated_at
      FROM sst_indicadores si
      ${whereClause}
      ORDER BY si.fecha_hasta DESC, si.created_at DESC
    `,
    params
  );

  return result.rows.map(mapSstIndicador);
};

const calculateIndicadoresSnapshot = async (
  client: PoolClient,
  input: CalculateSstIndicadoresInput
): Promise<SstIndicadoresSnapshot> => {
  const eventFilters = buildIndicadoresFilterSql(input, 'se');
  const planFilters = buildIndicadoresFilterSql(input, 'se');
  const vinculacionConditions: string[] = [];
  const vinculacionParams: unknown[] = [];

  if (input.empresa_id) {
    vinculacionParams.push(input.empresa_id);
    vinculacionConditions.push(`v.empresa_id::text = $${vinculacionParams.length}`);
  }

  if (input.contrato_id) {
    vinculacionParams.push(input.contrato_id);
    vinculacionConditions.push(`v.contrato_id::text = $${vinculacionParams.length}`);
  }

  vinculacionParams.push(input.fecha_hasta);
  vinculacionConditions.push(`v.fecha_inicio <= $${vinculacionParams.length}`);

  vinculacionParams.push(input.fecha_desde);
  vinculacionConditions.push(`(v.fecha_fin IS NULL OR v.fecha_fin >= $${vinculacionParams.length})`);

  const eventCountsResult = await client.query<AggregateEventCountsRow>(
    `
      SELECT
        COUNT(*)::int AS total_eventos,
        COUNT(*) FILTER (WHERE se.tipo_evento = 'ACCIDENTE_TRABAJO')::int AS total_accidentes_trabajo,
        COUNT(*) FILTER (WHERE se.tipo_evento = 'INCIDENTE')::int AS total_incidentes,
        COUNT(*) FILTER (WHERE se.tipo_evento = 'ENFERMEDAD_LABORAL')::int AS total_enfermedades_laborales,
        COUNT(*) FILTER (WHERE se.tipo_evento = 'CAPACITACION')::int AS total_capacitaciones,
        COUNT(*) FILTER (WHERE se.tipo_evento = 'ENTREGA_EPP')::int AS total_entregas_epp
      FROM sst_eventos se
      ${eventFilters.whereClause ? `${eventFilters.whereClause} AND se.activo = TRUE` : 'WHERE se.activo = TRUE'}
    `,
    eventFilters.params
  );

  const currentDate = new Date().toISOString().slice(0, 10);
  const planCountsResult = await client.query<AggregatePlanCountsRow>(
    `
      SELECT
        COUNT(*) FILTER (
          WHERE spa.activo = TRUE
            AND spa.estado <> 'CERRADO'
            AND spa.estado <> 'ANULADO'
            AND spa.fecha_compromiso >= $${planFilters.params.length + 1}
        )::int AS planes_abiertos,
        COUNT(*) FILTER (
          WHERE spa.activo = TRUE
            AND spa.estado = 'CERRADO'
        )::int AS planes_cerrados,
        COUNT(*) FILTER (
          WHERE spa.activo = TRUE
            AND spa.estado <> 'CERRADO'
            AND spa.estado <> 'ANULADO'
            AND spa.fecha_compromiso < $${planFilters.params.length + 1}
        )::int AS planes_vencidos
      FROM sst_planes_accion spa
      INNER JOIN sst_eventos se ON se.id = spa.evento_id
      ${planFilters.whereClause ? `${planFilters.whereClause} AND se.activo = TRUE` : 'WHERE se.activo = TRUE'}
    `,
    [...planFilters.params, currentDate]
  );

  const trabajadoresResult = await client.query<AggregateTrabajadoresRow>(
    `
      SELECT COUNT(DISTINCT v.id)::int AS trabajadores_base
      FROM vinculaciones v
      WHERE v.estado = 'ACTIVA'
        AND ${vinculacionConditions.join(' AND ')}
    `,
    vinculacionParams
  );

  const eventCounts = eventCountsResult.rows[0] ?? {
    total_eventos: 0,
    total_accidentes_trabajo: 0,
    total_incidentes: 0,
    total_enfermedades_laborales: 0,
    total_capacitaciones: 0,
    total_entregas_epp: 0
  };

  const planCounts = planCountsResult.rows[0] ?? {
    planes_abiertos: 0,
    planes_cerrados: 0,
    planes_vencidos: 0
  };

  const trabajadoresBase = trabajadoresResult.rows[0]?.trabajadores_base ?? 0;

  return buildSstIndicadoresSnapshot(
    {
      ...eventCounts,
      trabajadores_base: trabajadoresBase
    },
    planCounts
  );
};

export const calculateSstIndicadores = async (
  input: CalculateSstIndicadoresInput,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<SstIndicador> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const snapshot = await calculateIndicadoresSnapshot(client, input);

    const result = await client.query<SstIndicadorRow>(
      `
        INSERT INTO sst_indicadores (
          empresa_id,
          contrato_id,
          fecha_desde,
          fecha_hasta,
          total_eventos,
          total_accidentes_trabajo,
          total_incidentes,
          total_enfermedades_laborales,
          total_capacitaciones,
          total_entregas_epp,
          planes_abiertos,
          planes_cerrados,
          planes_vencidos,
          trabajadores_base,
          tasa_accidentalidad,
          porcentaje_cierre_planes,
          created_by
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17::uuid
        )
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          contrato_id::text AS contrato_id,
          fecha_desde,
          fecha_hasta,
          total_eventos,
          total_accidentes_trabajo,
          total_incidentes,
          total_enfermedades_laborales,
          total_capacitaciones,
          total_entregas_epp,
          planes_abiertos,
          planes_cerrados,
          planes_vencidos,
          trabajadores_base,
          tasa_accidentalidad,
          porcentaje_cierre_planes,
          created_at,
          updated_at
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.fecha_desde,
        input.fecha_hasta,
        snapshot.total_eventos,
        snapshot.total_accidentes_trabajo,
        snapshot.total_incidentes,
        snapshot.total_enfermedades_laborales,
        snapshot.total_capacitaciones,
        snapshot.total_entregas_epp,
        snapshot.planes_abiertos,
        snapshot.planes_cerrados,
        snapshot.planes_vencidos,
        snapshot.trabajadores_base,
        snapshot.tasa_accidentalidad,
        snapshot.porcentaje_cierre_planes,
        actorUserId
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError(
        'Failed to create SST indicator snapshot',
        500,
        'SST_INDICADORES_CREATE_FAILED'
      );
    }

    const indicador = mapSstIndicador(created);

    await recordAudit(client, {
      action: 'RECALCULAR',
      actorUserId,
      after: indicador,
      auditMeta,
      description: 'Calculo de indicadores SST',
      entityId: indicador.id,
      entityType: 'sst_indicadores'
    });

    await client.query('COMMIT');
    return indicador;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

interface SstCapacitacionRow extends QueryResultRow {
  activo: boolean | null;
  categoria: string;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  empresa_id: string;
  empresa_nombre: string | null;
  id: string;
  nombre_capacitacion: string;
  obligatoria: boolean | null;
  tema: string | null;
  vigencia_meses: number | string | null;
}

interface SstCapacitacionPersonaRow extends QueryResultRow {
  activo: boolean | null;
  aprobado: boolean | null;
  calificacion: number | string | null;
  capacitacion_activo: boolean | null;
  capacitacion_categoria: string;
  capacitacion_contrato_numero: string | null;
  capacitacion_created_at: Date | string;
  capacitacion_contrato_id: string | null;
  capacitacion_empresa_id: string;
  capacitacion_empresa_nombre: string | null;
  capacitacion_id: string;
  capacitacion_nombre: string;
  capacitacion_obligatoria: boolean | null;
  capacitacion_tema: string | null;
  capacitacion_vigencia_meses: number | string | null;
  contrato_id: string | null;
  created_at: Date | string;
  documento_archivo_path: string | null;
  documento_id: string | null;
  documento_mime_type: string | null;
  documento_nombre_original: string | null;
  documento_storage_bucket: string | null;
  documento_storage_path: string | null;
  documento_tamano_bytes: number | string | null;
  empresa_id: string;
  estado_capacitacion: string;
  fecha_capacitacion: Date | string;
  fecha_vencimiento: Date | string | null;
  id: string;
  observacion: string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  vinculacion_contrato_id: string | null;
  vinculacion_empresa_id: string | null;
  vinculacion_estado: string | null;
  vinculacion_id: string | null;
}

interface SstDotacionEppRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  descripcion: string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  frecuencia_reposicion_dias: number | string | null;
  id: string;
  nombre_item: string;
  obligatorio: boolean | null;
  requiere_reposicion: boolean | null;
  talla_requerida: boolean | null;
  tipo_item: SstDotacionEppTipoItem;
}

interface SstDotacionEppEntregaRow extends QueryResultRow {
  activo: boolean | null;
  cantidad: number | string;
  created_at: Date | string;
  documento_archivo_path: string | null;
  documento_id: string | null;
  documento_mime_type: string | null;
  documento_nombre_original: string | null;
  documento_storage_bucket: string | null;
  documento_storage_path: string | null;
  documento_tamano_bytes: number | string | null;
  estado_entrega: SstDotacionEppEstadoEntrega;
  estado_reposicion: 'vigente' | 'vencida' | 'proxima_a_vencer';
  fecha_entrega: Date | string;
  fecha_proxima_reposicion: Date | string | null;
  id: string;
  item_activo: boolean | null;
  item_contrato_id: string | null;
  item_contrato_numero: string | null;
  item_created_at: Date | string;
  item_descripcion: string | null;
  item_empresa_id: string;
  item_empresa_nombre: string | null;
  item_frecuencia_reposicion_dias: number | string | null;
  item_id: string;
  item_nombre: string;
  item_obligatorio: boolean | null;
  item_requiere_reposicion: boolean | null;
  item_talla_requerida: boolean | null;
  item_tipo_item: SstDotacionEppTipoItem;
  observacion: string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  recibido_por: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  talla: string | null;
  vinculacion_contrato_id: string | null;
  vinculacion_empresa_id: string | null;
  vinculacion_estado: string | null;
  vinculacion_id: string | null;
}

interface SstExamenOcupacionalRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  descripcion: string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  id: string;
  nombre_examen: string;
  obligatorio: boolean | null;
  tipo_examen: SstExamenOcupacionalTipoExamen;
  vigencia_meses: number | string | null;
}

interface SstExamenPersonaRow extends QueryResultRow {
  activo: boolean | null;
  concepto_medico: SstExamenOcupacionalConceptoMedico;
  created_at: Date | string;
  documento_archivo_path: string | null;
  documento_id: string | null;
  documento_mime_type: string | null;
  documento_nombre_original: string | null;
  documento_storage_bucket: string | null;
  documento_storage_path: string | null;
  documento_tamano_bytes: number | string | null;
  estado_examen: string;
  examen_activo: boolean | null;
  examen_contrato_id: string | null;
  examen_contrato_numero: string | null;
  examen_created_at: Date | string;
  examen_descripcion: string | null;
  examen_empresa_id: string;
  examen_empresa_nombre: string | null;
  examen_id: string;
  examen_nombre: string;
  examen_obligatorio: boolean | null;
  examen_tipo_examen: SstExamenOcupacionalTipoExamen;
  examen_vigencia_meses: number | string | null;
  fecha_examen: Date | string;
  fecha_vencimiento: Date | string | null;
  id: string;
  observacion: string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  restricciones: string | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  vinculacion_contrato_id: string | null;
  vinculacion_empresa_id: string | null;
  vinculacion_estado: string | null;
  vinculacion_id: string | null;
}

interface SstAccidenteRow extends QueryResultRow {
  activo: boolean | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  descripcion: string;
  dias_incapacidad: number | string | null;
  empresa_id: string;
  empresa_nombre: string | null;
  estado: SstAccidenteEstado;
  fecha_evento: Date | string;
  hora_evento: string | null;
  id: string;
  lesionado: boolean | null;
  lugar_evento: string | null;
  parte_cuerpo: string | null;
  persona_id: string;
  persona_numero_documento: string | null;
  primer_apellido: string | null;
  primer_nombre: string | null;
  requiere_investigacion: boolean | null;
  segundo_apellido: string | null;
  segundo_nombre: string | null;
  severidad: SstAccidenteSeveridad;
  tipo_evento: SstAccidenteTipoEvento;
  tipo_lesion: string | null;
  vinculacion_contrato_id: string | null;
  vinculacion_empresa_id: string | null;
  vinculacion_estado: string | null;
  vinculacion_id: string | null;
}

interface SstAccionAccidenteRow extends QueryResultRow {
  accidente_activo: boolean | null;
  accidente_contrato_id: string | null;
  accidente_contrato_numero: string | null;
  accidente_created_at: Date | string;
  accidente_descripcion: string;
  accidente_dias_incapacidad: number | string | null;
  accidente_empresa_id: string;
  accidente_empresa_nombre: string | null;
  accidente_estado: SstAccidenteEstado;
  accidente_fecha_evento: Date | string;
  accidente_hora_evento: string | null;
  accidente_id: string;
  accidente_lesionado: boolean | null;
  accidente_lugar_evento: string | null;
  accidente_parte_cuerpo: string | null;
  accidente_persona_id: string;
  accidente_persona_numero_documento: string | null;
  accidente_primer_apellido: string | null;
  accidente_primer_nombre: string | null;
  accidente_requiere_investigacion: boolean | null;
  accidente_segundo_apellido: string | null;
  accidente_segundo_nombre: string | null;
  accidente_severidad: SstAccidenteSeveridad;
  accidente_tipo_evento: SstAccidenteTipoEvento;
  accidente_tipo_lesion: string | null;
  accidente_vinculacion_contrato_id: string | null;
  accidente_vinculacion_empresa_id: string | null;
  accidente_vinculacion_estado: string | null;
  accidente_vinculacion_id: string | null;
  activo: boolean | null;
  created_at: Date | string;
  descripcion: string;
  estado: SstAccionAccidenteEstado;
  fecha_cierre: Date | string | null;
  fecha_compromiso: Date | string | null;
  id: string;
  responsable: string | null;
  estado_alerta: string;
}

interface SstContratoScopeRow extends QueryResultRow {
  empresa_id: string | null;
  id: string;
}

interface SstDocumentoPersonaScopeRow extends QueryResultRow {
  id: string;
  persona_id: string;
}

interface SstPersonaVinculacionRow extends QueryResultRow {
  contrato_id: string | null;
  empresa_id: string | null;
  estado_vinculacion: string | null;
  id: string;
  persona_id: string | null;
}

interface SstDashboardObligacionRow extends QueryResultRow {
  capacitacion_id: string;
  fecha_vencimiento: Date | string | null;
  persona_id: string;
  registro_id: string | null;
  vinculacion_id: string;
}

interface SstDotacionEppObligacionRow extends QueryResultRow {
  estado_entrega: SstDotacionEppEstadoEntrega | null;
  fecha_proxima_reposicion: Date | string | null;
  item_id: string;
  nombre_item: string;
  persona_id: string;
  persona_nombre: string;
  persona_numero_documento: string | null;
  registro_id: string | null;
  tipo_item: SstDotacionEppTipoItem;
  vinculacion_id: string;
}

interface SstExamenObligacionRow extends QueryResultRow {
  concepto_medico: SstExamenOcupacionalConceptoMedico | null;
  examen_id: string;
  fecha_vencimiento: Date | string | null;
  nombre_examen: string;
  persona_id: string;
  persona_nombre: string;
  persona_numero_documento: string | null;
  registro_id: string | null;
  tipo_examen: SstExamenOcupacionalTipoExamen;
  vinculacion_id: string;
}

interface AggregateIncapacidadRow extends QueryResultRow {
  incapacidades_total: number | string | null;
}

export interface SstCapacitacion {
  activo: boolean;
  categoria: string;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  id: number;
  nombre_capacitacion: string;
  obligatoria: boolean;
  tema: string | null;
  vigencia_meses: number | null;
}

export interface SstCapacitacionPersona {
  activo: boolean;
  aprobado: boolean;
  calificacion: number | null;
  capacitacion: SstCapacitacion;
  created_at: string;
  documento_persona: {
    archivo_path: string | null;
    id: number | null;
    mime_type: string | null;
    nombre_original: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    tamano_bytes: number | null;
  } | null;
  estado_capacitacion: 'vigente' | 'vencida' | 'sin_vencimiento';
  fecha_capacitacion: string;
  fecha_vencimiento: string | null;
  id: number;
  observacion: string | null;
  persona: {
    id: number;
    nombre_completo: string;
    numero_documento: string | null;
  };
  vinculacion: {
    contrato_id: number | null;
    empresa_id: number | null;
    estado_vinculacion: string | null;
    id: number | null;
  } | null;
}

export interface SstDotacionEpp {
  activo: boolean;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  descripcion: string | null;
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  frecuencia_reposicion_dias: number | null;
  id: number;
  nombre_item: string;
  obligatorio: boolean;
  requiere_reposicion: boolean;
  talla_requerida: boolean;
  tipo_item: SstDotacionEppTipoItem;
}

export interface SstDotacionEppEntrega {
  activo: boolean;
  cantidad: number;
  created_at: string;
  documento_persona: {
    archivo_path: string | null;
    id: number | null;
    mime_type: string | null;
    nombre_original: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    tamano_bytes: number | null;
  } | null;
  estado_entrega: SstDotacionEppEstadoEntrega;
  estado_reposicion: 'vigente' | 'vencida' | 'proxima_a_vencer';
  fecha_entrega: string;
  fecha_proxima_reposicion: string | null;
  id: number;
  item: SstDotacionEpp;
  observacion: string | null;
  persona: {
    id: number;
    nombre_completo: string;
    numero_documento: string | null;
  };
  recibido_por: string | null;
  talla: string | null;
  vinculacion: {
    contrato_id: number | null;
    empresa_id: number | null;
    estado_vinculacion: string | null;
    id: number | null;
  } | null;
}

export interface SstExamenOcupacional {
  activo: boolean;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  descripcion: string | null;
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  id: number;
  nombre_examen: string;
  obligatorio: boolean;
  tipo_examen: SstExamenOcupacionalTipoExamen;
  vigencia_meses: number | null;
}

export interface SstExamenPersona {
  activo: boolean;
  concepto_medico: SstExamenOcupacionalConceptoMedico;
  created_at: string;
  documento_persona: {
    archivo_path: string | null;
    id: number | null;
    mime_type: string | null;
    nombre_original: string | null;
    storage_bucket: string | null;
    storage_path: string | null;
    tamano_bytes: number | null;
  } | null;
  estado_examen: 'vigente' | 'vencido' | 'sin_vencimiento' | 'proximo_a_vencer';
  examen: SstExamenOcupacional;
  fecha_examen: string;
  fecha_vencimiento: string | null;
  id: number;
  observacion: string | null;
  persona: {
    id: number;
    nombre_completo: string;
    numero_documento: string | null;
  };
  restricciones: string | null;
  vinculacion: {
    contrato_id: number | null;
    empresa_id: number | null;
    estado_vinculacion: string | null;
    id: number | null;
  } | null;
}

export interface SstAccidente {
  activo: boolean;
  contrato: {
    id: number | null;
    numero_contrato: string | null;
  };
  created_at: string;
  descripcion: string;
  dias_incapacidad: number;
  empresa: {
    id: number;
    nombre_empresa: string | null;
  };
  estado: SstAccidenteEstado;
  fecha_evento: string;
  hora_evento: string | null;
  id: number;
  lesionado: boolean;
  lugar_evento: string | null;
  parte_cuerpo: string | null;
  persona: {
    id: number;
    nombre_completo: string;
    numero_documento: string | null;
  };
  requiere_investigacion: boolean;
  severidad: SstAccidenteSeveridad;
  tipo_evento: SstAccidenteTipoEvento;
  tipo_lesion: string | null;
  vinculacion: {
    contrato_id: number | null;
    empresa_id: number | null;
    estado_vinculacion: string | null;
    id: number | null;
  } | null;
}

export interface SstAccionAccidente {
  accidente: SstAccidente;
  activo: boolean;
  created_at: string;
  descripcion: string;
  estado: SstAccionAccidenteEstado;
  estado_alerta: 'vigente' | 'vencida' | 'proxima_a_vencer' | 'sin_fecha';
  fecha_cierre: string | null;
  fecha_compromiso: string | null;
  id: number;
  responsable: string | null;
}

export interface PaginatedSstCapacitaciones {
  items: SstCapacitacion[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstCapacitacionesPersona {
  items: SstCapacitacionPersona[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstDotacionEpp {
  items: SstDotacionEpp[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstDotacionEppEntregas {
  items: SstDotacionEppEntrega[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstExamenesOcupacionales {
  items: SstExamenOcupacional[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstExamenesPersona {
  items: SstExamenPersona[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstAccidentes {
  items: SstAccidente[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstAccionesAccidente {
  items: SstAccionAccidente[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface SstCapacitacionesDashboard {
  capacitaciones_obligatorias: number;
  capacitaciones_sin_vencimiento: number;
  capacitaciones_total: number;
  capacitaciones_vencidas: number;
  capacitaciones_vigentes: number;
  cumplimiento_porcentaje: number;
  personas_capacitadas: number;
  proximas_a_vencer_30_dias: number;
}

export interface SstDotacionEppDashboard {
  cumplimiento_porcentaje: number;
  entregas_total: number;
  entregas_vencidas: number;
  entregas_vigentes: number;
  items_obligatorios: number;
  items_total: number;
  pendientes: number;
  personas_con_entrega: number;
  proximas_reposicion_30_dias: number;
}

export interface SstExamenesDashboard {
  aptos: number;
  aptos_con_restricciones: number;
  cumplimiento_porcentaje: number;
  examenes_obligatorios: number;
  examenes_sin_vencimiento: number;
  examenes_total: number;
  examenes_vencidos: number;
  examenes_vigentes: number;
  no_aptos: number;
  pendientes: number;
  personas_con_examen: number;
  proximos_a_vencer_30_dias: number;
  registros_total: number;
}

export interface SstAccidentesDashboard {
  accidentes_total: number;
  acciones_abiertas: number;
  acciones_vencidas: number;
  abiertos: number;
  casi_accidentes_total: number;
  cerrados: number;
  cumplimiento_acciones_porcentaje: number;
  graves: number;
  incapacidades_total: number;
  incidentes_total: number;
  investigacion: number;
  lesionados: number;
  leves: number;
  moderados: number;
  mortales: number;
}

export interface SstCapacitacionAlerta {
  capacitacion: {
    categoria: string;
    id: number;
    nombre_capacitacion: string;
  };
  descripcion: string;
  dias_restantes: number | null;
  estado: 'ACTIVA';
  fecha_alerta: string;
  fecha_vencimiento: string | null;
  id: string;
  persona: {
    id: number;
    numero_documento: string | null;
  };
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  titulo: string;
  tipo_alerta: 'CAPACITACION_VENCIDA' | 'CAPACITACION_PROXIMA_A_VENCER' | 'CAPACITACION_FALTANTE';
  vinculacion: {
    id: number;
  };
}

export interface SstDotacionEppAlerta {
  descripcion: string;
  dias_restantes: number | null;
  estado: 'ACTIVA';
  fecha_alerta: string;
  fecha_proxima_reposicion: string | null;
  id: string;
  item: {
    id: number;
    nombre_item: string;
    tipo_item: SstDotacionEppTipoItem;
  };
  persona: {
    id: number;
    numero_documento: string | null;
  };
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  tipo_alerta:
    | 'DOTACION_FALTANTE'
    | 'EPP_FALTANTE'
    | 'DOTACION_REPOSICION_VENCIDA'
    | 'EPP_REPOSICION_VENCIDA'
    | 'DOTACION_PROXIMA_REPOSICION'
    | 'EPP_PROXIMA_REPOSICION';
  titulo: string;
  vinculacion: {
    id: number;
  };
}

export interface SstExamenAlerta {
  descripcion: string;
  dias_restantes: number | null;
  estado: 'ACTIVA';
  examen: {
    id: number;
    nombre_examen: string;
    tipo_examen: SstExamenOcupacionalTipoExamen;
  };
  fecha_alerta: string;
  fecha_vencimiento: string | null;
  id: string;
  persona: {
    id: number;
    numero_documento: string | null;
  };
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  tipo_alerta:
    | 'EXAMEN_OCUPACIONAL_FALTANTE'
    | 'EXAMEN_OCUPACIONAL_VENCIDO'
    | 'EXAMEN_OCUPACIONAL_PROXIMO_A_VENCER'
    | 'EXAMEN_OCUPACIONAL_NO_APTO'
    | 'EXAMEN_OCUPACIONAL_RESTRICCIONES';
  titulo: string;
  vinculacion: {
    id: number;
  };
}

export interface SstAccidenteAlerta {
  accidente: {
    id: number;
    severidad: SstAccidenteSeveridad;
    tipo_evento: SstAccidenteTipoEvento;
  } | null;
  accion_correctiva: {
    id: number;
  } | null;
  descripcion: string;
  dias_restantes: number | null;
  estado: 'ACTIVA';
  fecha_alerta: string;
  fecha_compromiso: string | null;
  id: string;
  persona: {
    id: number;
    numero_documento: string | null;
  };
  severidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  tipo_alerta:
    | 'ACCIDENTE_ABIERTO'
    | 'INVESTIGACION_PENDIENTE'
    | 'ACCION_CORRECTIVA_VENCIDA'
    | 'ACCION_CORRECTIVA_PROXIMA_VENCER';
  titulo: string;
  vinculacion: {
    id: number;
  };
}

export interface PaginatedSstCapacitacionAlertas {
  items: SstCapacitacionAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstDotacionEppAlertas {
  items: SstDotacionEppAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstExamenAlertas {
  items: SstExamenAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface PaginatedSstAccidenteAlertas {
  items: SstAccidenteAlerta[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

const toBigintNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
};

const toNullableBigintNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toBooleanValue = (value: boolean | null | undefined): boolean => value ?? false;

const toDateIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value;
};

const appendTenantScopeConditions = (
  conditions: string[],
  params: unknown[],
  tenant: TenantAccessContext | undefined,
  contratoColumn: string,
  empresaColumn: string
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (tenant.contratoIds.length === 0 && tenant.empresaIds.length === 0) {
    conditions.push('1 = 0');
    return;
  }

  const tenantClauses: string[] = [];

  if (tenant.contratoIds.length > 0) {
    params.push(tenant.contratoIds);
    tenantClauses.push(`${contratoColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenant.empresaIds.length > 0) {
    params.push(tenant.empresaIds);
    tenantClauses.push(`${empresaColumn} = ANY($${params.length}::bigint[])`);
  }

  if (tenantClauses.length > 0) {
    conditions.push(`(${tenantClauses.join(' OR ')})`);
  }
};

const ensureTenantScopeForEntity = (
  tenant: TenantAccessContext | undefined,
  contratoId: number | null,
  empresaId: number | null
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (contratoId !== null && tenant.contratoIds.includes(contratoId)) {
    return;
  }

  if (empresaId !== null && tenant.empresaIds.includes(empresaId)) {
    return;
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const ensureFilterWithinTenant = (
  tenant: TenantAccessContext | undefined,
  filters: { contrato_id?: string | null; empresa_id?: string | null }
): void => {
  if (!tenant || tenant.isGlobalAdmin) {
    return;
  }

  if (filters.contrato_id && !tenant.contratoIds.includes(Number(filters.contrato_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  if (filters.empresa_id && !tenant.empresaIds.includes(Number(filters.empresa_id))) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

const mapSstCapacitacion = (row: SstCapacitacionRow): SstCapacitacion => {
  return {
    id: toBigintNumber(row.id),
    empresa: {
      id: toBigintNumber(row.empresa_id),
      nombre_empresa: row.empresa_nombre
    },
    contrato: {
      id: toNullableBigintNumber(row.contrato_id),
      numero_contrato: row.contrato_numero
    },
    nombre_capacitacion: row.nombre_capacitacion,
    tema: row.tema,
    categoria: row.categoria,
    obligatoria: toBooleanValue(row.obligatoria),
    vigencia_meses: toNullableBigintNumber(row.vigencia_meses),
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstCapacitacionPersona = (row: SstCapacitacionPersonaRow): SstCapacitacionPersona => {
  return {
    id: toBigintNumber(row.id),
    capacitacion: {
      id: toBigintNumber(row.capacitacion_id),
      empresa: {
        id: toBigintNumber(row.capacitacion_empresa_id),
        nombre_empresa: row.capacitacion_empresa_nombre
      },
      contrato: {
        id: toNullableBigintNumber(row.capacitacion_contrato_id),
        numero_contrato: row.capacitacion_contrato_numero
      },
      nombre_capacitacion: row.capacitacion_nombre,
      tema: row.capacitacion_tema,
      categoria: row.capacitacion_categoria,
      obligatoria: toBooleanValue(row.capacitacion_obligatoria),
      vigencia_meses: toNullableBigintNumber(row.capacitacion_vigencia_meses),
      activo: toBooleanValue(row.capacitacion_activo),
      created_at:
        row.capacitacion_created_at instanceof Date
          ? row.capacitacion_created_at.toISOString()
          : String(row.capacitacion_created_at)
    },
    persona: {
      id: toBigintNumber(row.persona_id),
      numero_documento: row.persona_numero_documento,
      nombre_completo: [row.primer_nombre, row.segundo_nombre, row.primer_apellido, row.segundo_apellido]
        .filter((value) => Boolean(value))
        .join(' ')
    },
    vinculacion: row.vinculacion_id
      ? {
          id: toBigintNumber(row.vinculacion_id),
          contrato_id: toNullableBigintNumber(row.vinculacion_contrato_id),
          empresa_id: toNullableBigintNumber(row.vinculacion_empresa_id),
          estado_vinculacion: row.vinculacion_estado
        }
      : null,
    fecha_capacitacion: toDateIsoString(row.fecha_capacitacion) ?? '',
    fecha_vencimiento: toDateIsoString(row.fecha_vencimiento),
    estado_capacitacion: row.estado_capacitacion as SstCapacitacionPersona['estado_capacitacion'],
    aprobado: toBooleanValue(row.aprobado),
    calificacion: toNullableBigintNumber(row.calificacion),
    documento_persona: row.documento_id
      ? {
          id: toBigintNumber(row.documento_id),
          archivo_path: row.documento_archivo_path,
          nombre_original: row.documento_nombre_original,
          mime_type: row.documento_mime_type,
          storage_bucket: row.documento_storage_bucket,
          storage_path: row.documento_storage_path,
          tamano_bytes: toNullableBigintNumber(row.documento_tamano_bytes)
        }
      : null,
    observacion: row.observacion,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstDotacionEpp = (row: SstDotacionEppRow): SstDotacionEpp => {
  return {
    id: toBigintNumber(row.id),
    empresa: {
      id: toBigintNumber(row.empresa_id),
      nombre_empresa: row.empresa_nombre
    },
    contrato: {
      id: toNullableBigintNumber(row.contrato_id),
      numero_contrato: row.contrato_numero
    },
    nombre_item: row.nombre_item,
    tipo_item: row.tipo_item,
    descripcion: row.descripcion,
    talla_requerida: toBooleanValue(row.talla_requerida),
    requiere_reposicion: toBooleanValue(row.requiere_reposicion),
    frecuencia_reposicion_dias: toNullableBigintNumber(row.frecuencia_reposicion_dias),
    obligatorio: toBooleanValue(row.obligatorio),
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstDotacionEppEntrega = (row: SstDotacionEppEntregaRow): SstDotacionEppEntrega => {
  return {
    id: toBigintNumber(row.id),
    item: {
      id: toBigintNumber(row.item_id),
      empresa: {
        id: toBigintNumber(row.item_empresa_id),
        nombre_empresa: row.item_empresa_nombre
      },
      contrato: {
        id: toNullableBigintNumber(row.item_contrato_id),
        numero_contrato: row.item_contrato_numero
      },
      nombre_item: row.item_nombre,
      tipo_item: row.item_tipo_item,
      descripcion: row.item_descripcion,
      talla_requerida: toBooleanValue(row.item_talla_requerida),
      requiere_reposicion: toBooleanValue(row.item_requiere_reposicion),
      frecuencia_reposicion_dias: toNullableBigintNumber(row.item_frecuencia_reposicion_dias),
      obligatorio: toBooleanValue(row.item_obligatorio),
      activo: toBooleanValue(row.item_activo),
      created_at: row.item_created_at instanceof Date ? row.item_created_at.toISOString() : String(row.item_created_at)
    },
    persona: {
      id: toBigintNumber(row.persona_id),
      numero_documento: row.persona_numero_documento,
      nombre_completo: [row.primer_nombre, row.segundo_nombre, row.primer_apellido, row.segundo_apellido]
        .filter((value) => Boolean(value))
        .join(' ')
    },
    vinculacion: row.vinculacion_id
      ? {
          id: toBigintNumber(row.vinculacion_id),
          contrato_id: toNullableBigintNumber(row.vinculacion_contrato_id),
          empresa_id: toNullableBigintNumber(row.vinculacion_empresa_id),
          estado_vinculacion: row.vinculacion_estado
        }
      : null,
    fecha_entrega: toDateIsoString(row.fecha_entrega) ?? '',
    fecha_proxima_reposicion: toDateIsoString(row.fecha_proxima_reposicion),
    estado_reposicion: row.estado_reposicion,
    estado_entrega: row.estado_entrega,
    cantidad: toBigintNumber(row.cantidad),
    talla: row.talla,
    documento_persona: row.documento_id
      ? {
          id: toBigintNumber(row.documento_id),
          archivo_path: row.documento_archivo_path,
          nombre_original: row.documento_nombre_original,
          mime_type: row.documento_mime_type,
          storage_bucket: row.documento_storage_bucket,
          storage_path: row.documento_storage_path,
          tamano_bytes: toNullableBigintNumber(row.documento_tamano_bytes)
        }
      : null,
    recibido_por: row.recibido_por,
    observacion: row.observacion,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstExamenOcupacional = (row: SstExamenOcupacionalRow): SstExamenOcupacional => {
  return {
    id: toBigintNumber(row.id),
    empresa: {
      id: toBigintNumber(row.empresa_id),
      nombre_empresa: row.empresa_nombre
    },
    contrato: {
      id: toNullableBigintNumber(row.contrato_id),
      numero_contrato: row.contrato_numero
    },
    nombre_examen: row.nombre_examen,
    tipo_examen: row.tipo_examen,
    descripcion: row.descripcion,
    obligatorio: toBooleanValue(row.obligatorio),
    vigencia_meses: toNullableBigintNumber(row.vigencia_meses),
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstExamenPersona = (row: SstExamenPersonaRow): SstExamenPersona => {
  return {
    id: toBigintNumber(row.id),
    examen: {
      id: toBigintNumber(row.examen_id),
      empresa: {
        id: toBigintNumber(row.examen_empresa_id),
        nombre_empresa: row.examen_empresa_nombre
      },
      contrato: {
        id: toNullableBigintNumber(row.examen_contrato_id),
        numero_contrato: row.examen_contrato_numero
      },
      nombre_examen: row.examen_nombre,
      tipo_examen: row.examen_tipo_examen,
      descripcion: row.examen_descripcion,
      obligatorio: toBooleanValue(row.examen_obligatorio),
      vigencia_meses: toNullableBigintNumber(row.examen_vigencia_meses),
      activo: toBooleanValue(row.examen_activo),
      created_at: row.examen_created_at instanceof Date ? row.examen_created_at.toISOString() : String(row.examen_created_at)
    },
    persona: {
      id: toBigintNumber(row.persona_id),
      numero_documento: row.persona_numero_documento,
      nombre_completo: [row.primer_nombre, row.segundo_nombre, row.primer_apellido, row.segundo_apellido]
        .filter((value) => Boolean(value))
        .join(' ')
    },
    vinculacion: row.vinculacion_id
      ? {
          id: toBigintNumber(row.vinculacion_id),
          contrato_id: toNullableBigintNumber(row.vinculacion_contrato_id),
          empresa_id: toNullableBigintNumber(row.vinculacion_empresa_id),
          estado_vinculacion: row.vinculacion_estado
        }
      : null,
    fecha_examen: toDateIsoString(row.fecha_examen) ?? '',
    fecha_vencimiento: toDateIsoString(row.fecha_vencimiento),
    estado_examen: row.estado_examen as SstExamenPersona['estado_examen'],
    concepto_medico: row.concepto_medico,
    restricciones: row.restricciones,
    documento_persona: row.documento_id
      ? {
          id: toBigintNumber(row.documento_id),
          archivo_path: row.documento_archivo_path,
          nombre_original: row.documento_nombre_original,
          mime_type: row.documento_mime_type,
          storage_bucket: row.documento_storage_bucket,
          storage_path: row.documento_storage_path,
          tamano_bytes: toNullableBigintNumber(row.documento_tamano_bytes)
        }
      : null,
    observacion: row.observacion,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstAccidente = (row: SstAccidenteRow): SstAccidente => {
  return {
    id: toBigintNumber(row.id),
    empresa: {
      id: toBigintNumber(row.empresa_id),
      nombre_empresa: row.empresa_nombre
    },
    contrato: {
      id: toNullableBigintNumber(row.contrato_id),
      numero_contrato: row.contrato_numero
    },
    persona: {
      id: toBigintNumber(row.persona_id),
      numero_documento: row.persona_numero_documento,
      nombre_completo: [row.primer_nombre, row.segundo_nombre, row.primer_apellido, row.segundo_apellido]
        .filter((value) => Boolean(value))
        .join(' ')
    },
    vinculacion: row.vinculacion_id
      ? {
          id: toBigintNumber(row.vinculacion_id),
          contrato_id: toNullableBigintNumber(row.vinculacion_contrato_id),
          empresa_id: toNullableBigintNumber(row.vinculacion_empresa_id),
          estado_vinculacion: row.vinculacion_estado
        }
      : null,
    tipo_evento: row.tipo_evento,
    fecha_evento: toDateIsoString(row.fecha_evento) ?? '',
    hora_evento: row.hora_evento,
    lugar_evento: row.lugar_evento,
    descripcion: row.descripcion,
    lesionado: toBooleanValue(row.lesionado),
    tipo_lesion: row.tipo_lesion,
    parte_cuerpo: row.parte_cuerpo,
    dias_incapacidad: toNullableBigintNumber(row.dias_incapacidad) ?? 0,
    requiere_investigacion: toBooleanValue(row.requiere_investigacion),
    severidad: row.severidad,
    estado: row.estado,
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const mapSstAccionAccidente = (row: SstAccionAccidenteRow): SstAccionAccidente => {
  return {
    id: toBigintNumber(row.id),
    accidente: mapSstAccidente({
      id: row.accidente_id,
      empresa_id: row.accidente_empresa_id,
      empresa_nombre: row.accidente_empresa_nombre,
      contrato_id: row.accidente_contrato_id,
      contrato_numero: row.accidente_contrato_numero,
      persona_id: row.accidente_persona_id,
      persona_numero_documento: row.accidente_persona_numero_documento,
      primer_nombre: row.accidente_primer_nombre,
      segundo_nombre: row.accidente_segundo_nombre,
      primer_apellido: row.accidente_primer_apellido,
      segundo_apellido: row.accidente_segundo_apellido,
      vinculacion_id: row.accidente_vinculacion_id,
      vinculacion_contrato_id: row.accidente_vinculacion_contrato_id,
      vinculacion_empresa_id: row.accidente_vinculacion_empresa_id,
      vinculacion_estado: row.accidente_vinculacion_estado,
      tipo_evento: row.accidente_tipo_evento,
      fecha_evento: row.accidente_fecha_evento,
      hora_evento: row.accidente_hora_evento,
      lugar_evento: row.accidente_lugar_evento,
      descripcion: row.accidente_descripcion,
      lesionado: row.accidente_lesionado,
      tipo_lesion: row.accidente_tipo_lesion,
      parte_cuerpo: row.accidente_parte_cuerpo,
      dias_incapacidad: row.accidente_dias_incapacidad,
      requiere_investigacion: row.accidente_requiere_investigacion,
      severidad: row.accidente_severidad,
      estado: row.accidente_estado,
      activo: row.accidente_activo,
      created_at: row.accidente_created_at
    } as SstAccidenteRow),
    descripcion: row.descripcion,
    responsable: row.responsable,
    fecha_compromiso: toDateIsoString(row.fecha_compromiso),
    fecha_cierre: toDateIsoString(row.fecha_cierre),
    estado: row.estado,
    estado_alerta: row.estado_alerta as SstAccionAccidente['estado_alerta'],
    activo: toBooleanValue(row.activo),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at)
  };
};

const getSstCapacitacionSelect = (): string => {
  return `
    SELECT
      sc.id::text AS id,
      sc.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      sc.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      sc.nombre_capacitacion,
      sc.tema,
      sc.categoria,
      sc.obligatoria,
      sc.vigencia_meses,
      sc.activo,
      sc.created_at
    FROM sst_capacitaciones sc
    INNER JOIN empresas e ON e.id = sc.empresa_id
    LEFT JOIN contratos c ON c.id = sc.contrato_id
  `;
};

const addDaysToDateOnly = (value: string, days: number): string => {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};

const addMonthsToDateOnly = (value: string, months: number): string => {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString().slice(0, 10);
};

const getTodayDateOnly = (): string => new Date().toISOString().slice(0, 10);

const getDateAfter30Days = (): string => {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 30);
  return next.toISOString().slice(0, 10);
};

const getDotacionEppAlertPrefix = (
  tipoItem: SstDotacionEppTipoItem
): 'DOTACION' | 'EPP' => (tipoItem === 'EPP' ? 'EPP' : 'DOTACION');

const getAccidenteAlertSeverity = (
  severidad: SstAccidenteSeveridad
): 'MEDIA' | 'ALTA' | 'CRITICA' => {
  if (severidad === 'MORTAL') {
    return 'CRITICA';
  }

  if (severidad === 'GRAVE') {
    return 'ALTA';
  }

  return 'MEDIA';
};

const resolveEstadoReposicion = (fechaProximaReposicion: string | null): 'vigente' | 'vencida' | 'proxima_a_vencer' => {
  if (!fechaProximaReposicion) {
    return 'vigente';
  }

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();

  if (fechaProximaReposicion < today) {
    return 'vencida';
  }

  if (fechaProximaReposicion <= thresholdDate) {
    return 'proxima_a_vencer';
  }

  return 'vigente';
};

const resolveFechaProximaReposicion = (
  item: Pick<SstDotacionEppRow, 'requiere_reposicion' | 'frecuencia_reposicion_dias'>,
  fechaEntrega: string,
  manualFecha?: string | null
): string | null => {
  if (manualFecha !== undefined) {
    return manualFecha;
  }

  if (!toBooleanValue(item.requiere_reposicion)) {
    return null;
  }

  const frecuencia = toNullableBigintNumber(item.frecuencia_reposicion_dias);

  if (!frecuencia) {
    return null;
  }

  return addDaysToDateOnly(fechaEntrega, frecuencia);
};

const resolveEstadoExamen = (
  fechaVencimiento: string | null
): 'vigente' | 'vencido' | 'sin_vencimiento' | 'proximo_a_vencer' => {
  if (!fechaVencimiento) {
    return 'sin_vencimiento';
  }

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();

  if (fechaVencimiento < today) {
    return 'vencido';
  }

  if (fechaVencimiento <= thresholdDate) {
    return 'proximo_a_vencer';
  }

  return 'vigente';
};

const resolveFechaVencimientoExamen = (
  examen: Pick<SstExamenOcupacionalRow, 'vigencia_meses'>,
  fechaExamen: string,
  manualFecha?: string | null
): string | null => {
  if (manualFecha !== undefined) {
    return manualFecha;
  }

  const vigencia = toNullableBigintNumber(examen.vigencia_meses);

  if (!vigencia) {
    return null;
  }

  return addMonthsToDateOnly(fechaExamen, vigencia);
};

const resolveEstadoAccionCorrectiva = (
  fechaCompromiso: string | null,
  estado: SstAccionAccidenteEstado
): 'vigente' | 'vencida' | 'proxima_a_vencer' | 'sin_fecha' => {
  if (estado === 'CERRADA') {
    return 'vigente';
  }

  if (!fechaCompromiso) {
    return 'sin_fecha';
  }

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();

  if (fechaCompromiso < today) {
    return 'vencida';
  }

  if (fechaCompromiso <= thresholdDate) {
    return 'proxima_a_vencer';
  }

  return 'vigente';
};

const getSstCapacitacionPersonaSelect = (): string => {
  return `
    SELECT
      scp.id::text AS id,
      scp.capacitacion_id::text AS capacitacion_id,
      scp.persona_id::text AS persona_id,
      scp.vinculacion_id::text AS vinculacion_id,
      scp.fecha_capacitacion,
      scp.fecha_vencimiento,
      CASE
        WHEN scp.fecha_vencimiento IS NULL THEN 'sin_vencimiento'
        WHEN scp.fecha_vencimiento < CURRENT_DATE THEN 'vencida'
        ELSE 'vigente'
      END AS estado_capacitacion,
      scp.aprobado,
      scp.calificacion,
      scp.documento_persona_id::text AS documento_id,
      scp.observacion,
      scp.activo,
      scp.created_at,
      sc.id::text AS capacitacion_id,
      sc.empresa_id::text AS capacitacion_empresa_id,
      e.nombre_empresa AS capacitacion_empresa_nombre,
      sc.contrato_id::text AS capacitacion_contrato_id,
      c.numero_contrato AS capacitacion_contrato_numero,
      sc.nombre_capacitacion AS capacitacion_nombre,
      sc.tema AS capacitacion_tema,
      sc.categoria AS capacitacion_categoria,
      sc.obligatoria AS capacitacion_obligatoria,
      sc.vigencia_meses AS capacitacion_vigencia_meses,
      sc.activo AS capacitacion_activo,
      sc.created_at AS capacitacion_created_at,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      v.contrato_id::text AS vinculacion_contrato_id,
      v.empresa_id::text AS vinculacion_empresa_id,
      v.estado_vinculacion AS vinculacion_estado,
      sc.empresa_id::text AS empresa_id,
      sc.contrato_id::text AS contrato_id,
      dp.archivo_path AS documento_archivo_path,
      dp.nombre_original AS documento_nombre_original,
      dp.mime_type AS documento_mime_type,
      dp.storage_bucket AS documento_storage_bucket,
      dp.storage_path AS documento_storage_path,
      dp.tamano_bytes AS documento_tamano_bytes
    FROM sst_capacitaciones_persona scp
    INNER JOIN sst_capacitaciones sc ON sc.id = scp.capacitacion_id
    INNER JOIN empresas e ON e.id = sc.empresa_id
    LEFT JOIN contratos c ON c.id = sc.contrato_id
    INNER JOIN personas p ON p.id = scp.persona_id
    LEFT JOIN vinculaciones v ON v.id = scp.vinculacion_id
    LEFT JOIN documentos_persona dp ON dp.id = scp.documento_persona_id
  `;
};

const getSstDotacionEppSelect = (): string => {
  return `
    SELECT
      sde.id::text AS id,
      sde.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      sde.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      sde.nombre_item,
      sde.tipo_item,
      sde.descripcion,
      sde.talla_requerida,
      sde.requiere_reposicion,
      sde.frecuencia_reposicion_dias,
      sde.obligatorio,
      sde.activo,
      sde.created_at
    FROM sst_dotacion_epp sde
    INNER JOIN empresas e ON e.id = sde.empresa_id
    LEFT JOIN contratos c ON c.id = sde.contrato_id
  `;
};

const getSstDotacionEppEntregaSelect = (): string => {
  return `
    SELECT
      sdee.id::text AS id,
      sdee.item_id::text AS item_id,
      sdee.persona_id::text AS persona_id,
      sdee.vinculacion_id::text AS vinculacion_id,
      sdee.fecha_entrega,
      sdee.cantidad,
      sdee.talla,
      sdee.estado_entrega,
      sdee.fecha_proxima_reposicion,
      CASE
        WHEN sdee.fecha_proxima_reposicion IS NULL THEN 'vigente'
        WHEN sdee.fecha_proxima_reposicion < CURRENT_DATE THEN 'vencida'
        WHEN sdee.fecha_proxima_reposicion <= CURRENT_DATE + 30 THEN 'proxima_a_vencer'
        ELSE 'vigente'
      END AS estado_reposicion,
      sdee.documento_persona_id::text AS documento_id,
      sdee.recibido_por,
      sdee.observacion,
      sdee.activo,
      sdee.created_at,
      sde.empresa_id::text AS item_empresa_id,
      e.nombre_empresa AS item_empresa_nombre,
      sde.contrato_id::text AS item_contrato_id,
      c.numero_contrato AS item_contrato_numero,
      sde.nombre_item AS item_nombre,
      sde.tipo_item AS item_tipo_item,
      sde.descripcion AS item_descripcion,
      sde.talla_requerida AS item_talla_requerida,
      sde.requiere_reposicion AS item_requiere_reposicion,
      sde.frecuencia_reposicion_dias AS item_frecuencia_reposicion_dias,
      sde.obligatorio AS item_obligatorio,
      sde.activo AS item_activo,
      sde.created_at AS item_created_at,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      v.contrato_id::text AS vinculacion_contrato_id,
      v.empresa_id::text AS vinculacion_empresa_id,
      v.estado_vinculacion AS vinculacion_estado,
      dp.archivo_path AS documento_archivo_path,
      dp.nombre_original AS documento_nombre_original,
      dp.mime_type AS documento_mime_type,
      dp.storage_bucket AS documento_storage_bucket,
      dp.storage_path AS documento_storage_path,
      dp.tamano_bytes AS documento_tamano_bytes
    FROM sst_dotacion_epp_entregas sdee
    INNER JOIN sst_dotacion_epp sde ON sde.id = sdee.item_id
    INNER JOIN empresas e ON e.id = sde.empresa_id
    LEFT JOIN contratos c ON c.id = sde.contrato_id
    INNER JOIN personas p ON p.id = sdee.persona_id
    LEFT JOIN vinculaciones v ON v.id = sdee.vinculacion_id
    LEFT JOIN documentos_persona dp ON dp.id = sdee.documento_persona_id
  `;
};

const getSstExamenOcupacionalSelect = (): string => {
  return `
    SELECT
      seo.id::text AS id,
      seo.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      seo.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      seo.nombre_examen,
      seo.tipo_examen,
      seo.descripcion,
      seo.obligatorio,
      seo.vigencia_meses,
      seo.activo,
      seo.created_at
    FROM sst_examenes_ocupacionales seo
    INNER JOIN empresas e ON e.id = seo.empresa_id
    LEFT JOIN contratos c ON c.id = seo.contrato_id
  `;
};

const getSstExamenPersonaSelect = (): string => {
  return `
    SELECT
      sep.id::text AS id,
      sep.examen_id::text AS examen_id,
      sep.persona_id::text AS persona_id,
      sep.vinculacion_id::text AS vinculacion_id,
      sep.fecha_examen,
      sep.fecha_vencimiento,
      CASE
        WHEN sep.fecha_vencimiento IS NULL THEN 'sin_vencimiento'
        WHEN sep.fecha_vencimiento < CURRENT_DATE THEN 'vencido'
        WHEN sep.fecha_vencimiento <= CURRENT_DATE + 30 THEN 'proximo_a_vencer'
        ELSE 'vigente'
      END AS estado_examen,
      sep.concepto_medico,
      sep.restricciones,
      sep.documento_persona_id::text AS documento_id,
      sep.observacion,
      sep.activo,
      sep.created_at,
      seo.empresa_id::text AS examen_empresa_id,
      e.nombre_empresa AS examen_empresa_nombre,
      seo.contrato_id::text AS examen_contrato_id,
      c.numero_contrato AS examen_contrato_numero,
      seo.nombre_examen AS examen_nombre,
      seo.tipo_examen AS examen_tipo_examen,
      seo.descripcion AS examen_descripcion,
      seo.obligatorio AS examen_obligatorio,
      seo.vigencia_meses AS examen_vigencia_meses,
      seo.activo AS examen_activo,
      seo.created_at AS examen_created_at,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      v.contrato_id::text AS vinculacion_contrato_id,
      v.empresa_id::text AS vinculacion_empresa_id,
      v.estado_vinculacion AS vinculacion_estado,
      dp.archivo_path AS documento_archivo_path,
      dp.nombre_original AS documento_nombre_original,
      dp.mime_type AS documento_mime_type,
      dp.storage_bucket AS documento_storage_bucket,
      dp.storage_path AS documento_storage_path,
      dp.tamano_bytes AS documento_tamano_bytes
    FROM sst_examenes_persona sep
    INNER JOIN sst_examenes_ocupacionales seo ON seo.id = sep.examen_id
    INNER JOIN empresas e ON e.id = seo.empresa_id
    LEFT JOIN contratos c ON c.id = seo.contrato_id
    INNER JOIN personas p ON p.id = sep.persona_id
    LEFT JOIN vinculaciones v ON v.id = sep.vinculacion_id
    LEFT JOIN documentos_persona dp ON dp.id = sep.documento_persona_id
  `;
};

const getSstAccidenteSelect = (): string => {
  return `
    SELECT
      sai.id::text AS id,
      sai.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      sai.contrato_id::text AS contrato_id,
      c.numero_contrato AS contrato_numero,
      sai.persona_id::text AS persona_id,
      p.numero_documento AS persona_numero_documento,
      p.primer_nombre,
      p.segundo_nombre,
      p.primer_apellido,
      p.segundo_apellido,
      sai.vinculacion_id::text AS vinculacion_id,
      v.contrato_id::text AS vinculacion_contrato_id,
      v.empresa_id::text AS vinculacion_empresa_id,
      v.estado_vinculacion AS vinculacion_estado,
      sai.tipo_evento,
      sai.fecha_evento,
      TO_CHAR(sai.hora_evento, 'HH24:MI:SS') AS hora_evento,
      sai.lugar_evento,
      sai.descripcion,
      sai.lesionado,
      sai.tipo_lesion,
      sai.parte_cuerpo,
      sai.dias_incapacidad,
      sai.requiere_investigacion,
      sai.severidad,
      sai.estado,
      sai.activo,
      sai.created_at
    FROM sst_accidentes_incidentes sai
    INNER JOIN empresas e ON e.id = sai.empresa_id
    LEFT JOIN contratos c ON c.id = sai.contrato_id
    INNER JOIN personas p ON p.id = sai.persona_id
    LEFT JOIN vinculaciones v ON v.id = sai.vinculacion_id
  `;
};

const getSstAccionAccidenteSelect = (): string => {
  return `
    SELECT
      saa.id::text AS id,
      saa.descripcion,
      saa.responsable,
      saa.fecha_compromiso,
      saa.fecha_cierre,
      saa.estado,
      CASE
        WHEN saa.estado = 'CERRADA' THEN 'vigente'
        WHEN saa.fecha_compromiso IS NULL THEN 'sin_fecha'
        WHEN saa.fecha_compromiso < CURRENT_DATE THEN 'vencida'
        WHEN saa.fecha_compromiso <= CURRENT_DATE + 30 THEN 'proxima_a_vencer'
        ELSE 'vigente'
      END AS estado_alerta,
      saa.activo,
      saa.created_at,
      sai.id::text AS accidente_id,
      sai.empresa_id::text AS accidente_empresa_id,
      e.nombre_empresa AS accidente_empresa_nombre,
      sai.contrato_id::text AS accidente_contrato_id,
      c.numero_contrato AS accidente_contrato_numero,
      sai.persona_id::text AS accidente_persona_id,
      p.numero_documento AS accidente_persona_numero_documento,
      p.primer_nombre AS accidente_primer_nombre,
      p.segundo_nombre AS accidente_segundo_nombre,
      p.primer_apellido AS accidente_primer_apellido,
      p.segundo_apellido AS accidente_segundo_apellido,
      sai.vinculacion_id::text AS accidente_vinculacion_id,
      v.contrato_id::text AS accidente_vinculacion_contrato_id,
      v.empresa_id::text AS accidente_vinculacion_empresa_id,
      v.estado_vinculacion AS accidente_vinculacion_estado,
      sai.tipo_evento AS accidente_tipo_evento,
      sai.fecha_evento AS accidente_fecha_evento,
      TO_CHAR(sai.hora_evento, 'HH24:MI:SS') AS accidente_hora_evento,
      sai.lugar_evento AS accidente_lugar_evento,
      sai.descripcion AS accidente_descripcion,
      sai.lesionado AS accidente_lesionado,
      sai.tipo_lesion AS accidente_tipo_lesion,
      sai.parte_cuerpo AS accidente_parte_cuerpo,
      sai.dias_incapacidad AS accidente_dias_incapacidad,
      sai.requiere_investigacion AS accidente_requiere_investigacion,
      sai.severidad AS accidente_severidad,
      sai.estado AS accidente_estado,
      sai.activo AS accidente_activo,
      sai.created_at AS accidente_created_at
    FROM sst_accidentes_acciones saa
    INNER JOIN sst_accidentes_incidentes sai ON sai.id = saa.accidente_id
    INNER JOIN empresas e ON e.id = sai.empresa_id
    LEFT JOIN contratos c ON c.id = sai.contrato_id
    INNER JOIN personas p ON p.id = sai.persona_id
    LEFT JOIN vinculaciones v ON v.id = sai.vinculacion_id
  `;
};

const loadContratoScope = async (
  contratoId: string,
  client?: PoolClient
): Promise<{ contrato_id: number; empresa_id: number | null }> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstContratoScopeRow>(
    `
      SELECT
        id::text AS id,
        empresa_id::text AS empresa_id
      FROM contratos
      WHERE id::text = $1
      LIMIT 1
    `,
    [contratoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Contrato not found', 400, 'CONTRATO_NOT_FOUND');
  }

  return {
    contrato_id: toBigintNumber(row.id),
    empresa_id: toNullableBigintNumber(row.empresa_id)
  };
};

const ensureSstCapacitacionExists = async (
  capacitacionId: string,
  client?: PoolClient
): Promise<SstCapacitacionRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstCapacitacionRow>(
    `
      ${getSstCapacitacionSelect()}
      WHERE sc.id::text = $1
      LIMIT 1
    `,
    [capacitacionId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST training not found', 404, 'SST_CAPACITACION_NOT_FOUND');
  }

  return row;
};

const ensureSstCapacitacionPersonaExists = async (
  recordId: string,
  client?: PoolClient
): Promise<SstCapacitacionPersonaRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstCapacitacionPersonaRow>(
    `
      ${getSstCapacitacionPersonaSelect()}
      WHERE scp.id::text = $1
      LIMIT 1
    `,
    [recordId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST person training not found', 404, 'SST_CAPACITACION_PERSONA_NOT_FOUND');
  }

  return row;
};

const ensureSstDotacionEppExists = async (
  itemId: string,
  client?: PoolClient
): Promise<SstDotacionEppRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstDotacionEppRow>(
    `
      ${getSstDotacionEppSelect()}
      WHERE sde.id::text = $1
      LIMIT 1
    `,
    [itemId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST EPP item not found', 404, 'SST_DOTACION_EPP_NOT_FOUND');
  }

  return row;
};

const ensureSstDotacionEppEntregaExists = async (
  recordId: string,
  client?: PoolClient
): Promise<SstDotacionEppEntregaRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstDotacionEppEntregaRow>(
    `
      ${getSstDotacionEppEntregaSelect()}
      WHERE sdee.id::text = $1
      LIMIT 1
    `,
    [recordId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST EPP delivery not found', 404, 'SST_DOTACION_EPP_ENTREGA_NOT_FOUND');
  }

  return row;
};

const ensureSstExamenOcupacionalExists = async (
  examenId: string,
  client?: PoolClient
): Promise<SstExamenOcupacionalRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstExamenOcupacionalRow>(
    `
      ${getSstExamenOcupacionalSelect()}
      WHERE seo.id::text = $1
      LIMIT 1
    `,
    [examenId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST occupational exam not found', 404, 'SST_EXAMEN_NOT_FOUND');
  }

  return row;
};

const ensureSstExamenPersonaExists = async (
  recordId: string,
  client?: PoolClient
): Promise<SstExamenPersonaRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstExamenPersonaRow>(
    `
      ${getSstExamenPersonaSelect()}
      WHERE sep.id::text = $1
      LIMIT 1
    `,
    [recordId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST person exam not found', 404, 'SST_EXAMEN_PERSONA_NOT_FOUND');
  }

  return row;
};

const ensureSstAccidenteExists = async (
  recordId: string,
  client?: PoolClient
): Promise<SstAccidenteRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstAccidenteRow>(
    `
      ${getSstAccidenteSelect()}
      WHERE sai.id::text = $1
      LIMIT 1
    `,
    [recordId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST accident not found', 404, 'SST_ACCIDENTE_NOT_FOUND');
  }

  return row;
};

const ensureSstAccionAccidenteExists = async (
  recordId: string,
  client?: PoolClient
): Promise<SstAccionAccidenteRow> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstAccionAccidenteRow>(
    `
      ${getSstAccionAccidenteSelect()}
      WHERE saa.id::text = $1
      LIMIT 1
    `,
    [recordId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('SST corrective action not found', 404, 'SST_ACCION_NOT_FOUND');
  }

  return row;
};

const ensureDocumentoPersonaScope = async (
  documentoId: string,
  personaId: string,
  client?: PoolClient
): Promise<void> => {
  const executor = client ?? dbPool;
  const result = await executor.query<SstDocumentoPersonaScopeRow>(
    `
      SELECT
        id::text AS id,
        persona_id::text AS persona_id
      FROM documentos_persona
      WHERE id::text = $1
      LIMIT 1
    `,
    [documentoId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Documento persona not found', 400, 'DOCUMENTO_PERSONA_NOT_FOUND');
  }

  if (row.persona_id !== personaId) {
    throw new AppError(
      'documento_persona_id does not belong to persona_id',
      409,
      'SST_CAPACITACION_PERSONA_DOCUMENTO_MISMATCH'
    );
  }
};

const validateCapacitacionScope = async (input: {
  client: PoolClient;
  contrato_id: string | null;
  empresa_id: string;
  tenant?: TenantAccessContext;
}): Promise<void> => {
  const empresaId = toBigintNumber(input.empresa_id);

  if (input.contrato_id) {
    const contratoScope = await loadContratoScope(input.contrato_id, input.client);

    if (contratoScope.empresa_id !== null && contratoScope.empresa_id !== empresaId) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'SST_CAPACITACION_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, empresaId);
};

const validateCapacitacionPersonaRelations = async (input: {
  capacitacionId: string;
  client: PoolClient;
  documentoPersonaId: string | null;
  personaId: string;
  tenant?: TenantAccessContext;
  vinculacionId: string | null;
}): Promise<{
  capacitacion: SstCapacitacionRow;
  vinculacion: SstPersonaVinculacionRow | null;
}> => {
  const capacitacion = await ensureSstCapacitacionExists(input.capacitacionId, input.client);

  if (!toBooleanValue(capacitacion.activo)) {
    throw new AppError('SST training is inactive', 409, 'SST_CAPACITACION_INACTIVA');
  }

  await validateCapacitacionScope({
    client: input.client,
    empresa_id: String(capacitacion.empresa_id),
    contrato_id: capacitacion.contrato_id,
    tenant: input.tenant
  });

  await ensurePersonaExists(input.personaId, input.client);
  let vinculacion: SstPersonaVinculacionRow | null = null;

  if (input.vinculacionId) {
    const found = await ensureVinculacionExists(input.vinculacionId, input.client);
    const normalized = {
      id: found.id,
      persona_id: found.persona_id,
      contrato_id: found.contrato_id,
      empresa_id: found.empresa_id,
      estado_vinculacion: found.estado_vinculacion
    };

    if (normalized.persona_id !== input.personaId) {
      throw new AppError(
        'vinculacion_id does not belong to persona_id',
        409,
        'SST_CAPACITACION_PERSONA_VINCULACION_MISMATCH'
      );
    }

    if (capacitacion.contrato_id && normalized.contrato_id !== capacitacion.contrato_id) {
      throw new AppError(
        'vinculacion_id does not belong to contrato_id of training',
        409,
        'SST_CAPACITACION_PERSONA_CONTRATO_MISMATCH'
      );
    }

    if (normalized.empresa_id !== capacitacion.empresa_id) {
      throw new AppError(
        'vinculacion_id does not belong to empresa_id of training',
        409,
        'SST_CAPACITACION_PERSONA_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(
      input.tenant,
      normalized.contrato_id ? Number(normalized.contrato_id) : null,
      normalized.empresa_id ? Number(normalized.empresa_id) : null
    );

    vinculacion = normalized;
  }

  if (input.documentoPersonaId) {
    await ensureDocumentoPersonaScope(input.documentoPersonaId, input.personaId, input.client);
  }

  return {
    capacitacion,
    vinculacion
  };
};

const validateDotacionEppScope = async (input: {
  client: PoolClient;
  contrato_id: string | null;
  empresa_id: string;
  tenant?: TenantAccessContext;
}): Promise<void> => {
  const empresaId = toBigintNumber(input.empresa_id);

  if (input.contrato_id) {
    const contratoScope = await loadContratoScope(input.contrato_id, input.client);

    if (contratoScope.empresa_id !== null && contratoScope.empresa_id !== empresaId) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'SST_DOTACION_EPP_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, empresaId);
};

const validateDotacionEppEntregaRelations = async (input: {
  client: PoolClient;
  documentoPersonaId: string | null;
  itemId: string;
  personaId: string;
  tenant?: TenantAccessContext;
  vinculacionId: string | null;
}): Promise<{
  item: SstDotacionEppRow;
  vinculacion: SstPersonaVinculacionRow | null;
}> => {
  const item = await ensureSstDotacionEppExists(input.itemId, input.client);

  if (!toBooleanValue(item.activo)) {
    throw new AppError('SST EPP item is inactive', 409, 'SST_DOTACION_EPP_INACTIVO');
  }

  await validateDotacionEppScope({
    client: input.client,
    empresa_id: String(item.empresa_id),
    contrato_id: item.contrato_id,
    tenant: input.tenant
  });

  await ensurePersonaExists(input.personaId, input.client);
  let vinculacion: SstPersonaVinculacionRow | null = null;

  if (input.vinculacionId) {
    const found = await ensureVinculacionExists(input.vinculacionId, input.client);
    const normalized = {
      id: found.id,
      persona_id: found.persona_id,
      contrato_id: found.contrato_id,
      empresa_id: found.empresa_id,
      estado_vinculacion: found.estado_vinculacion
    };

    if (normalized.persona_id !== input.personaId) {
      throw new AppError(
        'vinculacion_id does not belong to persona_id',
        409,
        'SST_DOTACION_EPP_ENTREGA_VINCULACION_PERSONA_MISMATCH'
      );
    }

    if (item.contrato_id && normalized.contrato_id !== item.contrato_id) {
      throw new AppError(
        'vinculacion_id does not belong to contrato_id of item',
        409,
        'SST_DOTACION_EPP_ENTREGA_CONTRATO_MISMATCH'
      );
    }

    if (normalized.empresa_id !== item.empresa_id) {
      throw new AppError(
        'vinculacion_id does not belong to empresa_id of item',
        409,
        'SST_DOTACION_EPP_ENTREGA_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(
      input.tenant,
      normalized.contrato_id ? Number(normalized.contrato_id) : null,
      normalized.empresa_id ? Number(normalized.empresa_id) : null
    );

    vinculacion = normalized;
  }

  if (input.documentoPersonaId) {
    await ensureDocumentoPersonaScope(input.documentoPersonaId, input.personaId, input.client);
  }

  return {
    item,
    vinculacion
  };
};

const validateExamenOcupacionalScope = async (input: {
  client: PoolClient;
  contrato_id: string | null;
  empresa_id: string;
  tenant?: TenantAccessContext;
}): Promise<void> => {
  const empresaId = toBigintNumber(input.empresa_id);

  if (input.contrato_id) {
    const contratoScope = await loadContratoScope(input.contrato_id, input.client);

    if (contratoScope.empresa_id !== null && contratoScope.empresa_id !== empresaId) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'SST_EXAMEN_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, empresaId);
    return;
  }

  ensureTenantScopeForEntity(input.tenant, null, empresaId);
};

const validateExamenPersonaRelations = async (input: {
  client: PoolClient;
  documentoPersonaId: string | null;
  examenId: string;
  personaId: string;
  tenant?: TenantAccessContext;
  vinculacionId: string | null;
}): Promise<{
  examen: SstExamenOcupacionalRow;
  vinculacion: SstPersonaVinculacionRow | null;
}> => {
  const examen = await ensureSstExamenOcupacionalExists(input.examenId, input.client);

  if (!toBooleanValue(examen.activo)) {
    throw new AppError('SST occupational exam is inactive', 409, 'SST_EXAMEN_INACTIVO');
  }

  await validateExamenOcupacionalScope({
    client: input.client,
    empresa_id: String(examen.empresa_id),
    contrato_id: examen.contrato_id,
    tenant: input.tenant
  });

  await ensurePersonaExists(input.personaId, input.client);
  let vinculacion: SstPersonaVinculacionRow | null = null;

  if (input.vinculacionId) {
    const found = await ensureVinculacionExists(input.vinculacionId, input.client);
    const normalized = {
      id: found.id,
      persona_id: found.persona_id,
      contrato_id: found.contrato_id,
      empresa_id: found.empresa_id,
      estado_vinculacion: found.estado_vinculacion
    };

    if (normalized.persona_id !== input.personaId) {
      throw new AppError(
        'vinculacion_id does not belong to persona_id',
        409,
        'SST_EXAMEN_PERSONA_VINCULACION_MISMATCH'
      );
    }

    if (examen.contrato_id && normalized.contrato_id !== examen.contrato_id) {
      throw new AppError(
        'vinculacion_id does not belong to contrato_id of exam',
        409,
        'SST_EXAMEN_PERSONA_CONTRATO_MISMATCH'
      );
    }

    if (normalized.empresa_id !== examen.empresa_id) {
      throw new AppError(
        'vinculacion_id does not belong to empresa_id of exam',
        409,
        'SST_EXAMEN_PERSONA_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(
      input.tenant,
      normalized.contrato_id ? Number(normalized.contrato_id) : null,
      normalized.empresa_id ? Number(normalized.empresa_id) : null
    );

    vinculacion = normalized;
  }

  if (input.documentoPersonaId) {
    await ensureDocumentoPersonaScope(input.documentoPersonaId, input.personaId, input.client);
  }

  return {
    examen,
    vinculacion
  };
};

const validateAccidenteRelations = async (input: {
  client: PoolClient;
  contratoId: string | null;
  empresaId: string;
  personaId: string;
  tenant?: TenantAccessContext;
  vinculacionId: string | null;
}): Promise<SstPersonaVinculacionRow | null> => {
  await ensureEmpresaExists(input.empresaId, input.client);
  await ensurePersonaExists(input.personaId, input.client);

  if (input.contratoId) {
    await ensureContratoExists(input.contratoId, input.client);
    const contratoScope = await loadContratoScope(input.contratoId, input.client);

    if (contratoScope.empresa_id !== null && contratoScope.empresa_id !== toBigintNumber(input.empresaId)) {
      throw new AppError(
        'contrato_id does not belong to empresa_id',
        409,
        'SST_ACCIDENTE_CONTRATO_EMPRESA_MISMATCH'
      );
    }

    ensureTenantScopeForEntity(input.tenant, contratoScope.contrato_id, toBigintNumber(input.empresaId));
  } else {
    ensureTenantScopeForEntity(input.tenant, null, toBigintNumber(input.empresaId));
  }

  if (!input.vinculacionId) {
    return null;
  }

  const found = await ensureVinculacionExists(input.vinculacionId, input.client);
  const normalized = {
    id: found.id,
    persona_id: found.persona_id,
    contrato_id: found.contrato_id,
    empresa_id: found.empresa_id,
    estado_vinculacion: found.estado_vinculacion
  };

  if (normalized.persona_id !== input.personaId) {
    throw new AppError(
      'vinculacion_id does not belong to persona_id',
      409,
      'SST_ACCIDENTE_PERSONA_VINCULACION_MISMATCH'
    );
  }

  if (input.contratoId && normalized.contrato_id !== input.contratoId) {
    throw new AppError(
      'vinculacion_id does not belong to contrato_id',
      409,
      'SST_ACCIDENTE_CONTRATO_VINCULACION_MISMATCH'
    );
  }

  if (normalized.empresa_id !== input.empresaId) {
    throw new AppError(
      'vinculacion_id does not belong to empresa_id',
      409,
      'SST_ACCIDENTE_EMPRESA_VINCULACION_MISMATCH'
    );
  }

  ensureTenantScopeForEntity(
    input.tenant,
    normalized.contrato_id ? Number(normalized.contrato_id) : null,
    normalized.empresa_id ? Number(normalized.empresa_id) : null
  );

  return normalized;
};

const buildSstAccidentesWhere = (
  filters: ListSstAccidentesQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'sai.contrato_id', 'sai.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sai.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sai.contrato_id::text = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`sai.persona_id::text = $${params.length}`);
  }

  if (filters.vinculacion_id) {
    params.push(filters.vinculacion_id);
    conditions.push(`sai.vinculacion_id::text = $${params.length}`);
  }

  if (filters.tipo_evento) {
    params.push(filters.tipo_evento);
    conditions.push(`sai.tipo_evento = $${params.length}`);
  }

  if (filters.severidad) {
    params.push(filters.severidad);
    conditions.push(`sai.severidad = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`sai.estado = $${params.length}`);
  }

  if (filters.lesionado !== undefined) {
    params.push(filters.lesionado);
    conditions.push(`sai.lesionado = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sai.activo, TRUE) = $${params.length}`);
  }

  if (filters.fecha_desde) {
    params.push(filters.fecha_desde);
    conditions.push(`sai.fecha_evento >= $${params.length}`);
  }

  if (filters.fecha_hasta) {
    params.push(filters.fecha_hasta);
    conditions.push(`sai.fecha_evento <= $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstAccionesAccidenteWhere = (
  accidenteId: string,
  filters: ListSstAccionesAccidenteQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = ['saa.accidente_id::text = $1'];
  const params: unknown[] = [accidenteId];

  appendTenantScopeConditions(conditions, params, tenant, 'sai.contrato_id', 'sai.empresa_id');

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`saa.estado = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(saa.activo, TRUE) = $${params.length}`);
  }

  return {
    params,
    whereClause: `WHERE ${conditions.join(' AND ')}`
  };
};

const buildSstDotacionEppWhere = (
  filters: ListSstDotacionEppQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'sde.contrato_id', 'sde.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sde.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sde.contrato_id::text = $${params.length}`);
  }

  if (filters.tipo_item) {
    params.push(filters.tipo_item);
    conditions.push(`sde.tipo_item = $${params.length}`);
  }

  if (filters.obligatorio !== undefined) {
    params.push(filters.obligatorio);
    conditions.push(`sde.obligatorio = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`sde.activo = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(sde.nombre_item ILIKE $${params.length} OR COALESCE(sde.descripcion, '') ILIKE $${params.length})`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstDotacionEppEntregasWhere = (
  filters: ListSstDotacionEppEntregasQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'sde.contrato_id', 'sde.empresa_id');

  if (filters.item_id) {
    params.push(filters.item_id);
    conditions.push(`sdee.item_id::text = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`sdee.persona_id::text = $${params.length}`);
  }

  if (filters.vinculacion_id) {
    params.push(filters.vinculacion_id);
    conditions.push(`sdee.vinculacion_id::text = $${params.length}`);
  }

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sde.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sde.contrato_id::text = $${params.length}`);
  }

  if (filters.estado_entrega) {
    params.push(filters.estado_entrega);
    conditions.push(`sdee.estado_entrega = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`sdee.activo = $${params.length}`);
  }

  if (filters.estado_reposicion) {
    if (filters.estado_reposicion === 'vencida') {
      conditions.push('sdee.fecha_proxima_reposicion IS NOT NULL AND sdee.fecha_proxima_reposicion < CURRENT_DATE');
    } else if (filters.estado_reposicion === 'proxima_a_vencer') {
      conditions.push(
        'sdee.fecha_proxima_reposicion IS NOT NULL AND sdee.fecha_proxima_reposicion >= CURRENT_DATE AND sdee.fecha_proxima_reposicion <= CURRENT_DATE + 30'
      );
    } else {
      conditions.push(
        '(sdee.fecha_proxima_reposicion IS NULL OR sdee.fecha_proxima_reposicion > CURRENT_DATE + 30 OR (sdee.fecha_proxima_reposicion >= CURRENT_DATE AND sdee.fecha_proxima_reposicion <= CURRENT_DATE + 30))'
      );
    }
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstExamenesWhere = (
  filters: ListSstExamenesOcupacionalesQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'seo.contrato_id', 'seo.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`seo.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`seo.contrato_id::text = $${params.length}`);
  }

  if (filters.tipo_examen) {
    params.push(filters.tipo_examen);
    conditions.push(`seo.tipo_examen = $${params.length}`);
  }

  if (filters.obligatorio !== undefined) {
    params.push(filters.obligatorio);
    conditions.push(`seo.obligatorio = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`seo.activo = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(
      `(seo.nombre_examen ILIKE $${params.length} OR COALESCE(seo.descripcion, '') ILIKE $${params.length})`
    );
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstExamenesPersonaWhere = (
  filters: ListSstExamenesPersonaQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'seo.contrato_id', 'seo.empresa_id');

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`sep.persona_id::text = $${params.length}`);
  }

  if (filters.vinculacion_id) {
    params.push(filters.vinculacion_id);
    conditions.push(`sep.vinculacion_id::text = $${params.length}`);
  }

  if (filters.examen_id) {
    params.push(filters.examen_id);
    conditions.push(`sep.examen_id::text = $${params.length}`);
  }

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`seo.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`seo.contrato_id::text = $${params.length}`);
  }

  if (filters.concepto_medico) {
    params.push(filters.concepto_medico);
    conditions.push(`sep.concepto_medico = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sep.activo, TRUE) = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`(
      CASE
        WHEN sep.fecha_vencimiento IS NULL THEN 'sin_vencimiento'
        WHEN sep.fecha_vencimiento < CURRENT_DATE THEN 'vencido'
        WHEN sep.fecha_vencimiento <= CURRENT_DATE + 30 THEN 'proximo_a_vencer'
        ELSE 'vigente'
      END
    ) = $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstCapacitacionesWhere = (
  filters: ListSstCapacitacionesQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'sc.contrato_id', 'sc.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sc.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sc.contrato_id::text = $${params.length}`);
  }

  if (filters.categoria) {
    params.push(filters.categoria);
    conditions.push(`sc.categoria = $${params.length}`);
  }

  if (filters.obligatoria !== undefined) {
    params.push(filters.obligatoria);
    conditions.push(`sc.obligatoria = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(sc.activo, TRUE) = $${params.length}`);
  }

  if (filters.search) {
    params.push(`%${filters.search}%`);
    conditions.push(`(
      sc.nombre_capacitacion ILIKE $${params.length}
      OR COALESCE(sc.tema, '') ILIKE $${params.length}
      OR sc.categoria ILIKE $${params.length}
    )`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const buildSstCapacitacionesPersonaWhere = (
  filters: ListSstCapacitacionesPersonaQuery,
  tenant?: TenantAccessContext
): { params: unknown[]; whereClause: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'sc.contrato_id', 'sc.empresa_id');

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`scp.persona_id::text = $${params.length}`);
  }

  if (filters.vinculacion_id) {
    params.push(filters.vinculacion_id);
    conditions.push(`scp.vinculacion_id::text = $${params.length}`);
  }

  if (filters.capacitacion_id) {
    params.push(filters.capacitacion_id);
    conditions.push(`scp.capacitacion_id::text = $${params.length}`);
  }

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sc.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sc.contrato_id::text = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(scp.activo, TRUE) = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`(
      CASE
        WHEN scp.fecha_vencimiento IS NULL THEN 'sin_vencimiento'
        WHEN scp.fecha_vencimiento < CURRENT_DATE THEN 'vencida'
        ELSE 'vigente'
      END
    ) = $${params.length}`);
  }

  return {
    params,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const listSstObligaciones = async (
  filters: { empresa_id?: string | null; contrato_id?: string | null; persona_id?: string | null },
  tenant?: TenantAccessContext
): Promise<Array<{
  capacitacion_id: number;
  categoria: string;
  fecha_vencimiento: string | null;
  nombre_capacitacion: string;
  persona_id: number;
  persona_nombre: string;
  persona_numero_documento: string | null;
  registro_id: number | null;
  vinculacion_id: number;
}>> => {
  const params: unknown[] = [];
  const conditions: string[] = [
    `COALESCE(sc.activo, TRUE) = TRUE`,
    `COALESCE(sc.obligatoria, TRUE) = TRUE`,
    `v.estado_vinculacion = 'ACTIVA'`
  ];

  appendTenantScopeConditions(conditions, params, tenant, 'sc.contrato_id', 'sc.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sc.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sc.contrato_id::text = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`v.persona_id::text = $${params.length}`);
  }

  const result = await dbQuery<{
    capacitacion_id: string;
    categoria: string;
    fecha_vencimiento: Date | string | null;
    nombre_capacitacion: string;
    persona_id: string;
    persona_nombre: string;
    persona_numero_documento: string | null;
    registro_id: string | null;
    vinculacion_id: string;
  }>(
    `
      SELECT
        sc.id::text AS capacitacion_id,
        sc.nombre_capacitacion,
        sc.categoria,
        p.id::text AS persona_id,
        p.numero_documento AS persona_numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        v.id::text AS vinculacion_id,
        latest.id::text AS registro_id,
        latest.fecha_vencimiento
      FROM sst_capacitaciones sc
      INNER JOIN vinculaciones v
        ON v.empresa_id = sc.empresa_id
       AND (sc.contrato_id IS NULL OR sc.contrato_id = v.contrato_id)
      INNER JOIN personas p ON p.id = v.persona_id
      LEFT JOIN LATERAL (
        SELECT
          scp.id,
          scp.fecha_vencimiento,
          scp.fecha_capacitacion
        FROM sst_capacitaciones_persona scp
        WHERE scp.capacitacion_id = sc.id
          AND scp.persona_id = v.persona_id
          AND COALESCE(scp.activo, TRUE) = TRUE
          AND (scp.vinculacion_id = v.id OR scp.vinculacion_id IS NULL)
        ORDER BY scp.fecha_capacitacion DESC, scp.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, sc.nombre_capacitacion ASC
    `,
    params
  );

  return result.rows.map((row) => ({
    capacitacion_id: toBigintNumber(row.capacitacion_id),
    nombre_capacitacion: row.nombre_capacitacion,
    categoria: row.categoria,
    persona_id: toBigintNumber(row.persona_id),
    persona_numero_documento: row.persona_numero_documento,
    persona_nombre: row.persona_nombre,
    vinculacion_id: toBigintNumber(row.vinculacion_id),
    registro_id: toNullableBigintNumber(row.registro_id),
    fecha_vencimiento: toDateIsoString(row.fecha_vencimiento)
  }));
};

const listSstDotacionEppObligaciones = async (
  filters: { empresa_id?: string | null; contrato_id?: string | null; persona_id?: string | null },
  tenant?: TenantAccessContext
): Promise<
  Array<{
    estado_entrega: SstDotacionEppEstadoEntrega | null;
    fecha_proxima_reposicion: string | null;
    item_id: number;
    nombre_item: string;
    persona_id: number;
    persona_nombre: string;
    persona_numero_documento: string | null;
    registro_id: number | null;
    tipo_item: SstDotacionEppTipoItem;
    vinculacion_id: number;
  }>
> => {
  const params: unknown[] = [];
  const conditions: string[] = [
    `COALESCE(sde.activo, TRUE) = TRUE`,
    `COALESCE(sde.obligatorio, TRUE) = TRUE`,
    `v.estado_vinculacion = 'ACTIVA'`
  ];

  appendTenantScopeConditions(conditions, params, tenant, 'sde.contrato_id', 'sde.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sde.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sde.contrato_id::text = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`v.persona_id::text = $${params.length}`);
  }

  const result = await dbQuery<SstDotacionEppObligacionRow>(
    `
      SELECT
        sde.id::text AS item_id,
        sde.nombre_item,
        sde.tipo_item,
        p.id::text AS persona_id,
        p.numero_documento AS persona_numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        v.id::text AS vinculacion_id,
        latest.id::text AS registro_id,
        latest.fecha_proxima_reposicion,
        latest.estado_entrega
      FROM sst_dotacion_epp sde
      INNER JOIN vinculaciones v
        ON v.empresa_id = sde.empresa_id
       AND (sde.contrato_id IS NULL OR sde.contrato_id = v.contrato_id)
      INNER JOIN personas p ON p.id = v.persona_id
      LEFT JOIN LATERAL (
        SELECT
          sdee.id,
          sdee.fecha_proxima_reposicion,
          sdee.estado_entrega,
          sdee.fecha_entrega
        FROM sst_dotacion_epp_entregas sdee
        WHERE sdee.item_id = sde.id
          AND sdee.persona_id = v.persona_id
          AND COALESCE(sdee.activo, TRUE) = TRUE
          AND (sdee.vinculacion_id = v.id OR sdee.vinculacion_id IS NULL)
        ORDER BY sdee.fecha_entrega DESC, sdee.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, sde.nombre_item ASC
    `,
    params
  );

  return result.rows.map((row) => ({
    item_id: toBigintNumber(row.item_id),
    nombre_item: row.nombre_item,
    tipo_item: row.tipo_item,
    persona_id: toBigintNumber(row.persona_id),
    persona_numero_documento: row.persona_numero_documento,
    persona_nombre: row.persona_nombre,
    vinculacion_id: toBigintNumber(row.vinculacion_id),
    registro_id: toNullableBigintNumber(row.registro_id),
    fecha_proxima_reposicion: toDateIsoString(row.fecha_proxima_reposicion),
    estado_entrega: row.estado_entrega
  }));
};

const listSstExamenObligaciones = async (
  filters: { empresa_id?: string | null; contrato_id?: string | null; persona_id?: string | null },
  tenant?: TenantAccessContext
): Promise<
  Array<{
    concepto_medico: SstExamenOcupacionalConceptoMedico | null;
    examen_id: number;
    fecha_vencimiento: string | null;
    nombre_examen: string;
    persona_id: number;
    persona_nombre: string;
    persona_numero_documento: string | null;
    registro_id: number | null;
    tipo_examen: SstExamenOcupacionalTipoExamen;
    vinculacion_id: number;
  }>
> => {
  const params: unknown[] = [];
  const conditions: string[] = [
    `COALESCE(seo.activo, TRUE) = TRUE`,
    `COALESCE(seo.obligatorio, TRUE) = TRUE`,
    `v.estado_vinculacion = 'ACTIVA'`
  ];

  appendTenantScopeConditions(conditions, params, tenant, 'seo.contrato_id', 'seo.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`seo.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`seo.contrato_id::text = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`v.persona_id::text = $${params.length}`);
  }

  const result = await dbQuery<SstExamenObligacionRow>(
    `
      SELECT
        seo.id::text AS examen_id,
        seo.nombre_examen,
        seo.tipo_examen,
        p.id::text AS persona_id,
        p.numero_documento AS persona_numero_documento,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        v.id::text AS vinculacion_id,
        latest.id::text AS registro_id,
        latest.fecha_vencimiento,
        latest.concepto_medico
      FROM sst_examenes_ocupacionales seo
      INNER JOIN vinculaciones v
        ON v.empresa_id = seo.empresa_id
       AND (seo.contrato_id IS NULL OR seo.contrato_id = v.contrato_id)
      INNER JOIN personas p ON p.id = v.persona_id
      LEFT JOIN LATERAL (
        SELECT
          sep.id,
          sep.fecha_vencimiento,
          sep.concepto_medico,
          sep.fecha_examen
        FROM sst_examenes_persona sep
        WHERE sep.examen_id = seo.id
          AND sep.persona_id = v.persona_id
          AND COALESCE(sep.activo, TRUE) = TRUE
          AND (sep.vinculacion_id = v.id OR sep.vinculacion_id IS NULL)
        ORDER BY sep.fecha_examen DESC, sep.id DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE ${conditions.join(' AND ')}
      ORDER BY p.primer_apellido ASC NULLS LAST, p.primer_nombre ASC NULLS LAST, seo.nombre_examen ASC
    `,
    params
  );

  return result.rows.map((row) => ({
    examen_id: toBigintNumber(row.examen_id),
    nombre_examen: row.nombre_examen,
    tipo_examen: row.tipo_examen,
    persona_id: toBigintNumber(row.persona_id),
    persona_numero_documento: row.persona_numero_documento,
    persona_nombre: row.persona_nombre,
    vinculacion_id: toBigintNumber(row.vinculacion_id),
    registro_id: toNullableBigintNumber(row.registro_id),
    fecha_vencimiento: toDateIsoString(row.fecha_vencimiento),
    concepto_medico: row.concepto_medico
  }));
};

const calculateDaysRemaining = (fechaVencimiento: string | null): number | null => {
  if (!fechaVencimiento) {
    return null;
  }

  const target = new Date(`${fechaVencimiento}T00:00:00.000Z`);
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.floor((target.getTime() - utcToday.getTime()) / 86400000);
};

export const listSstCapacitaciones = async (
  filters: ListSstCapacitacionesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstCapacitaciones> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstCapacitacionesWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_capacitaciones sc
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstCapacitacionRow>(
    `
      ${getSstCapacitacionSelect()}
      ${whereClause}
      ORDER BY sc.nombre_capacitacion ASC, sc.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstCapacitacion),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstCapacitacion = async (
  input: CreateSstCapacitacionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureEmpresaExists(input.empresa_id, client);

    if (input.contrato_id) {
      await ensureContratoExists(input.contrato_id, client);
    }

    await validateCapacitacionScope({
      client,
      empresa_id: input.empresa_id,
      contrato_id: input.contrato_id,
      tenant
    });

    const result = await client.query<SstCapacitacionRow>(
      `
        INSERT INTO sst_capacitaciones (
          empresa_id,
          contrato_id,
          nombre_capacitacion,
          tema,
          categoria,
          obligatoria,
          vigencia_meses,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          NULL::text AS empresa_nombre,
          contrato_id::text AS contrato_id,
          NULL::text AS contrato_numero,
          nombre_capacitacion,
          tema,
          categoria,
          obligatoria,
          vigencia_meses,
          activo,
          created_at
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.nombre_capacitacion,
        input.tema,
        input.categoria,
        input.obligatoria,
        input.vigencia_meses,
        input.activo
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create SST training', 500, 'SST_CAPACITACION_CREATE_FAILED');
    }

    const createdFull = await ensureSstCapacitacionExists(created.id, client);
    const mapped = mapSstCapacitacion(createdFull);

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_CAPACITACION_CREATE',
      tabla: 'sst_capacitaciones',
      registro_id: String(mapped.id),
      descripcion: 'Creacion de capacitacion SST',
      after: mapped,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return mapped;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstCapacitacion = async (
  capacitacionId: string,
  input: UpdateSstCapacitacionInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacion> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstCapacitacionExists(capacitacionId, client);
    const current = mapSstCapacitacion(currentRow);

    if (input.empresa_id) {
      await ensureEmpresaExists(input.empresa_id, client);
    }

    if (input.contrato_id) {
      await ensureContratoExists(input.contrato_id, client);
    }

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);

    await validateCapacitacionScope({
      client,
      empresa_id: nextEmpresaId,
      contrato_id: nextContratoId,
      tenant
    });

    await client.query(
      `
        UPDATE sst_capacitaciones
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          nombre_capacitacion = $4,
          tema = $5,
          categoria = $6,
          obligatoria = $7,
          vigencia_meses = $8,
          activo = $9
        WHERE id::text = $1
      `,
      [
        capacitacionId,
        nextEmpresaId,
        nextContratoId,
        input.nombre_capacitacion ?? current.nombre_capacitacion,
        input.tema !== undefined ? input.tema : current.tema,
        input.categoria ?? current.categoria,
        input.obligatoria ?? current.obligatoria,
        input.vigencia_meses !== undefined ? input.vigencia_meses : current.vigencia_meses,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstCapacitacion(await ensureSstCapacitacionExists(capacitacionId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_CAPACITACION_UPDATE',
      tabla: 'sst_capacitaciones',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de capacitacion SST',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstCapacitacion = async (
  capacitacionId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacion> => {
  return updateSstCapacitacion(
    capacitacionId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_CAPACITACION_DEACTIVATE',
      tabla: 'sst_capacitaciones',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de capacitacion SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const listSstCapacitacionesPersona = async (
  filters: ListSstCapacitacionesPersonaQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstCapacitacionesPersona> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstCapacitacionesPersonaWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_capacitaciones_persona scp
      INNER JOIN sst_capacitaciones sc ON sc.id = scp.capacitacion_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstCapacitacionPersonaRow>(
    `
      ${getSstCapacitacionPersonaSelect()}
      ${whereClause}
      ORDER BY scp.fecha_capacitacion DESC, scp.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstCapacitacionPersona),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listSstCapacitacionesPersonaByPersonaId = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<SstCapacitacionPersona[]> => {
  const result = await listSstCapacitacionesPersona(
    {
      persona_id: personaId,
      page: 1,
      limit: 1000
    },
    tenant
  );

  return result.items;
};

export const createSstCapacitacionPersona = async (
  input: CreateSstCapacitacionPersonaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacionPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validateCapacitacionPersonaRelations({
      client,
      capacitacionId: input.capacitacion_id,
      personaId: input.persona_id,
      vinculacionId: input.vinculacion_id,
      documentoPersonaId: input.documento_persona_id,
      tenant
    });

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_capacitaciones_persona (
          capacitacion_id,
          persona_id,
          vinculacion_id,
          fecha_capacitacion,
          fecha_vencimiento,
          aprobado,
          calificacion,
          documento_persona_id,
          observacion,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4,
          $5,
          $6,
          $7,
          $8::bigint,
          $9,
          $10
        )
        RETURNING id::text AS id
      `,
      [
        input.capacitacion_id,
        input.persona_id,
        input.vinculacion_id,
        input.fecha_capacitacion,
        input.fecha_vencimiento,
        input.aprobado,
        input.calificacion,
        input.documento_persona_id,
        input.observacion,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError(
        'Failed to create SST person training',
        500,
        'SST_CAPACITACION_PERSONA_CREATE_FAILED'
      );
    }

    const created = mapSstCapacitacionPersona(await ensureSstCapacitacionPersonaExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_CAPACITACION_PERSONA_CREATE',
      tabla: 'sst_capacitaciones_persona',
      registro_id: String(created.id),
      descripcion: 'Creacion de capacitacion SST para persona',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstCapacitacionPersona = async (
  recordId: string,
  input: UpdateSstCapacitacionPersonaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacionPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstCapacitacionPersonaExists(recordId, client);
    const current = mapSstCapacitacionPersona(currentRow);

    const nextCapacitacionId = input.capacitacion_id ?? String(current.capacitacion.id);
    const nextPersonaId = input.persona_id ?? String(current.persona.id);
    const nextVinculacionId =
      input.vinculacion_id !== undefined
        ? input.vinculacion_id
        : current.vinculacion?.id === undefined || current.vinculacion?.id === null
          ? null
          : String(current.vinculacion.id);
    const nextDocumentoPersonaId =
      input.documento_persona_id !== undefined
        ? input.documento_persona_id
        : current.documento_persona?.id === undefined || current.documento_persona?.id === null
          ? null
          : String(current.documento_persona.id);

    await validateCapacitacionPersonaRelations({
      client,
      capacitacionId: nextCapacitacionId,
      personaId: nextPersonaId,
      vinculacionId: nextVinculacionId,
      documentoPersonaId: nextDocumentoPersonaId,
      tenant
    });

    const nextFechaCapacitacion = input.fecha_capacitacion ?? current.fecha_capacitacion;
    const nextFechaVencimiento =
      input.fecha_vencimiento !== undefined ? input.fecha_vencimiento : current.fecha_vencimiento;

    if (nextFechaVencimiento && nextFechaCapacitacion > nextFechaVencimiento) {
      throw new AppError(
        'fecha_vencimiento must be greater than or equal to fecha_capacitacion',
        400,
        'SST_CAPACITACION_PERSONA_INVALID_RANGE'
      );
    }

    await client.query(
      `
        UPDATE sst_capacitaciones_persona
        SET
          capacitacion_id = $2::bigint,
          persona_id = $3::bigint,
          vinculacion_id = $4::bigint,
          fecha_capacitacion = $5,
          fecha_vencimiento = $6,
          aprobado = $7,
          calificacion = $8,
          documento_persona_id = $9::bigint,
          observacion = $10,
          activo = $11
        WHERE id::text = $1
      `,
      [
        recordId,
        nextCapacitacionId,
        nextPersonaId,
        nextVinculacionId,
        nextFechaCapacitacion,
        nextFechaVencimiento,
        input.aprobado ?? current.aprobado,
        input.calificacion !== undefined ? input.calificacion : current.calificacion,
        nextDocumentoPersonaId,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstCapacitacionPersona(await ensureSstCapacitacionPersonaExists(recordId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_CAPACITACION_PERSONA_UPDATE',
      tabla: 'sst_capacitaciones_persona',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de capacitacion SST para persona',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstCapacitacionPersona = async (
  recordId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacionPersona> => {
  return updateSstCapacitacionPersona(
    recordId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_CAPACITACION_PERSONA_DEACTIVATE',
      tabla: 'sst_capacitaciones_persona',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de capacitacion SST para persona',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const getSstCapacitacionesDashboard = async (
  filters: ListSstDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstCapacitacionesDashboard> => {
  ensureFilterWithinTenant(tenant, filters);
  const [capacitaciones, registros, obligaciones] = await Promise.all([
    listSstCapacitaciones(
      {
        page: 1,
        limit: 1000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstCapacitacionesPersona(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstObligaciones(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id
      },
      tenant
    )
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const threshold = new Date();
  threshold.setUTCDate(threshold.getUTCDate() + 30);
  const thresholdDate = threshold.toISOString().slice(0, 10);

  const dashboard: SstCapacitacionesDashboard = {
    capacitaciones_total: capacitaciones.pagination.total,
    capacitaciones_obligatorias: capacitaciones.items.filter((item) => item.obligatoria).length,
    personas_capacitadas: new Set(registros.items.map((item) => item.persona.id)).size,
    capacitaciones_vigentes: registros.items.filter((item) => item.estado_capacitacion === 'vigente').length,
    capacitaciones_vencidas: registros.items.filter((item) => item.estado_capacitacion === 'vencida').length,
    capacitaciones_sin_vencimiento: registros.items.filter((item) => item.estado_capacitacion === 'sin_vencimiento').length,
    proximas_a_vencer_30_dias: registros.items.filter((item) => {
      const venc = item.fecha_vencimiento;
      return Boolean(venc && venc >= today && venc <= thresholdDate);
    }).length,
    cumplimiento_porcentaje: (() => {
      const totalObligaciones = obligaciones.length;

      if (totalObligaciones === 0) {
        return 100;
      }

      const cumplidas = obligaciones.filter((item) => {
        if (item.registro_id === null) {
          return false;
        }

        if (!item.fecha_vencimiento) {
          return true;
        }

        return item.fecha_vencimiento >= today;
      }).length;

      return Math.round((cumplidas / totalObligaciones) * 10000) / 100;
    })()
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_DASHBOARD_VIEW',
    tabla: 'sst_capacitaciones',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de capacitaciones',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getSstAlertas = async (
  filters: ListSstAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstCapacitacionAlertas> => {
  ensureFilterWithinTenant(tenant, filters);
  const [registros, obligaciones] = await Promise.all([
    listSstCapacitacionesPersona(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id,
        activo: true
      },
      tenant
    ),
    listSstObligaciones(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id
      },
      tenant
    )
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const threshold = new Date();
  threshold.setUTCDate(threshold.getUTCDate() + 30);
  const thresholdDate = threshold.toISOString().slice(0, 10);
  const items: SstCapacitacionAlerta[] = [];

  for (const item of registros.items) {
    if (item.estado_capacitacion === 'vencida') {
      items.push({
        id: `VENCIDA:${item.id}`,
        tipo_alerta: 'CAPACITACION_VENCIDA',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_vencimiento ?? item.fecha_capacitacion,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_restantes: calculateDaysRemaining(item.fecha_vencimiento),
        titulo: `Capacitacion vencida: ${item.capacitacion.nombre_capacitacion}`,
        descripcion: `La capacitacion de ${item.persona.nombre_completo} se encuentra vencida.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        capacitacion: {
          id: item.capacitacion.id,
          nombre_capacitacion: item.capacitacion.nombre_capacitacion,
          categoria: item.capacitacion.categoria
        }
      });
    } else if (item.fecha_vencimiento && item.fecha_vencimiento >= today && item.fecha_vencimiento <= thresholdDate) {
      items.push({
        id: `PROXIMA:${item.id}`,
        tipo_alerta: 'CAPACITACION_PROXIMA_A_VENCER',
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_restantes: calculateDaysRemaining(item.fecha_vencimiento),
        titulo: `Capacitacion proxima a vencer: ${item.capacitacion.nombre_capacitacion}`,
        descripcion: `La capacitacion de ${item.persona.nombre_completo} vence en menos de 30 dias.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        capacitacion: {
          id: item.capacitacion.id,
          nombre_capacitacion: item.capacitacion.nombre_capacitacion,
          categoria: item.capacitacion.categoria
        }
      });
    }
  }

  for (const item of obligaciones) {
    if (item.registro_id !== null) {
      continue;
    }

    items.push({
      id: `FALTANTE:${item.capacitacion_id}:${item.vinculacion_id}`,
      tipo_alerta: 'CAPACITACION_FALTANTE',
      severidad: 'CRITICA',
      estado: 'ACTIVA',
      fecha_alerta: today,
      fecha_vencimiento: null,
      dias_restantes: null,
      titulo: `Capacitacion faltante: ${item.nombre_capacitacion}`,
      descripcion: `No existe registro de capacitacion obligatoria para ${item.persona_nombre}.`,
      persona: {
        id: item.persona_id,
        numero_documento: item.persona_numero_documento
      },
      vinculacion: {
        id: item.vinculacion_id
      },
      capacitacion: {
        id: item.capacitacion_id,
        nombre_capacitacion: item.nombre_capacitacion,
        categoria: item.categoria
      }
    });
  }

  items.sort((left, right) => {
    const severityWeight = (value: SstCapacitacionAlerta['severidad']): number => {
      if (value === 'CRITICA') return 4;
      if (value === 'ALTA') return 3;
      if (value === 'MEDIA') return 2;
      return 1;
    };

    const diff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (diff !== 0) {
      return diff;
    }

    return right.fecha_alerta.localeCompare(left.fecha_alerta);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_ALERTAS_VIEW',
    tabla: 'sst_capacitaciones_persona',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}:${filters.persona_id ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de capacitaciones',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null,
      persona_id: filters.persona_id ?? null
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return {
    items: pagedItems,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: items.length,
      total_pages: items.length === 0 ? 0 : Math.ceil(items.length / filters.limit)
    }
  };
};

export const listSstDotacionEpp = async (
  filters: ListSstDotacionEppQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstDotacionEpp> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstDotacionEppWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_dotacion_epp sde
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstDotacionEppRow>(
    `
      ${getSstDotacionEppSelect()}
      ${whereClause}
      ORDER BY sde.created_at DESC, sde.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstDotacionEpp),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstDotacionEpp = async (
  input: CreateSstDotacionEppInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEpp> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureEmpresaExists(input.empresa_id, client);

    if (input.contrato_id) {
      await ensureContratoExists(input.contrato_id, client);
    }

    await validateDotacionEppScope({
      client,
      empresa_id: input.empresa_id,
      contrato_id: input.contrato_id,
      tenant
    });

    const result = await client.query<SstDotacionEppRow>(
      `
        INSERT INTO sst_dotacion_epp (
          empresa_id,
          contrato_id,
          nombre_item,
          tipo_item,
          descripcion,
          talla_requerida,
          requiere_reposicion,
          frecuencia_reposicion_dias,
          obligatorio,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          NULL::text AS empresa_nombre,
          contrato_id::text AS contrato_id,
          NULL::text AS contrato_numero,
          nombre_item,
          tipo_item,
          descripcion,
          talla_requerida,
          requiere_reposicion,
          frecuencia_reposicion_dias,
          obligatorio,
          activo,
          created_at
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.nombre_item,
        input.tipo_item,
        input.descripcion,
        input.talla_requerida,
        input.requiere_reposicion,
        input.frecuencia_reposicion_dias,
        input.obligatorio,
        input.activo
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create SST EPP item', 500, 'SST_DOTACION_EPP_CREATE_FAILED');
    }

    const mapped = mapSstDotacionEpp(await ensureSstDotacionEppExists(created.id, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_DOTACION_EPP_CREATE',
      tabla: 'sst_dotacion_epp',
      registro_id: String(mapped.id),
      descripcion: 'Creacion de item SST de dotacion/EPP',
      after: mapped,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return mapped;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstDotacionEpp = async (
  itemId: string,
  input: UpdateSstDotacionEppInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEpp> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstDotacionEppExists(itemId, client);
    const current = mapSstDotacionEpp(currentRow);

    if (input.empresa_id) {
      await ensureEmpresaExists(input.empresa_id, client);
    }

    if (input.contrato_id) {
      await ensureContratoExists(input.contrato_id, client);
    }

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);

    await validateDotacionEppScope({
      client,
      empresa_id: nextEmpresaId,
      contrato_id: nextContratoId,
      tenant
    });

    await client.query(
      `
        UPDATE sst_dotacion_epp
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          nombre_item = $4,
          tipo_item = $5,
          descripcion = $6,
          talla_requerida = $7,
          requiere_reposicion = $8,
          frecuencia_reposicion_dias = $9,
          obligatorio = $10,
          activo = $11
        WHERE id::text = $1
      `,
      [
        itemId,
        nextEmpresaId,
        nextContratoId,
        input.nombre_item ?? current.nombre_item,
        input.tipo_item ?? current.tipo_item,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        input.talla_requerida ?? current.talla_requerida,
        input.requiere_reposicion ?? current.requiere_reposicion,
        input.frecuencia_reposicion_dias !== undefined
          ? input.frecuencia_reposicion_dias
          : current.frecuencia_reposicion_dias,
        input.obligatorio ?? current.obligatorio,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstDotacionEpp(await ensureSstDotacionEppExists(itemId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_DOTACION_EPP_UPDATE',
      tabla: 'sst_dotacion_epp',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de item SST de dotacion/EPP',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstDotacionEpp = async (
  itemId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEpp> => {
  return updateSstDotacionEpp(
    itemId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_DOTACION_EPP_DEACTIVATE',
      tabla: 'sst_dotacion_epp',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de item SST de dotacion/EPP',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const listSstDotacionEppEntregas = async (
  filters: ListSstDotacionEppEntregasQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstDotacionEppEntregas> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstDotacionEppEntregasWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_dotacion_epp_entregas sdee
      INNER JOIN sst_dotacion_epp sde ON sde.id = sdee.item_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstDotacionEppEntregaRow>(
    `
      ${getSstDotacionEppEntregaSelect()}
      ${whereClause}
      ORDER BY sdee.fecha_entrega DESC, sdee.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstDotacionEppEntrega),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listSstDotacionEppEntregasByPersonaId = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<SstDotacionEppEntrega[]> => {
  const result = await listSstDotacionEppEntregas(
    {
      persona_id: personaId,
      page: 1,
      limit: 1000
    },
    tenant
  );

  return result.items;
};

export const createSstDotacionEppEntrega = async (
  input: CreateSstDotacionEppEntregaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEppEntrega> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const { item } = await validateDotacionEppEntregaRelations({
      client,
      itemId: input.item_id,
      personaId: input.persona_id,
      vinculacionId: input.vinculacion_id,
      documentoPersonaId: input.documento_persona_id,
      tenant
    });

    const fechaProximaReposicion = hasOwn(input, 'fecha_proxima_reposicion')
      ? input.fecha_proxima_reposicion
      : resolveFechaProximaReposicion(item, input.fecha_entrega);

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_dotacion_epp_entregas (
          item_id,
          persona_id,
          vinculacion_id,
          fecha_entrega,
          cantidad,
          talla,
          estado_entrega,
          fecha_proxima_reposicion,
          documento_persona_id,
          recibido_por,
          observacion,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9::bigint,
          $10,
          $11,
          $12
        )
        RETURNING id::text AS id
      `,
      [
        input.item_id,
        input.persona_id,
        input.vinculacion_id,
        input.fecha_entrega,
        input.cantidad,
        input.talla,
        input.estado_entrega,
        fechaProximaReposicion,
        input.documento_persona_id,
        input.recibido_por,
        input.observacion,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST EPP delivery', 500, 'SST_DOTACION_EPP_ENTREGA_CREATE_FAILED');
    }

    const created = mapSstDotacionEppEntrega(await ensureSstDotacionEppEntregaExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_DOTACION_EPP_ENTREGA_CREATE',
      tabla: 'sst_dotacion_epp_entregas',
      registro_id: String(created.id),
      descripcion: 'Creacion de entrega SST de dotacion/EPP',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstDotacionEppEntrega = async (
  recordId: string,
  input: UpdateSstDotacionEppEntregaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEppEntrega> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstDotacionEppEntregaExists(recordId, client);
    const current = mapSstDotacionEppEntrega(currentRow);

    const nextItemId = input.item_id ?? currentRow.item_id;
    const nextPersonaId = input.persona_id ?? currentRow.persona_id;
    const nextVinculacionId = input.vinculacion_id !== undefined ? input.vinculacion_id : currentRow.vinculacion_id;
    const nextDocumentoPersonaId =
      input.documento_persona_id !== undefined ? input.documento_persona_id : currentRow.documento_id;
    const nextFechaEntrega = input.fecha_entrega ?? (toDateIsoString(currentRow.fecha_entrega) ?? current.fecha_entrega);

    const { item } = await validateDotacionEppEntregaRelations({
      client,
      itemId: nextItemId,
      personaId: nextPersonaId,
      vinculacionId: nextVinculacionId,
      documentoPersonaId: nextDocumentoPersonaId,
      tenant
    });

    const nextFechaProximaReposicion = hasOwn(input, 'fecha_proxima_reposicion')
      ? input.fecha_proxima_reposicion
      : input.item_id !== undefined || input.fecha_entrega !== undefined
        ? resolveFechaProximaReposicion(item, nextFechaEntrega)
        : current.fecha_proxima_reposicion;

    await client.query(
      `
        UPDATE sst_dotacion_epp_entregas
        SET
          item_id = $2::bigint,
          persona_id = $3::bigint,
          vinculacion_id = $4::bigint,
          fecha_entrega = $5,
          cantidad = $6,
          talla = $7,
          estado_entrega = $8,
          fecha_proxima_reposicion = $9,
          documento_persona_id = $10::bigint,
          recibido_por = $11,
          observacion = $12,
          activo = $13
        WHERE id::text = $1
      `,
      [
        recordId,
        nextItemId,
        nextPersonaId,
        nextVinculacionId,
        nextFechaEntrega,
        input.cantidad ?? current.cantidad,
        input.talla !== undefined ? input.talla : current.talla,
        input.estado_entrega ?? current.estado_entrega,
        nextFechaProximaReposicion,
        nextDocumentoPersonaId,
        input.recibido_por !== undefined ? input.recibido_por : current.recibido_por,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstDotacionEppEntrega(await ensureSstDotacionEppEntregaExists(recordId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_DOTACION_EPP_ENTREGA_UPDATE',
      tabla: 'sst_dotacion_epp_entregas',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de entrega SST de dotacion/EPP',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstDotacionEppEntrega = async (
  recordId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEppEntrega> => {
  const current = await ensureSstDotacionEppEntregaExists(recordId);
  ensureTenantScopeForEntity(
    tenant,
    current.item_contrato_id ? Number(current.item_contrato_id) : null,
    current.item_empresa_id ? Number(current.item_empresa_id) : null
  );

  return updateSstDotacionEppEntrega(
    recordId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_DOTACION_EPP_ENTREGA_DEACTIVATE',
      tabla: 'sst_dotacion_epp_entregas',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de entrega SST de dotacion/EPP',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const getSstDotacionEppDashboard = async (
  filters: ListSstDotacionEppDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDotacionEppDashboard> => {
  ensureFilterWithinTenant(tenant, filters);
  const [items, entregas, obligaciones] = await Promise.all([
    listSstDotacionEpp(
      {
        page: 1,
        limit: 1000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstDotacionEppEntregas(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstDotacionEppObligaciones(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id
      },
      tenant
    )
  ]);

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();

  const dashboard: SstDotacionEppDashboard = {
    items_total: items.pagination.total,
    items_obligatorios: items.items.filter((item) => item.obligatorio).length,
    entregas_total: entregas.pagination.total,
    personas_con_entrega: new Set(entregas.items.map((item) => item.persona.id)).size,
    entregas_vigentes: entregas.items.filter((item) => item.estado_reposicion !== 'vencida').length,
    entregas_vencidas: entregas.items.filter((item) => item.estado_reposicion === 'vencida').length,
    proximas_reposicion_30_dias: entregas.items.filter((item) => {
      const fecha = item.fecha_proxima_reposicion;
      return Boolean(fecha && fecha >= today && fecha <= thresholdDate);
    }).length,
    pendientes: entregas.items.filter((item) => item.estado_entrega === 'PENDIENTE').length,
    cumplimiento_porcentaje: (() => {
      const totalObligaciones = obligaciones.length;

      if (totalObligaciones === 0) {
        return 100;
      }

      const cumplidas = obligaciones.filter((item) => {
        if (item.registro_id === null) {
          return false;
        }

        if (item.estado_entrega === 'PENDIENTE' || item.estado_entrega === 'RECHAZADO' || item.estado_entrega === 'DEVUELTO') {
          return false;
        }

        if (!item.fecha_proxima_reposicion) {
          return true;
        }

        return item.fecha_proxima_reposicion >= today;
      }).length;

      return Math.round((cumplidas / totalObligaciones) * 10000) / 100;
    })()
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_DOTACION_EPP_DASHBOARD_VIEW',
    tabla: 'sst_dotacion_epp',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de dotacion/EPP',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getSstDotacionEppAlertas = async (
  filters: ListSstDotacionEppAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstDotacionEppAlertas> => {
  ensureFilterWithinTenant(tenant, filters);
  const [registros, obligaciones] = await Promise.all([
    listSstDotacionEppEntregas(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id,
        activo: true
      },
      tenant
    ),
    listSstDotacionEppObligaciones(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id
      },
      tenant
    )
  ]);

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();
  const items: SstDotacionEppAlerta[] = [];

  for (const item of registros.items) {
    if (item.estado_entrega === 'PENDIENTE' || item.estado_entrega === 'RECHAZADO') {
      continue;
    }

    const prefix = getDotacionEppAlertPrefix(item.item.tipo_item);

    if (item.estado_reposicion === 'vencida') {
      items.push({
        id: `${prefix}_REPOSICION_VENCIDA:${item.id}`,
        tipo_alerta: `${prefix}_REPOSICION_VENCIDA`,
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_proxima_reposicion ?? item.fecha_entrega,
        fecha_proxima_reposicion: item.fecha_proxima_reposicion,
        dias_restantes: calculateDaysRemaining(item.fecha_proxima_reposicion),
        titulo: `${item.item.nombre_item} con reposicion vencida`,
        descripcion: `La entrega de ${item.persona.nombre_completo} requiere reposicion vencida.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        item: {
          id: item.item.id,
          nombre_item: item.item.nombre_item,
          tipo_item: item.item.tipo_item
        }
      });
    } else if (
      item.fecha_proxima_reposicion &&
      item.fecha_proxima_reposicion >= today &&
      item.fecha_proxima_reposicion <= thresholdDate
    ) {
      items.push({
        id: `${prefix}_PROXIMA_REPOSICION:${item.id}`,
        tipo_alerta: `${prefix}_PROXIMA_REPOSICION`,
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_proxima_reposicion: item.fecha_proxima_reposicion,
        dias_restantes: calculateDaysRemaining(item.fecha_proxima_reposicion),
        titulo: `${item.item.nombre_item} proximo a reposicion`,
        descripcion: `La entrega de ${item.persona.nombre_completo} requiere reposicion en menos de 30 dias.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        item: {
          id: item.item.id,
          nombre_item: item.item.nombre_item,
          tipo_item: item.item.tipo_item
        }
      });
    }
  }

  for (const item of obligaciones) {
    if (item.registro_id !== null) {
      continue;
    }

    const prefix = getDotacionEppAlertPrefix(item.tipo_item);

    items.push({
      id: `${prefix}_FALTANTE:${item.item_id}:${item.vinculacion_id}`,
      tipo_alerta: `${prefix}_FALTANTE`,
      severidad: 'CRITICA',
      estado: 'ACTIVA',
      fecha_alerta: today,
      fecha_proxima_reposicion: null,
      dias_restantes: null,
      titulo: `${item.nombre_item} faltante`,
      descripcion: `No existe registro de entrega para ${item.persona_nombre}.`,
      persona: {
        id: item.persona_id,
        numero_documento: item.persona_numero_documento
      },
      vinculacion: {
        id: item.vinculacion_id
      },
      item: {
        id: item.item_id,
        nombre_item: item.nombre_item,
        tipo_item: item.tipo_item
      }
    });
  }

  items.sort((left, right) => {
    const severityWeight = (value: SstDotacionEppAlerta['severidad']): number => {
      if (value === 'CRITICA') return 4;
      if (value === 'ALTA') return 3;
      if (value === 'MEDIA') return 2;
      return 1;
    };

    const diff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (diff !== 0) {
      return diff;
    }

    return right.fecha_alerta.localeCompare(left.fecha_alerta);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_DOTACION_EPP_ALERTAS_VIEW',
    tabla: 'sst_dotacion_epp_entregas',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}:${filters.persona_id ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de dotacion/EPP',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null,
      persona_id: filters.persona_id ?? null
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return {
    items: pagedItems,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: items.length,
      total_pages: items.length === 0 ? 0 : Math.ceil(items.length / filters.limit)
    }
  };
};

export const listSstExamenesOcupacionales = async (
  filters: ListSstExamenesOcupacionalesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstExamenesOcupacionales> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstExamenesWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_examenes_ocupacionales seo
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstExamenOcupacionalRow>(
    `
      ${getSstExamenOcupacionalSelect()}
      ${whereClause}
      ORDER BY seo.created_at DESC, seo.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstExamenOcupacional),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const createSstExamenOcupacional = async (
  input: CreateSstExamenOcupacionalInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenOcupacional> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await ensureEmpresaExists(input.empresa_id, client);

    if (input.contrato_id) {
      await ensureContratoExists(input.contrato_id, client);
    }

    await validateExamenOcupacionalScope({
      client,
      empresa_id: input.empresa_id,
      contrato_id: input.contrato_id,
      tenant
    });

    const result = await client.query<SstExamenOcupacionalRow>(
      `
        INSERT INTO sst_examenes_ocupacionales (
          empresa_id,
          contrato_id,
          nombre_examen,
          tipo_examen,
          descripcion,
          obligatorio,
          vigencia_meses,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          NULL::text AS empresa_nombre,
          contrato_id::text AS contrato_id,
          NULL::text AS contrato_numero,
          nombre_examen,
          tipo_examen,
          descripcion,
          obligatorio,
          vigencia_meses,
          activo,
          created_at
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.nombre_examen,
        input.tipo_examen,
        input.descripcion,
        input.obligatorio,
        input.vigencia_meses,
        input.activo
      ]
    );

    const created = result.rows[0];

    if (!created) {
      throw new AppError('Failed to create SST occupational exam', 500, 'SST_EXAMEN_CREATE_FAILED');
    }

    const mapped = mapSstExamenOcupacional(await ensureSstExamenOcupacionalExists(created.id, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_EXAMEN_CREATE',
      tabla: 'sst_examenes_ocupacionales',
      registro_id: String(mapped.id),
      descripcion: 'Creacion de examen ocupacional SST',
      after: mapped,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return mapped;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstExamenOcupacional = async (
  examenId: string,
  input: UpdateSstExamenOcupacionalInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenOcupacional> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstExamenOcupacionalExists(examenId, client);
    const current = mapSstExamenOcupacional(currentRow);

    if (input.empresa_id) {
      await ensureEmpresaExists(input.empresa_id, client);
    }

    if (input.contrato_id) {
      await ensureContratoExists(input.contrato_id, client);
    }

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);

    await validateExamenOcupacionalScope({
      client,
      empresa_id: nextEmpresaId,
      contrato_id: nextContratoId,
      tenant
    });

    await client.query(
      `
        UPDATE sst_examenes_ocupacionales
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          nombre_examen = $4,
          tipo_examen = $5,
          descripcion = $6,
          obligatorio = $7,
          vigencia_meses = $8,
          activo = $9
        WHERE id::text = $1
      `,
      [
        examenId,
        nextEmpresaId,
        nextContratoId,
        input.nombre_examen ?? current.nombre_examen,
        input.tipo_examen ?? current.tipo_examen,
        input.descripcion !== undefined ? input.descripcion : current.descripcion,
        input.obligatorio ?? current.obligatorio,
        input.vigencia_meses !== undefined ? input.vigencia_meses : current.vigencia_meses,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstExamenOcupacional(await ensureSstExamenOcupacionalExists(examenId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_EXAMEN_UPDATE',
      tabla: 'sst_examenes_ocupacionales',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de examen ocupacional SST',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstExamenOcupacional = async (
  examenId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenOcupacional> => {
  return updateSstExamenOcupacional(
    examenId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_EXAMEN_DEACTIVATE',
      tabla: 'sst_examenes_ocupacionales',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de examen ocupacional SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const listSstExamenesPersona = async (
  filters: ListSstExamenesPersonaQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstExamenesPersona> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstExamenesPersonaWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_examenes_persona sep
      INNER JOIN sst_examenes_ocupacionales seo ON seo.id = sep.examen_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstExamenPersonaRow>(
    `
      ${getSstExamenPersonaSelect()}
      ${whereClause}
      ORDER BY sep.fecha_examen DESC, sep.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstExamenPersona),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listSstExamenesPersonaByPersonaId = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<SstExamenPersona[]> => {
  const result = await listSstExamenesPersona(
    {
      persona_id: personaId,
      page: 1,
      limit: 1000
    },
    tenant
  );

  return result.items;
};

export const createSstExamenPersona = async (
  input: CreateSstExamenPersonaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const { examen } = await validateExamenPersonaRelations({
      client,
      examenId: input.examen_id,
      personaId: input.persona_id,
      vinculacionId: input.vinculacion_id,
      documentoPersonaId: input.documento_persona_id,
      tenant
    });

    const fechaVencimiento = input.fecha_vencimiento !== undefined
      ? input.fecha_vencimiento
      : resolveFechaVencimientoExamen(examen, input.fecha_examen);

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_examenes_persona (
          examen_id,
          persona_id,
          vinculacion_id,
          fecha_examen,
          fecha_vencimiento,
          concepto_medico,
          restricciones,
          documento_persona_id,
          observacion,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4,
          $5,
          $6,
          $7,
          $8::bigint,
          $9,
          $10
        )
        RETURNING id::text AS id
      `,
      [
        input.examen_id,
        input.persona_id,
        input.vinculacion_id,
        input.fecha_examen,
        fechaVencimiento,
        input.concepto_medico,
        input.restricciones,
        input.documento_persona_id,
        input.observacion,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST person exam', 500, 'SST_EXAMEN_PERSONA_CREATE_FAILED');
    }

    const created = mapSstExamenPersona(await ensureSstExamenPersonaExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_EXAMEN_PERSONA_CREATE',
      tabla: 'sst_examenes_persona',
      registro_id: String(created.id),
      descripcion: 'Creacion de examen ocupacional SST para persona',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstExamenPersona = async (
  recordId: string,
  input: UpdateSstExamenPersonaInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenPersona> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstExamenPersonaExists(recordId, client);
    const current = mapSstExamenPersona(currentRow);

    const nextExamenId = input.examen_id ?? currentRow.examen_id;
    const nextPersonaId = input.persona_id ?? currentRow.persona_id;
    const nextVinculacionId = input.vinculacion_id !== undefined ? input.vinculacion_id : currentRow.vinculacion_id;
    const nextDocumentoPersonaId =
      input.documento_persona_id !== undefined ? input.documento_persona_id : currentRow.documento_id;
    const nextFechaExamen = input.fecha_examen ?? (toDateIsoString(currentRow.fecha_examen) ?? current.fecha_examen);

    const { examen } = await validateExamenPersonaRelations({
      client,
      examenId: nextExamenId,
      personaId: nextPersonaId,
      vinculacionId: nextVinculacionId,
      documentoPersonaId: nextDocumentoPersonaId,
      tenant
    });

    const nextFechaVencimiento = input.fecha_vencimiento !== undefined
      ? input.fecha_vencimiento
      : input.examen_id !== undefined || input.fecha_examen !== undefined
        ? resolveFechaVencimientoExamen(examen, nextFechaExamen)
        : current.fecha_vencimiento;

    if (nextFechaVencimiento && nextFechaExamen > nextFechaVencimiento) {
      throw new AppError(
        'fecha_vencimiento must be greater than or equal to fecha_examen',
        400,
        'SST_EXAMEN_PERSONA_INVALID_DATE_RANGE'
      );
    }

    await client.query(
      `
        UPDATE sst_examenes_persona
        SET
          examen_id = $2::bigint,
          persona_id = $3::bigint,
          vinculacion_id = $4::bigint,
          fecha_examen = $5,
          fecha_vencimiento = $6,
          concepto_medico = $7,
          restricciones = $8,
          documento_persona_id = $9::bigint,
          observacion = $10,
          activo = $11
        WHERE id::text = $1
      `,
      [
        recordId,
        nextExamenId,
        nextPersonaId,
        nextVinculacionId,
        nextFechaExamen,
        nextFechaVencimiento,
        input.concepto_medico ?? current.concepto_medico,
        input.restricciones !== undefined ? input.restricciones : current.restricciones,
        nextDocumentoPersonaId,
        input.observacion !== undefined ? input.observacion : current.observacion,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstExamenPersona(await ensureSstExamenPersonaExists(recordId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_EXAMEN_PERSONA_UPDATE',
      tabla: 'sst_examenes_persona',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de examen ocupacional SST para persona',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstExamenPersona = async (
  recordId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenPersona> => {
  return updateSstExamenPersona(
    recordId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_EXAMEN_PERSONA_DEACTIVATE',
      tabla: 'sst_examenes_persona',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de examen ocupacional SST para persona',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const getSstExamenesDashboard = async (
  filters: ListSstExamenesDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstExamenesDashboard> => {
  ensureFilterWithinTenant(tenant, filters);
  const [examenes, registros, obligaciones] = await Promise.all([
    listSstExamenesOcupacionales(
      {
        page: 1,
        limit: 1000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstExamenesPersona(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstExamenObligaciones(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id
      },
      tenant
    )
  ]);

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();

  const dashboard: SstExamenesDashboard = {
    examenes_total: examenes.pagination.total,
    examenes_obligatorios: examenes.items.filter((item) => item.obligatorio).length,
    registros_total: registros.pagination.total,
    personas_con_examen: new Set(registros.items.map((item) => item.persona.id)).size,
    examenes_vigentes: registros.items.filter((item) => Boolean(item.fecha_vencimiento && item.fecha_vencimiento >= today)).length,
    examenes_vencidos: registros.items.filter((item) => item.estado_examen === 'vencido').length,
    examenes_sin_vencimiento: registros.items.filter((item) => item.estado_examen === 'sin_vencimiento').length,
    proximos_a_vencer_30_dias: registros.items.filter((item) => {
      const venc = item.fecha_vencimiento;
      return Boolean(venc && venc >= today && venc <= thresholdDate);
    }).length,
    aptos: registros.items.filter((item) => item.concepto_medico === 'APTO').length,
    aptos_con_restricciones: registros.items.filter((item) => item.concepto_medico === 'APTO_CON_RESTRICCIONES').length,
    no_aptos: registros.items.filter((item) => item.concepto_medico === 'NO_APTO').length,
    pendientes: registros.items.filter((item) => item.concepto_medico === 'PENDIENTE').length,
    cumplimiento_porcentaje: (() => {
      const totalObligaciones = obligaciones.length;

      if (totalObligaciones === 0) {
        return 100;
      }

      const cumplidas = obligaciones.filter((item) => {
        if (item.registro_id === null) {
          return false;
        }

        if (item.concepto_medico === 'PENDIENTE') {
          return false;
        }

        if (!item.fecha_vencimiento) {
          return true;
        }

        return item.fecha_vencimiento >= today;
      }).length;

      return Math.round((cumplidas / totalObligaciones) * 10000) / 100;
    })()
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_EXAMEN_DASHBOARD_VIEW',
    tabla: 'sst_examenes_ocupacionales',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de examenes ocupacionales',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getSstExamenesAlertas = async (
  filters: ListSstExamenesAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstExamenAlertas> => {
  ensureFilterWithinTenant(tenant, filters);
  const [registros, obligaciones] = await Promise.all([
    listSstExamenesPersona(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id,
        activo: true
      },
      tenant
    ),
    listSstExamenObligaciones(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id
      },
      tenant
    )
  ]);

  const today = getTodayDateOnly();
  const thresholdDate = getDateAfter30Days();
  const items: SstExamenAlerta[] = [];

  for (const item of registros.items) {
    if (item.estado_examen === 'vencido') {
      items.push({
        id: `VENCIDO:${item.id}`,
        tipo_alerta: 'EXAMEN_OCUPACIONAL_VENCIDO',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_vencimiento ?? item.fecha_examen,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_restantes: calculateDaysRemaining(item.fecha_vencimiento),
        titulo: `Examen vencido: ${item.examen.nombre_examen}`,
        descripcion: `El examen ocupacional de ${item.persona.nombre_completo} se encuentra vencido.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        examen: {
          id: item.examen.id,
          nombre_examen: item.examen.nombre_examen,
          tipo_examen: item.examen.tipo_examen
        }
      });
    } else if (item.fecha_vencimiento && item.fecha_vencimiento >= today && item.fecha_vencimiento <= thresholdDate) {
      items.push({
        id: `PROXIMO:${item.id}`,
        tipo_alerta: 'EXAMEN_OCUPACIONAL_PROXIMO_A_VENCER',
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_restantes: calculateDaysRemaining(item.fecha_vencimiento),
        titulo: `Examen proximo a vencer: ${item.examen.nombre_examen}`,
        descripcion: `El examen ocupacional de ${item.persona.nombre_completo} vence en menos de 30 dias.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        examen: {
          id: item.examen.id,
          nombre_examen: item.examen.nombre_examen,
          tipo_examen: item.examen.tipo_examen
        }
      });
    }

    if (item.concepto_medico === 'NO_APTO') {
      items.push({
        id: `NO_APTO:${item.id}`,
        tipo_alerta: 'EXAMEN_OCUPACIONAL_NO_APTO',
        severidad: 'CRITICA',
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_examen,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_restantes: calculateDaysRemaining(item.fecha_vencimiento),
        titulo: `Concepto no apto: ${item.examen.nombre_examen}`,
        descripcion: `El examen ocupacional de ${item.persona.nombre_completo} tiene concepto NO APTO.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        examen: {
          id: item.examen.id,
          nombre_examen: item.examen.nombre_examen,
          tipo_examen: item.examen.tipo_examen
        }
      });
    } else if (item.concepto_medico === 'APTO_CON_RESTRICCIONES' || Boolean(item.restricciones)) {
      items.push({
        id: `RESTRICCIONES:${item.id}`,
        tipo_alerta: 'EXAMEN_OCUPACIONAL_RESTRICCIONES',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_examen,
        fecha_vencimiento: item.fecha_vencimiento,
        dias_restantes: calculateDaysRemaining(item.fecha_vencimiento),
        titulo: `Examen con restricciones: ${item.examen.nombre_examen}`,
        descripcion: `El examen ocupacional de ${item.persona.nombre_completo} tiene restricciones registradas.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        examen: {
          id: item.examen.id,
          nombre_examen: item.examen.nombre_examen,
          tipo_examen: item.examen.tipo_examen
        }
      });
    }
  }

  for (const item of obligaciones) {
    if (item.registro_id !== null) {
      continue;
    }

    items.push({
      id: `FALTANTE:${item.examen_id}:${item.vinculacion_id}`,
      tipo_alerta: 'EXAMEN_OCUPACIONAL_FALTANTE',
      severidad: 'CRITICA',
      estado: 'ACTIVA',
      fecha_alerta: today,
      fecha_vencimiento: null,
      dias_restantes: null,
      titulo: `Examen faltante: ${item.nombre_examen}`,
      descripcion: `No existe registro de examen ocupacional para ${item.persona_nombre}.`,
      persona: {
        id: item.persona_id,
        numero_documento: item.persona_numero_documento
      },
      vinculacion: {
        id: item.vinculacion_id
      },
      examen: {
        id: item.examen_id,
        nombre_examen: item.nombre_examen,
        tipo_examen: item.tipo_examen
      }
    });
  }

  items.sort((left, right) => {
    const severityWeight = (value: SstExamenAlerta['severidad']): number => {
      if (value === 'CRITICA') return 4;
      if (value === 'ALTA') return 3;
      if (value === 'MEDIA') return 2;
      return 1;
    };

    const diff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (diff !== 0) {
      return diff;
    }

    return right.fecha_alerta.localeCompare(left.fecha_alerta);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_EXAMEN_ALERTAS_VIEW',
    tabla: 'sst_examenes_persona',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}:${filters.persona_id ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de examenes ocupacionales',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null,
      persona_id: filters.persona_id ?? null
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return {
    items: pagedItems,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: items.length,
      total_pages: items.length === 0 ? 0 : Math.ceil(items.length / filters.limit)
    }
  };
};

const listSstAccionesAccidenteByScope = async (
  filters: {
    empresa_id?: string | null;
    contrato_id?: string | null;
    persona_id?: string | null;
    activo?: boolean;
  },
  tenant?: TenantAccessContext
): Promise<SstAccionAccidente[]> => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  appendTenantScopeConditions(conditions, params, tenant, 'sai.contrato_id', 'sai.empresa_id');

  if (filters.empresa_id) {
    params.push(filters.empresa_id);
    conditions.push(`sai.empresa_id::text = $${params.length}`);
  }

  if (filters.contrato_id) {
    params.push(filters.contrato_id);
    conditions.push(`sai.contrato_id::text = $${params.length}`);
  }

  if (filters.persona_id) {
    params.push(filters.persona_id);
    conditions.push(`sai.persona_id::text = $${params.length}`);
  }

  if (filters.activo !== undefined) {
    params.push(filters.activo);
    conditions.push(`COALESCE(saa.activo, TRUE) = $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await dbQuery<SstAccionAccidenteRow>(
    `
      ${getSstAccionAccidenteSelect()}
      ${whereClause}
      ORDER BY saa.fecha_compromiso ASC NULLS LAST, saa.id DESC
    `,
    params
  );

  return result.rows.map(mapSstAccionAccidente);
};

export const listSstAccidentes = async (
  filters: ListSstAccidentesQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstAccidentes> => {
  ensureFilterWithinTenant(tenant, {
    contrato_id: filters.contrato_id,
    empresa_id: filters.empresa_id
  });
  const { params, whereClause } = buildSstAccidentesWhere(filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_accidentes_incidentes sai
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstAccidenteRow>(
    `
      ${getSstAccidenteSelect()}
      ${whereClause}
      ORDER BY sai.fecha_evento DESC, sai.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstAccidente),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listSstAccidentesByPersonaId = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<SstAccidente[]> => {
  const result = await listSstAccidentes(
    {
      persona_id: personaId,
      page: 1,
      limit: 1000
    },
    tenant
  );

  return result.items;
};

export const createSstAccidente = async (
  input: CreateSstAccidenteInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccidente> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await validateAccidenteRelations({
      client,
      empresaId: input.empresa_id,
      contratoId: input.contrato_id,
      personaId: input.persona_id,
      vinculacionId: input.vinculacion_id,
      tenant
    });

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_accidentes_incidentes (
          empresa_id,
          contrato_id,
          persona_id,
          vinculacion_id,
          tipo_evento,
          fecha_evento,
          hora_evento,
          lugar_evento,
          descripcion,
          lesionado,
          tipo_lesion,
          parte_cuerpo,
          dias_incapacidad,
          requiere_investigacion,
          severidad,
          estado,
          activo
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5,
          $6,
          $7::time,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17
        )
        RETURNING id::text AS id
      `,
      [
        input.empresa_id,
        input.contrato_id,
        input.persona_id,
        input.vinculacion_id,
        input.tipo_evento,
        input.fecha_evento,
        input.hora_evento,
        input.lugar_evento,
        input.descripcion,
        input.lesionado,
        input.tipo_lesion,
        input.parte_cuerpo,
        input.dias_incapacidad ?? 0,
        input.requiere_investigacion,
        input.severidad,
        input.estado,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST accident', 500, 'SST_ACCIDENTE_CREATE_FAILED');
    }

    const created = mapSstAccidente(await ensureSstAccidenteExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_ACCIDENTE_CREATE',
      tabla: 'sst_accidentes_incidentes',
      registro_id: String(created.id),
      descripcion: 'Creacion de accidente o incidente SST',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstAccidente = async (
  recordId: string,
  input: UpdateSstAccidenteInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccidente> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstAccidenteExists(recordId, client);
    const current = mapSstAccidente(currentRow);

    const nextEmpresaId = input.empresa_id ?? String(current.empresa.id);
    const nextContratoId =
      input.contrato_id !== undefined ? input.contrato_id : current.contrato.id === null ? null : String(current.contrato.id);
    const nextPersonaId = input.persona_id ?? String(current.persona.id);
    const nextVinculacionId =
      input.vinculacion_id !== undefined ? input.vinculacion_id : current.vinculacion?.id ? String(current.vinculacion.id) : null;

    await validateAccidenteRelations({
      client,
      empresaId: nextEmpresaId,
      contratoId: nextContratoId,
      personaId: nextPersonaId,
      vinculacionId: nextVinculacionId,
      tenant
    });

    await client.query(
      `
        UPDATE sst_accidentes_incidentes
        SET
          empresa_id = $2::bigint,
          contrato_id = $3::bigint,
          persona_id = $4::bigint,
          vinculacion_id = $5::bigint,
          tipo_evento = $6,
          fecha_evento = $7,
          hora_evento = $8::time,
          lugar_evento = $9,
          descripcion = $10,
          lesionado = $11,
          tipo_lesion = $12,
          parte_cuerpo = $13,
          dias_incapacidad = $14,
          requiere_investigacion = $15,
          severidad = $16,
          estado = $17,
          activo = $18
        WHERE id::text = $1
      `,
      [
        recordId,
        nextEmpresaId,
        nextContratoId,
        nextPersonaId,
        nextVinculacionId,
        input.tipo_evento ?? current.tipo_evento,
        input.fecha_evento ?? current.fecha_evento,
        input.hora_evento !== undefined ? input.hora_evento : current.hora_evento,
        input.lugar_evento !== undefined ? input.lugar_evento : current.lugar_evento,
        input.descripcion ?? current.descripcion,
        input.lesionado ?? current.lesionado,
        input.tipo_lesion !== undefined ? input.tipo_lesion : current.tipo_lesion,
        input.parte_cuerpo !== undefined ? input.parte_cuerpo : current.parte_cuerpo,
        input.dias_incapacidad !== undefined ? input.dias_incapacidad : current.dias_incapacidad,
        input.requiere_investigacion ?? current.requiere_investigacion,
        input.severidad ?? current.severidad,
        input.estado ?? current.estado,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstAccidente(await ensureSstAccidenteExists(recordId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_ACCIDENTE_UPDATE',
      tabla: 'sst_accidentes_incidentes',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de accidente o incidente SST',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstAccidente = async (
  recordId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccidente> => {
  return updateSstAccidente(
    recordId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_ACCIDENTE_DEACTIVATE',
      tabla: 'sst_accidentes_incidentes',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de accidente o incidente SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const listSstAccionesAccidente = async (
  accidenteId: string,
  filters: ListSstAccionesAccidenteQuery,
  tenant?: TenantAccessContext
): Promise<PaginatedSstAccionesAccidente> => {
  const accidente = await ensureSstAccidenteExists(accidenteId);
  ensureTenantScopeForEntity(
    tenant,
    accidente.contrato_id ? Number(accidente.contrato_id) : null,
    accidente.empresa_id ? Number(accidente.empresa_id) : null
  );

  const { params, whereClause } = buildSstAccionesAccidenteWhere(accidenteId, filters, tenant);
  const countResult = await dbQuery<CountRow>(
    `
      SELECT COUNT(*)::int AS total
      FROM sst_accidentes_acciones saa
      INNER JOIN sst_accidentes_incidentes sai ON sai.id = saa.accidente_id
      ${whereClause}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = (filters.page - 1) * filters.limit;
  const listParams = [...params, filters.limit, offset];
  const result = await dbQuery<SstAccionAccidenteRow>(
    `
      ${getSstAccionAccidenteSelect()}
      ${whereClause}
      ORDER BY saa.fecha_compromiso ASC NULLS LAST, saa.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapSstAccionAccidente),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / filters.limit)
    }
  };
};

export const listSstAccionesAccidenteByPersonaId = async (
  personaId: string,
  tenant?: TenantAccessContext
): Promise<SstAccionAccidente[]> => {
  return listSstAccionesAccidenteByScope(
    {
      persona_id: personaId,
      activo: true
    },
    tenant
  );
};

export const createSstAccionAccidente = async (
  accidenteId: string,
  input: CreateSstAccionAccidenteInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionAccidente> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const accidente = await ensureSstAccidenteExists(accidenteId, client);
    ensureTenantScopeForEntity(
      tenant,
      accidente.contrato_id ? Number(accidente.contrato_id) : null,
      accidente.empresa_id ? Number(accidente.empresa_id) : null
    );

    const result = await client.query<{ id: string }>(
      `
        INSERT INTO sst_accidentes_acciones (
          accidente_id,
          descripcion,
          responsable,
          fecha_compromiso,
          fecha_cierre,
          estado,
          activo
        )
        VALUES (
          $1::bigint,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7
        )
        RETURNING id::text AS id
      `,
      [
        accidenteId,
        input.descripcion,
        input.responsable,
        input.fecha_compromiso,
        input.fecha_cierre,
        input.estado,
        input.activo
      ]
    );

    const createdId = result.rows[0]?.id;

    if (!createdId) {
      throw new AppError('Failed to create SST corrective action', 500, 'SST_ACCION_CREATE_FAILED');
    }

    const created = mapSstAccionAccidente(await ensureSstAccionAccidenteExists(createdId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_ACCION_CREATE',
      tabla: 'sst_accidentes_acciones',
      registro_id: String(created.id),
      descripcion: 'Creacion de accion correctiva SST',
      after: created,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return created;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const updateSstAccionAccidente = async (
  recordId: string,
  input: UpdateSstAccionAccidenteInput,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionAccidente> => {
  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const currentRow = await ensureSstAccionAccidenteExists(recordId, client);
    const current = mapSstAccionAccidente(currentRow);

    ensureTenantScopeForEntity(
      tenant,
      currentRow.accidente_contrato_id ? Number(currentRow.accidente_contrato_id) : null,
      currentRow.accidente_empresa_id ? Number(currentRow.accidente_empresa_id) : null
    );

    const nextFechaCompromiso =
      input.fecha_compromiso !== undefined ? input.fecha_compromiso : current.fecha_compromiso;
    const nextFechaCierre = input.fecha_cierre !== undefined ? input.fecha_cierre : current.fecha_cierre;

    if (nextFechaCompromiso && nextFechaCierre && nextFechaCompromiso > nextFechaCierre) {
      throw new AppError(
        'fecha_cierre must be greater than or equal to fecha_compromiso',
        400,
        'SST_ACCION_INVALID_DATE_RANGE'
      );
    }

    await client.query(
      `
        UPDATE sst_accidentes_acciones
        SET
          descripcion = $2,
          responsable = $3,
          fecha_compromiso = $4,
          fecha_cierre = $5,
          estado = $6,
          activo = $7
        WHERE id::text = $1
      `,
      [
        recordId,
        input.descripcion ?? current.descripcion,
        input.responsable !== undefined ? input.responsable : current.responsable,
        nextFechaCompromiso,
        nextFechaCierre,
        input.estado ?? current.estado,
        input.activo ?? current.activo
      ]
    );

    const updated = mapSstAccionAccidente(await ensureSstAccionAccidenteExists(recordId, client));

    await registerAuditEntry({
      client,
      usuario_id: actorUserId,
      accion: 'SST_ACCION_UPDATE',
      tabla: 'sst_accidentes_acciones',
      registro_id: String(updated.id),
      descripcion: 'Actualizacion de accion correctiva SST',
      before: current,
      after: updated,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    });

    await client.query('COMMIT');
    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const deactivateSstAccionAccidente = async (
  recordId: string,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccionAccidente> => {
  return updateSstAccionAccidente(
    recordId,
    { activo: false },
    actorUserId,
    tenant,
    auditMeta
  ).then(async (result) => {
    await registerAuditEntry({
      usuario_id: actorUserId,
      accion: 'SST_ACCION_DEACTIVATE',
      tabla: 'sst_accidentes_acciones',
      registro_id: String(result.id),
      descripcion: 'Desactivacion de accion correctiva SST',
      after: result,
      ip: auditMeta?.ip ?? null,
      user_agent: auditMeta?.user_agent ?? null
    }).catch(() => undefined);

    return result;
  });
};

export const getSstAccidentesDashboard = async (
  filters: ListSstAccidentesDashboardQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstAccidentesDashboard> => {
  ensureFilterWithinTenant(tenant, filters);
  const [accidentes, acciones, incapacidadResult] = await Promise.all([
    listSstAccidentes(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    listSstAccionesAccidenteByScope(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        activo: true
      },
      tenant
    ),
    (() => {
      const params: unknown[] = [];
      const conditions: string[] = ['COALESCE(sai.activo, TRUE) = TRUE'];
      appendTenantScopeConditions(conditions, params, tenant, 'sai.contrato_id', 'sai.empresa_id');
      if (filters.empresa_id) {
        params.push(filters.empresa_id);
        conditions.push(`sai.empresa_id::text = $${params.length}`);
      }
      if (filters.contrato_id) {
        params.push(filters.contrato_id);
        conditions.push(`sai.contrato_id::text = $${params.length}`);
      }
      return dbQuery<AggregateIncapacidadRow>(
        `
          SELECT COALESCE(SUM(COALESCE(sai.dias_incapacidad, 0)), 0) AS incapacidades_total
          FROM sst_accidentes_incidentes sai
          WHERE ${conditions.join(' AND ')}
        `,
        params
      );
    })()
  ]);

  const dashboard: SstAccidentesDashboard = {
    accidentes_total: accidentes.items.filter((item) => item.tipo_evento === 'ACCIDENTE_TRABAJO').length,
    incidentes_total: accidentes.items.filter((item) => item.tipo_evento === 'INCIDENTE').length,
    casi_accidentes_total: accidentes.items.filter((item) => item.tipo_evento === 'CASI_ACCIDENTE').length,
    abiertos: accidentes.items.filter((item) => item.estado === 'ABIERTO').length,
    investigacion: accidentes.items.filter((item) => item.estado === 'EN_INVESTIGACION').length,
    cerrados: accidentes.items.filter((item) => item.estado === 'CERRADO').length,
    leves: accidentes.items.filter((item) => item.severidad === 'LEVE').length,
    moderados: accidentes.items.filter((item) => item.severidad === 'MODERADO').length,
    graves: accidentes.items.filter((item) => item.severidad === 'GRAVE').length,
    mortales: accidentes.items.filter((item) => item.severidad === 'MORTAL').length,
    lesionados: accidentes.items.filter((item) => item.lesionado).length,
    incapacidades_total: toNullableBigintNumber(incapacidadResult.rows[0]?.incapacidades_total) ?? 0,
    acciones_abiertas: acciones.filter((item) => item.estado !== 'CERRADA').length,
    acciones_vencidas: acciones.filter((item) => item.estado !== 'CERRADA' && item.estado_alerta === 'vencida').length,
    cumplimiento_acciones_porcentaje:
      acciones.length === 0 ? 100 : Math.round((acciones.filter((item) => item.estado === 'CERRADA').length / acciones.length) * 10000) / 100
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_ACCIDENTE_DASHBOARD_VIEW',
    tabla: 'sst_accidentes_incidentes',
    registro_id: `dashboard:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard SST de accidentes e incidentes',
    after: dashboard,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return dashboard;
};

export const getSstAccidentesAlertas = async (
  filters: ListSstAccidentesAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstAccidenteAlertas> => {
  ensureFilterWithinTenant(tenant, filters);
  const [accidentes, acciones] = await Promise.all([
    listSstAccidentes(
      {
        page: 1,
        limit: 5000,
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id,
        activo: true
      },
      tenant
    ),
    listSstAccionesAccidenteByScope(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        persona_id: filters.persona_id,
        activo: true
      },
      tenant
    )
  ]);

  const today = getTodayDateOnly();
  const items: SstAccidenteAlerta[] = [];

  for (const item of accidentes.items) {
    if (item.estado === 'ABIERTO') {
      items.push({
        id: `ACCIDENTE_ABIERTO:${item.id}`,
        tipo_alerta: 'ACCIDENTE_ABIERTO',
        severidad: getAccidenteAlertSeverity(item.severidad),
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_evento,
        fecha_compromiso: null,
        dias_restantes: null,
        titulo: `Accidente abierto: ${item.tipo_evento}`,
        descripcion: `El caso de ${item.persona.nombre_completo} permanece abierto.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        accidente: {
          id: item.id,
          tipo_evento: item.tipo_evento,
          severidad: item.severidad
        },
        accion_correctiva: null
      });
    }

    if (item.requiere_investigacion && item.estado !== 'CERRADO') {
      items.push({
        id: `INVESTIGACION_PENDIENTE:${item.id}`,
        tipo_alerta: 'INVESTIGACION_PENDIENTE',
        severidad: item.severidad === 'MORTAL' || item.severidad === 'GRAVE' ? 'CRITICA' : 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_compromiso: null,
        dias_restantes: null,
        titulo: `Investigacion pendiente: ${item.tipo_evento}`,
        descripcion: `El caso de ${item.persona.nombre_completo} requiere investigacion y no ha sido cerrado.`,
        persona: {
          id: item.persona.id,
          numero_documento: item.persona.numero_documento
        },
        vinculacion: {
          id: item.vinculacion?.id ?? 0
        },
        accidente: {
          id: item.id,
          tipo_evento: item.tipo_evento,
          severidad: item.severidad
        },
        accion_correctiva: null
      });
    }
  }

  for (const item of acciones) {
    if (item.estado === 'CERRADA') {
      continue;
    }

    if (item.estado_alerta === 'vencida') {
      items.push({
        id: `ACCION_CORRECTIVA_VENCIDA:${item.id}`,
        tipo_alerta: 'ACCION_CORRECTIVA_VENCIDA',
        severidad: 'ALTA',
        estado: 'ACTIVA',
        fecha_alerta: item.fecha_compromiso ?? today,
        fecha_compromiso: item.fecha_compromiso,
        dias_restantes: calculateDaysRemaining(item.fecha_compromiso),
        titulo: 'Accion correctiva vencida',
        descripcion: `La accion correctiva del caso ${item.accidente.id} se encuentra vencida.`,
        persona: {
          id: item.accidente.persona.id,
          numero_documento: item.accidente.persona.numero_documento
        },
        vinculacion: {
          id: item.accidente.vinculacion?.id ?? 0
        },
        accidente: {
          id: item.accidente.id,
          tipo_evento: item.accidente.tipo_evento,
          severidad: item.accidente.severidad
        },
        accion_correctiva: {
          id: item.id
        }
      });
    } else if (item.estado_alerta === 'proxima_a_vencer') {
      items.push({
        id: `ACCION_CORRECTIVA_PROXIMA_VENCER:${item.id}`,
        tipo_alerta: 'ACCION_CORRECTIVA_PROXIMA_VENCER',
        severidad: 'MEDIA',
        estado: 'ACTIVA',
        fecha_alerta: today,
        fecha_compromiso: item.fecha_compromiso,
        dias_restantes: calculateDaysRemaining(item.fecha_compromiso),
        titulo: 'Accion correctiva proxima a vencer',
        descripcion: `La accion correctiva del caso ${item.accidente.id} vence en menos de 30 dias.`,
        persona: {
          id: item.accidente.persona.id,
          numero_documento: item.accidente.persona.numero_documento
        },
        vinculacion: {
          id: item.accidente.vinculacion?.id ?? 0
        },
        accidente: {
          id: item.accidente.id,
          tipo_evento: item.accidente.tipo_evento,
          severidad: item.accidente.severidad
        },
        accion_correctiva: {
          id: item.id
        }
      });
    }
  }

  items.sort((left, right) => {
    const severityWeight = (value: SstAccidenteAlerta['severidad']): number => {
      if (value === 'CRITICA') return 4;
      if (value === 'ALTA') return 3;
      if (value === 'MEDIA') return 2;
      return 1;
    };

    const diff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (diff !== 0) {
      return diff;
    }

    return right.fecha_alerta.localeCompare(left.fecha_alerta);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_ACCIDENTE_ALERTAS_VIEW',
    tabla: 'sst_accidentes_incidentes',
    registro_id: `alertas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}:${filters.persona_id ?? 'all'}`,
    descripcion: 'Consulta de alertas SST de accidentes e incidentes',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null,
      persona_id: filters.persona_id ?? null
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return {
    items: pagedItems,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total: items.length,
      total_pages: items.length === 0 ? 0 : Math.ceil(items.length / filters.limit)
    }
  };
};
