import { randomUUID } from 'node:crypto';

import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool, dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { getVinculacionChecklist } from '../documentos/documentos.service';
import {
  assertTenantAccessForVinculacionId,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import {
  EstadoAlertaDocumental,
  GenerateAlertasDocumentalesInput,
  ListAlertasDocumentalesQuery,
  SeveridadAlertaDocumental,
  TipoAlertaDocumental
} from './alertas.documentales.schemas';

interface AlertaDocumentalRow extends QueryResultRow {
  activo: boolean;
  acciones_resueltas?: number | null;
  acciones_actualizadas?: number | null;
  acciones_creadas?: number | null;
  acciones_ignoradas?: number | null;
  alerta_id?: string | null;
  contrato_id: string | null;
  contrato_numero: string | null;
  created_at: Date | string;
  descripcion: string | null;
  dias_restantes: number | string | null;
  empresa_id: string | null;
  empresa_nombre: string | null;
  estado: EstadoAlertaDocumental;
  fecha_alerta: Date | string;
  fecha_vencimiento: Date | string | null;
  id: string;
  observacion?: string | null;
  persona_id: string | null;
  persona_nombre: string | null;
  severidad: SeveridadAlertaDocumental;
  tipo_alerta: TipoAlertaDocumental;
  tipo_documento_codigo: string | null;
  tipo_documento_id: string | null;
  tipo_documento_nombre: string | null;
  titulo: string;
  updated_at: Date | string;
  vinculacion_id: string | null;
}

interface VinculacionScopeRow extends QueryResultRow {
  contrato_cargo_id: string | null;
  contrato_id: string;
  empresa_id: string | null;
  estado: string;
  id: string;
  persona_id: string;
}

interface ActiveAlertRow extends QueryResultRow {
  activo: boolean;
  contrato_id: string | null;
  descripcion: string | null;
  dias_restantes: number | string | null;
  empresa_id: string | null;
  estado: EstadoAlertaDocumental;
  fecha_alerta: Date | string;
  fecha_vencimiento: Date | string | null;
  id: string;
  persona_id: string | null;
  severidad: SeveridadAlertaDocumental;
  tipo_alerta: TipoAlertaDocumental;
  tipo_documento_id: string | null;
  titulo: string;
  updated_at: Date | string;
  vinculacion_id: string | null;
}

export interface AlertaDocumentalItem {
  activo: boolean;
  contrato_id: number | null;
  contrato_numero: string | null;
  created_at: string;
  descripcion: string | null;
  dias_restantes: number | null;
  empresa_id: number | null;
  empresa_nombre: string | null;
  estado: EstadoAlertaDocumental;
  fecha_alerta: string;
  fecha_vencimiento: string | null;
  id: number;
  observacion: string | null;
  persona_id: number | null;
  persona_nombre: string | null;
  severidad: SeveridadAlertaDocumental;
  tipo_alerta: TipoAlertaDocumental;
  tipo_documento_codigo: string | null;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  titulo: string;
  updated_at: string;
  vinculacion_id: number | null;
}

export interface PaginatedAlertasDocumentales {
  items: AlertaDocumentalItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

export interface GenerateAlertasDocumentalesResult {
  alertas_actualizadas: number;
  alertas_creadas: number;
  alertas_resueltas: number;
  vinculaciones_procesadas: number;
}

interface AlertCandidate {
  activo: boolean;
  contrato_id: number;
  descripcion: string;
  dias_restantes: number | null;
  empresa_id: number | null;
  estado: EstadoAlertaDocumental;
  fecha_alerta: string;
  fecha_vencimiento: string | null;
  key: string;
  persona_id: number;
  severidad: SeveridadAlertaDocumental;
  tipo_alerta: TipoAlertaDocumental;
  tipo_documento_codigo: string | null;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  titulo: string;
  vinculacion_id: number;
}

const normalizeKey = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const toNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError('Invalid numeric value returned by database', 500, 'INVALID_NUMERIC_VALUE');
  }

  return parsed;
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

const toIsoDate = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const daysBetween = (fromIsoDate: string, toIsoDateValue: string): number => {
  const from = new Date(`${fromIsoDate}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIsoDateValue}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86400000);
};

const buildAlertKey = (input: {
  tipo_alerta: TipoAlertaDocumental;
  titulo: string;
  tipo_documento_id: number | null;
  vinculacion_id: number;
}): string => {
  return [
    input.tipo_alerta,
    input.vinculacion_id,
    input.tipo_documento_id ?? 'null',
    normalizeKey(input.titulo)
  ].join('|');
};

const mapAlertRow = (row: AlertaDocumentalRow): AlertaDocumentalItem => {
  return {
    id: toNumber(row.id) ?? 0,
    empresa_id: toNumber(row.empresa_id),
    contrato_id: toNumber(row.contrato_id),
    vinculacion_id: toNumber(row.vinculacion_id),
    persona_id: toNumber(row.persona_id),
    tipo_documento_id: toNumber(row.tipo_documento_id),
    tipo_alerta: row.tipo_alerta,
    severidad: row.severidad,
    estado: row.estado,
    titulo: row.titulo,
    descripcion: row.descripcion,
    fecha_alerta: toDateString(row.fecha_alerta) ?? '',
    fecha_vencimiento: toDateString(row.fecha_vencimiento),
    dias_restantes: row.dias_restantes === null || row.dias_restantes === undefined ? null : Number(row.dias_restantes),
    activo: row.activo,
    created_at: toDateString(row.created_at) ?? '',
    updated_at: toDateString(row.updated_at) ?? '',
    empresa_nombre: row.empresa_nombre,
    contrato_numero: row.contrato_numero,
    persona_nombre: row.persona_nombre,
    tipo_documento_codigo: row.tipo_documento_codigo,
    tipo_documento_nombre: row.tipo_documento_nombre,
    observacion: row.observacion ?? null
  };
};

const normalizeAlertInputDate = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return toDateString(value);
};

const resolveSeverityForCandidate = (tipo: TipoAlertaDocumental): SeveridadAlertaDocumental => {
  switch (tipo) {
    case 'DOCUMENTO_POR_VENCER':
      return 'ALTA';
    case 'EXPEDIENTE_INCOMPLETO':
      return 'MEDIA';
    case 'DOCUMENTO_FALTANTE':
    case 'DOCUMENTO_VENCIDO':
    default:
      return 'CRITICA';
  }
};

const candidateFromChecklistItem = (
  checklistItem: Awaited<ReturnType<typeof getVinculacionChecklist>>['requisitos'][number],
  baseContext: {
    contrato_id: number;
    empresa_id: number | null;
    persona_id: number;
    vinculacion_id: number;
  },
  todayIso: string
): AlertCandidate | null => {
  const tipoDocumentoId = checklistItem.tipo_documento_id;
  const tipoDocumentoNombre = checklistItem.tipo_documento_nombre ?? checklistItem.nombre_requisito;
  const tipoDocumentoCodigo = checklistItem.codigo;
  const normalizedLabel = normalizeKey(tipoDocumentoNombre ?? checklistItem.nombre_requisito);

  if (checklistItem.estado === 'FALTANTE' && checklistItem.obligatorio) {
    const titulo = `Documento faltante: ${tipoDocumentoNombre}`;
    return {
      activo: true,
      contrato_id: baseContext.contrato_id,
      descripcion: `El requisito ${checklistItem.nombre_requisito} no tiene documento vigente asociado.`,
      dias_restantes: null,
      empresa_id: baseContext.empresa_id,
      estado: 'ACTIVA',
      fecha_alerta: todayIso,
      fecha_vencimiento: null,
      key: buildAlertKey({
        tipo_alerta: 'DOCUMENTO_FALTANTE',
        titulo,
        tipo_documento_id: tipoDocumentoId,
        vinculacion_id: baseContext.vinculacion_id
      }),
      persona_id: baseContext.persona_id,
      severidad: resolveSeverityForCandidate('DOCUMENTO_FALTANTE'),
      tipo_alerta: 'DOCUMENTO_FALTANTE',
      tipo_documento_codigo: tipoDocumentoCodigo,
      tipo_documento_id: tipoDocumentoId,
      tipo_documento_nombre: tipoDocumentoNombre,
      titulo,
      vinculacion_id: baseContext.vinculacion_id
    };
  }

  if (checklistItem.estado === 'VENCIDO') {
    const titulo = `Documento vencido: ${tipoDocumentoNombre}`;
    return {
      activo: true,
      contrato_id: baseContext.contrato_id,
      descripcion: `El documento ${tipoDocumentoNombre} se encuentra vencido.`,
      dias_restantes: checklistItem.fecha_vencimiento ? daysBetween(todayIso, checklistItem.fecha_vencimiento) : null,
      empresa_id: baseContext.empresa_id,
      estado: 'ACTIVA',
      fecha_alerta: todayIso,
      fecha_vencimiento: normalizeAlertInputDate(checklistItem.fecha_vencimiento),
      key: buildAlertKey({
        tipo_alerta: 'DOCUMENTO_VENCIDO',
        titulo,
        tipo_documento_id: tipoDocumentoId,
        vinculacion_id: baseContext.vinculacion_id
      }),
      persona_id: baseContext.persona_id,
      severidad: resolveSeverityForCandidate('DOCUMENTO_VENCIDO'),
      tipo_alerta: 'DOCUMENTO_VENCIDO',
      tipo_documento_codigo: tipoDocumentoCodigo,
      tipo_documento_id: tipoDocumentoId,
      tipo_documento_nombre: tipoDocumentoNombre,
      titulo,
      vinculacion_id: baseContext.vinculacion_id
    };
  }

  if (checklistItem.estado === 'CARGADO' && checklistItem.fecha_vencimiento) {
    const daysRemaining = daysBetween(todayIso, checklistItem.fecha_vencimiento);

    if (daysRemaining >= 0 && daysRemaining <= 30) {
      const titulo = `Documento por vencer: ${tipoDocumentoNombre}`;
      return {
        activo: true,
        contrato_id: baseContext.contrato_id,
        descripcion: `El documento ${tipoDocumentoNombre} vence en ${daysRemaining} dias.`,
        dias_restantes: daysRemaining,
        empresa_id: baseContext.empresa_id,
        estado: 'ACTIVA',
        fecha_alerta: todayIso,
        fecha_vencimiento: normalizeAlertInputDate(checklistItem.fecha_vencimiento),
        key: buildAlertKey({
          tipo_alerta: 'DOCUMENTO_POR_VENCER',
          titulo,
          tipo_documento_id: tipoDocumentoId,
          vinculacion_id: baseContext.vinculacion_id
        }),
        persona_id: baseContext.persona_id,
        severidad: resolveSeverityForCandidate('DOCUMENTO_POR_VENCER'),
        tipo_alerta: 'DOCUMENTO_POR_VENCER',
        tipo_documento_codigo: tipoDocumentoCodigo,
        tipo_documento_id: tipoDocumentoId,
        tipo_documento_nombre: tipoDocumentoNombre,
        titulo,
        vinculacion_id: baseContext.vinculacion_id
      };
    }
  }

  if (checklistItem.estado === 'FALTANTE' && !checklistItem.obligatorio) {
    return null;
  }

  if (checklistItem.estado === 'FALTANTE' && !tipoDocumentoId) {
    const titulo = `Requisito documental faltante: ${checklistItem.nombre_requisito}`;
    return {
      activo: true,
      contrato_id: baseContext.contrato_id,
      descripcion: `El requisito ${checklistItem.nombre_requisito} no pudo asociarse a un tipo de documento.`,
      dias_restantes: null,
      empresa_id: baseContext.empresa_id,
      estado: 'ACTIVA',
      fecha_alerta: todayIso,
      fecha_vencimiento: null,
      key: buildAlertKey({
        tipo_alerta: 'DOCUMENTO_FALTANTE',
        titulo,
        tipo_documento_id: null,
        vinculacion_id: baseContext.vinculacion_id
      }),
      persona_id: baseContext.persona_id,
      severidad: resolveSeverityForCandidate('DOCUMENTO_FALTANTE'),
      tipo_alerta: 'DOCUMENTO_FALTANTE',
      tipo_documento_codigo: null,
      tipo_documento_id: null,
      tipo_documento_nombre: null,
      titulo,
      vinculacion_id: baseContext.vinculacion_id
    };
  }

  if (normalizedLabel.length > 0) {
    return null;
  }

  return null;
};

const loadTargetVinculaciones = async (
  input: GenerateAlertasDocumentalesInput,
  tenant: TenantAccessContext
): Promise<VinculacionScopeRow[]> => {
  const conditions: string[] = [`v.estado_vinculacion = 'ACTIVA'`];
  const params: unknown[] = [];

  if (input.vinculacion_id) {
    params.push(input.vinculacion_id);
    conditions.push(`v.id = $${params.length}`);
  }

  if (input.contrato_id) {
    params.push(input.contrato_id);
    conditions.push(`v.contrato_id = $${params.length}`);
  }

  if (input.empresa_id) {
    params.push(input.empresa_id);
    conditions.push(`c.empresa_id = $${params.length}`);
  }

  if (!tenant.isGlobalAdmin) {
    const tenantConditions: string[] = [];

    if (tenant.contratoIds.length > 0) {
      params.push(tenant.contratoIds);
      tenantConditions.push(`v.contrato_id = ANY($${params.length}::bigint[])`);
    }

    if (tenant.empresaIds.length > 0) {
      params.push(tenant.empresaIds);
      tenantConditions.push(`c.empresa_id = ANY($${params.length}::bigint[])`);
    }

    if (tenantConditions.length === 0) {
      return [];
    }

    conditions.push(`(${tenantConditions.join(' OR ')})`);
  }

  const result = await dbQuery<VinculacionScopeRow>(
    `
      SELECT
        v.id::text AS id,
        v.persona_id::text AS persona_id,
        v.contrato_id::text AS contrato_id,
        c.empresa_id::text AS empresa_id,
        v.contrato_cargo_id::text AS contrato_cargo_id,
        v.estado_vinculacion
      FROM vinculaciones v
      INNER JOIN contratos c ON c.id = v.contrato_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY v.id ASC
    `,
    params
  );

  return result.rows;
};

const loadActiveAlertasForVinculacion = async (
  client: PoolClient,
  vinculacionId: number
): Promise<ActiveAlertRow[]> => {
  const result = await client.query<ActiveAlertRow>(
    `
      SELECT
        id::text AS id,
        empresa_id::text AS empresa_id,
        contrato_id::text AS contrato_id,
        vinculacion_id::text AS vinculacion_id,
        persona_id::text AS persona_id,
        tipo_documento_id::text AS tipo_documento_id,
        tipo_alerta,
        severidad,
        estado,
        titulo,
        descripcion,
        dias_restantes,
        fecha_alerta,
        fecha_vencimiento,
        activo,
        updated_at
      FROM alertas_documentales
      WHERE vinculacion_id = $1::bigint
        AND activo = TRUE
        AND estado = 'ACTIVA'
      ORDER BY created_at ASC, id ASC
    `,
    [vinculacionId]
  );

  return result.rows;
};

const mapActiveAlertByKey = (rows: ActiveAlertRow[]): Map<string, ActiveAlertRow> => {
  const map = new Map<string, ActiveAlertRow>();

  for (const row of rows) {
    const key = buildAlertKey({
      tipo_alerta: row.tipo_alerta,
      titulo: row.titulo,
      tipo_documento_id: toNumber(row.tipo_documento_id),
      vinculacion_id: toNumber(row.vinculacion_id) ?? 0
    });

    if (!map.has(key)) {
      map.set(key, row);
    }
  }

  return map;
};

const insertAlertaDocumental = async (
  client: PoolClient,
  candidate: AlertCandidate,
  actorUserId: string
): Promise<AlertaDocumentalRow> => {
  const result = await client.query<AlertaDocumentalRow>(
    `
      INSERT INTO alertas_documentales (
        empresa_id,
        contrato_id,
        vinculacion_id,
        persona_id,
        tipo_documento_id,
        tipo_alerta,
        severidad,
        estado,
        titulo,
        descripcion,
        fecha_alerta,
        fecha_vencimiento,
        dias_restantes,
        activo,
        updated_at
      )
      VALUES (
        $1::bigint,
        $2::bigint,
        $3::bigint,
        $4::bigint,
        $5::bigint,
        $6,
        $7,
        $8,
        $9,
        $10,
        CURRENT_DATE,
        $11,
        $12::int,
        TRUE,
        NOW()
      )
      RETURNING
        id::text AS id,
        empresa_id::text AS empresa_id,
        contrato_id::text AS contrato_id,
        vinculacion_id::text AS vinculacion_id,
        persona_id::text AS persona_id,
        tipo_documento_id::text AS tipo_documento_id,
        tipo_alerta,
        severidad,
        estado,
        titulo,
        descripcion,
        fecha_alerta,
        fecha_vencimiento,
        dias_restantes,
        activo,
        created_at,
        updated_at,
        NULL::text AS empresa_nombre,
        NULL::text AS contrato_numero,
        NULL::text AS persona_nombre,
        NULL::text AS tipo_documento_codigo,
        NULL::text AS tipo_documento_nombre,
        NULL::text AS observacion
    `,
    [
      candidate.empresa_id,
      candidate.contrato_id,
      candidate.vinculacion_id,
      candidate.persona_id,
      candidate.tipo_documento_id,
      candidate.tipo_alerta,
      candidate.severidad,
      candidate.estado,
      candidate.titulo,
      candidate.descripcion,
      candidate.fecha_vencimiento,
      candidate.dias_restantes
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to create document alert', 500, 'ALERTA_DOCUMENTAL_CREATE_FAILED');
  }

  return row;
};

const updateAlertaDocumental = async (
  client: PoolClient,
  existingId: string,
  candidate: AlertCandidate
): Promise<AlertaDocumentalRow> => {
  const result = await client.query<AlertaDocumentalRow>(
    `
      UPDATE alertas_documentales
      SET
        empresa_id = $2::bigint,
        contrato_id = $3::bigint,
        vinculacion_id = $4::bigint,
        persona_id = $5::bigint,
        tipo_documento_id = $6::bigint,
        tipo_alerta = $7,
        severidad = $8,
        estado = $9,
        titulo = $10,
        descripcion = $11,
        fecha_alerta = CURRENT_DATE,
        fecha_vencimiento = $12,
        dias_restantes = $13::int,
        activo = TRUE,
        updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING
        id::text AS id,
        empresa_id::text AS empresa_id,
        contrato_id::text AS contrato_id,
        vinculacion_id::text AS vinculacion_id,
        persona_id::text AS persona_id,
        tipo_documento_id::text AS tipo_documento_id,
        tipo_alerta,
        severidad,
        estado,
        titulo,
        descripcion,
        fecha_alerta,
        fecha_vencimiento,
        dias_restantes,
        activo,
        created_at,
        updated_at,
        NULL::text AS empresa_nombre,
        NULL::text AS contrato_numero,
        NULL::text AS persona_nombre,
        NULL::text AS tipo_documento_codigo,
        NULL::text AS tipo_documento_nombre,
        NULL::text AS observacion
    `,
    [
      existingId,
      candidate.empresa_id,
      candidate.contrato_id,
      candidate.vinculacion_id,
      candidate.persona_id,
      candidate.tipo_documento_id,
      candidate.tipo_alerta,
      candidate.severidad,
      candidate.estado,
      candidate.titulo,
      candidate.descripcion,
      candidate.fecha_vencimiento,
      candidate.dias_restantes
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to update document alert', 500, 'ALERTA_DOCUMENTAL_UPDATE_FAILED');
  }

  return row;
};

const resolveAlertaDocumentalRow = async (
  client: PoolClient,
  existingId: string
): Promise<AlertaDocumentalRow> => {
  const result = await client.query<AlertaDocumentalRow>(
    `
      UPDATE alertas_documentales
      SET
        estado = 'RESUELTA',
        activo = FALSE,
        updated_at = NOW()
      WHERE id = $1::bigint
      RETURNING
        id::text AS id,
        empresa_id::text AS empresa_id,
        contrato_id::text AS contrato_id,
        vinculacion_id::text AS vinculacion_id,
        persona_id::text AS persona_id,
        tipo_documento_id::text AS tipo_documento_id,
        tipo_alerta,
        severidad,
        estado,
        titulo,
        descripcion,
        fecha_alerta,
        fecha_vencimiento,
        dias_restantes,
        activo,
        created_at,
        updated_at,
        NULL::text AS empresa_nombre,
        NULL::text AS contrato_numero,
        NULL::text AS persona_nombre,
        NULL::text AS tipo_documento_codigo,
        NULL::text AS tipo_documento_nombre,
        NULL::text AS observacion
    `,
    [existingId]
  );

  const row = result.rows[0];

  if (!row) {
    throw new AppError('Failed to resolve document alert', 500, 'ALERTA_DOCUMENTAL_RESOLVE_FAILED');
  }

  return row;
};

const upsertAlertCandidate = async (
  client: PoolClient,
  candidate: AlertCandidate,
  activeByKey: Map<string, ActiveAlertRow>,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<{ created: number; resolved: number; updated: number }> => {
  const active = activeByKey.get(candidate.key);

  if (active) {
    const hasChanges =
      active.descripcion !== candidate.descripcion ||
      active.dias_restantes !== candidate.dias_restantes ||
      normalizeAlertInputDate(active.fecha_vencimiento) !== candidate.fecha_vencimiento ||
      active.severidad !== candidate.severidad ||
      active.estado !== candidate.estado ||
      active.titulo !== candidate.titulo;

    if (!hasChanges) {
      return { created: 0, resolved: 0, updated: 0 };
    }

    const updated = await updateAlertaDocumental(client, active.id, candidate);

    try {
    await registerAuditEntry({
      accion: 'UPDATE',
      after: updated,
      before: active,
      client,
      descripcion: 'Actualizacion de alerta documental',
      ip: auditMeta?.ip ?? null,
      registro_id: updated.id,
      tabla: 'alertas_documentales',
      user_agent: auditMeta?.user_agent ?? null,
      usuario_id: actorUserId
    });
    } catch (error) {
      console.error('Failed to audit alert update', error);
    }

    activeByKey.delete(candidate.key);
    activeByKey.set(candidate.key, {
      ...active,
      ...updated
    });

    return { created: 0, resolved: 0, updated: 1 };
  }

  const inserted = await insertAlertaDocumental(client, candidate, actorUserId);

  try {
    await registerAuditEntry({
      accion: 'CREATE',
      after: inserted,
      client,
      descripcion: 'Creacion de alerta documental',
      ip: auditMeta?.ip ?? null,
      registro_id: inserted.id,
      tabla: 'alertas_documentales',
      user_agent: auditMeta?.user_agent ?? null,
      usuario_id: actorUserId
    });
  } catch (error) {
    console.error('Failed to audit alert creation', error);
  }

  activeByKey.set(candidate.key, {
    activo: true,
    contrato_id: String(candidate.contrato_id),
    descripcion: candidate.descripcion,
    dias_restantes: candidate.dias_restantes,
    empresa_id: candidate.empresa_id === null ? null : String(candidate.empresa_id),
    estado: candidate.estado,
    fecha_alerta: new Date(),
    fecha_vencimiento: candidate.fecha_vencimiento ? new Date(candidate.fecha_vencimiento) : null,
    id: String(inserted.id),
    persona_id: String(candidate.persona_id),
    severidad: candidate.severidad,
    tipo_alerta: candidate.tipo_alerta,
    tipo_documento_id: candidate.tipo_documento_id === null ? null : String(candidate.tipo_documento_id),
    titulo: candidate.titulo,
    updated_at: new Date(),
    vinculacion_id: String(candidate.vinculacion_id)
  });

  return { created: 1, resolved: 0, updated: 0 };
};

const resolveMissingAlerts = async (
  client: PoolClient,
  activeByKey: Map<string, ActiveAlertRow>,
  candidateKeys: Set<string>,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<number> => {
  let resolved = 0;

  for (const [key, active] of activeByKey.entries()) {
    if (candidateKeys.has(key)) {
      continue;
    }

    const resolvedRow = await resolveAlertaDocumentalRow(client, active.id);

    try {
      await registerAuditEntry({
        accion: 'UPDATE',
        after: resolvedRow,
        before: active,
        client,
        descripcion: 'Resolucion de alerta documental',
        ip: auditMeta?.ip ?? null,
        registro_id: resolvedRow.id,
        tabla: 'alertas_documentales',
        user_agent: auditMeta?.user_agent ?? null,
        usuario_id: actorUserId
      });
    } catch (error) {
      console.error('Failed to audit alert resolution', error);
    }

    resolved += 1;
  }

  return resolved;
};

const ensureTenantCanAccessContrato = async (
  tenant: TenantAccessContext,
  contratoId: number
): Promise<void> => {
  if (tenant.isGlobalAdmin || tenant.contratoIds.includes(contratoId)) {
    return;
  }

  const result = await dbQuery<{ empresa_id: string | null }>(
    `
      SELECT empresa_id::text AS empresa_id
      FROM contratos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const contrato = result.rows[0];

  if (contrato?.empresa_id && tenant.empresaIds.includes(Number(contrato.empresa_id))) {
    return;
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const ensureTenantCanAccessEmpresa = async (
  tenant: TenantAccessContext,
  empresaId: number
): Promise<void> => {
  if (tenant.isGlobalAdmin || tenant.empresaIds.includes(empresaId)) {
    return;
  }

  const result = await dbQuery<{ id: string }>(
    `
      SELECT 1::text AS id
      FROM contratos
      WHERE empresa_id = $1::bigint
        AND id = ANY($2::bigint[])
      LIMIT 1
    `,
    [empresaId, tenant.contratoIds]
  );

  if (result.rows.length > 0) {
    return;
  }

  throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const buildAlertaWhereClause = (
  filters: ListAlertasDocumentalesQuery,
  tenant: TenantAccessContext
): { params: unknown[]; sql: string } => {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!tenant.isGlobalAdmin) {
    const tenantConditions: string[] = [];

    if (tenant.contratoIds.length > 0) {
      params.push(tenant.contratoIds);
      tenantConditions.push(`ad.contrato_id = ANY($${params.length}::bigint[])`);
    }

    if (tenant.empresaIds.length > 0) {
      params.push(tenant.empresaIds);
      tenantConditions.push(`ad.empresa_id = ANY($${params.length}::bigint[])`);
    }

    if (tenantConditions.length === 0) {
      return {
        params: [],
        sql: 'WHERE 1 = 0'
      };
    }

    conditions.push(`(${tenantConditions.join(' OR ')})`);
  }

  if (filters.empresa_id !== undefined && filters.empresa_id !== null) {
    params.push(filters.empresa_id);
    conditions.push(`ad.empresa_id = $${params.length}`);
  }

  if (filters.contrato_id !== undefined && filters.contrato_id !== null) {
    params.push(filters.contrato_id);
    conditions.push(`ad.contrato_id = $${params.length}`);
  }

  if (filters.vinculacion_id !== undefined && filters.vinculacion_id !== null) {
    params.push(filters.vinculacion_id);
    conditions.push(`ad.vinculacion_id = $${params.length}`);
  }

  if (filters.persona_id !== undefined && filters.persona_id !== null) {
    params.push(filters.persona_id);
    conditions.push(`ad.persona_id = $${params.length}`);
  }

  if (filters.tipo_alerta) {
    params.push(filters.tipo_alerta);
    conditions.push(`ad.tipo_alerta = $${params.length}`);
  }

  if (filters.severidad) {
    params.push(filters.severidad);
    conditions.push(`ad.severidad = $${params.length}`);
  }

  if (filters.estado) {
    params.push(filters.estado);
    conditions.push(`ad.estado = $${params.length}`);
  }

  if (conditions.length === 0) {
    return {
      params,
      sql: ''
    };
  }

  return {
    params,
    sql: `WHERE ${conditions.join(' AND ')}`
  };
};

export const listAlertasDocumentales = async (
  filters: ListAlertasDocumentalesQuery,
  tenant: TenantAccessContext
): Promise<PaginatedAlertasDocumentales> => {
  const { params, sql } = buildAlertaWhereClause(filters, tenant);
  const countResult = await dbQuery<{ total: number }>(
    `
      SELECT COUNT(*)::int AS total
      FROM alertas_documentales ad
      ${sql}
    `,
    params
  );

  const total = countResult.rows[0]?.total ?? 0;
  const offset = ((filters.page ?? 1) - 1) * (filters.limit ?? 25);
  const listParams = [...params, filters.limit ?? 25, offset];
  const result = await dbQuery<AlertaDocumentalRow>(
    `
      SELECT
        ad.id::text AS id,
        ad.empresa_id::text AS empresa_id,
        e.nombre_empresa AS empresa_nombre,
        ad.contrato_id::text AS contrato_id,
        c.numero_contrato AS contrato_numero,
        ad.vinculacion_id::text AS vinculacion_id,
        ad.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        ad.tipo_documento_id::text AS tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        ad.tipo_alerta,
        ad.severidad,
        ad.estado,
        ad.titulo,
        ad.descripcion,
        ad.fecha_alerta,
        ad.fecha_vencimiento,
        ad.dias_restantes,
        ad.activo,
        ad.created_at,
        ad.updated_at,
        NULL::text AS observacion
      FROM alertas_documentales ad
      LEFT JOIN empresas e ON e.id = ad.empresa_id
      LEFT JOIN contratos c ON c.id = ad.contrato_id
      LEFT JOIN personas p ON p.id = ad.persona_id
      LEFT JOIN tipos_documentos td ON td.id = ad.tipo_documento_id
      ${sql}
      ORDER BY ad.fecha_alerta DESC, ad.created_at DESC, ad.id DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `,
    listParams
  );

  return {
    items: result.rows.map(mapAlertRow),
    pagination: {
      limit: filters.limit ?? 25,
      page: filters.page ?? 1,
      total,
      total_pages: total === 0 ? 0 : Math.ceil(total / (filters.limit ?? 25))
    }
  };
};

export const getAlertaDocumentalById = async (
  id: number,
  tenant: TenantAccessContext
): Promise<AlertaDocumentalItem | null> => {
  const result = await dbQuery<AlertaDocumentalRow>(
    `
      SELECT
        ad.id::text AS id,
        ad.empresa_id::text AS empresa_id,
        e.nombre_empresa AS empresa_nombre,
        ad.contrato_id::text AS contrato_id,
        c.numero_contrato AS contrato_numero,
        ad.vinculacion_id::text AS vinculacion_id,
        ad.persona_id::text AS persona_id,
        CONCAT_WS(' ', p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido) AS persona_nombre,
        ad.tipo_documento_id::text AS tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        ad.tipo_alerta,
        ad.severidad,
        ad.estado,
        ad.titulo,
        ad.descripcion,
        ad.fecha_alerta,
        ad.fecha_vencimiento,
        ad.dias_restantes,
        ad.activo,
        ad.created_at,
        ad.updated_at,
        NULL::text AS observacion
      FROM alertas_documentales ad
      LEFT JOIN empresas e ON e.id = ad.empresa_id
      LEFT JOIN contratos c ON c.id = ad.contrato_id
      LEFT JOIN personas p ON p.id = ad.persona_id
      LEFT JOIN tipos_documentos td ON td.id = ad.tipo_documento_id
      WHERE ad.id = $1::bigint
      LIMIT 1
    `,
    [id]
  );

  const row = result.rows[0];

  if (!row) {
    return null;
  }

  const empresaId = toNumber(row.empresa_id);
  const contratoId = toNumber(row.contrato_id);

  if (!tenant.isGlobalAdmin) {
    const allowed = tenant.empresaIds.includes(empresaId ?? -1) || tenant.contratoIds.includes(contratoId ?? -1);

    if (!allowed) {
      throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
    }
  }

  return mapAlertRow(row);
};

const assertVinculacionAccessForGeneration = async (
  tenant: TenantAccessContext,
  input: GenerateAlertasDocumentalesInput
): Promise<void> => {
  if (input.vinculacion_id !== undefined && input.vinculacion_id !== null) {
    await assertTenantAccessForVinculacionId(tenant, input.vinculacion_id);
    return;
  }

  if (input.contrato_id !== undefined && input.contrato_id !== null) {
    await ensureTenantCanAccessContrato(tenant, input.contrato_id);
  }

  if (input.empresa_id !== undefined && input.empresa_id !== null) {
    await ensureTenantCanAccessEmpresa(tenant, input.empresa_id);
  }
};

const buildAlertSummary = async (
  client: PoolClient,
  actorUserId: string,
  auditMeta: AuditRequestMeta | undefined,
  result: {
    alertas_actualizadas: number;
    alertas_creadas: number;
    alertas_resueltas: number;
    vinculaciones_procesadas: number;
  }
): Promise<void> => {
  try {
    await registerAuditEntry({
      accion: 'GENERATE',
      after: result,
      client,
      descripcion: 'Generacion o recálculo de alertas documentales',
      ip: auditMeta?.ip ?? null,
      registro_id: randomUUID(),
      tabla: 'alertas_documentales',
      user_agent: auditMeta?.user_agent ?? null,
      usuario_id: actorUserId
    });
  } catch (error) {
    console.error('Failed to audit document alerts generation', error);
  }
};

export const generateAlertasDocumentales = async (
  input: GenerateAlertasDocumentalesInput,
  actorUserId: string,
  tenant: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<GenerateAlertasDocumentalesResult> => {
  await assertVinculacionAccessForGeneration(tenant, input);
  const vinculations = await loadTargetVinculaciones(input, tenant);

  if (vinculations.length === 0) {
    return {
      alertas_actualizadas: 0,
      alertas_creadas: 0,
      alertas_resueltas: 0,
      vinculaciones_procesadas: 0
    };
  }

  const client = await dbPool.connect();
  let alertasActualizadas = 0;
  let alertasCreadas = 0;
  let alertasResueltas = 0;

  try {
    await client.query('BEGIN');

    for (const vinculacion of vinculations) {
      const checklist = await getVinculacionChecklist(vinculacion.id, tenant, { audit: false });
      const todayIso = toIsoDate(new Date());
      const activeAlerts = await loadActiveAlertasForVinculacion(client, toNumber(vinculacion.id) ?? 0);
      const activeByKey = mapActiveAlertByKey(activeAlerts);
      const candidateKeys = new Set<string>();
      const candidates: AlertCandidate[] = [];

      for (const item of checklist.requisitos) {
        const candidate = candidateFromChecklistItem(
          item,
          {
            contrato_id: checklist.contrato_id,
            empresa_id: toNumber(vinculacion.empresa_id),
            persona_id: checklist.persona_id,
            vinculacion_id: checklist.vinculacion_id
          },
          todayIso
        );

        if (candidate) {
          candidates.push(candidate);
          candidateKeys.add(candidate.key);
        }
      }

      const expedienteCandidate: AlertCandidate | null =
        checklist.cumplimiento_porcentaje < 100
          ? {
              activo: true,
              contrato_id: checklist.contrato_id,
              descripcion: `El expediente documental presenta cumplimiento de ${checklist.cumplimiento_porcentaje}%.`,
              dias_restantes: null,
              empresa_id: toNumber(vinculacion.empresa_id),
              estado: 'ACTIVA',
              fecha_alerta: todayIso,
              fecha_vencimiento: null,
              key: buildAlertKey({
                tipo_alerta: 'EXPEDIENTE_INCOMPLETO',
                titulo: 'Expediente documental incompleto',
                tipo_documento_id: null,
                vinculacion_id: checklist.vinculacion_id
              }),
              persona_id: checklist.persona_id,
              severidad: resolveSeverityForCandidate('EXPEDIENTE_INCOMPLETO'),
              tipo_alerta: 'EXPEDIENTE_INCOMPLETO',
              tipo_documento_codigo: null,
              tipo_documento_id: null,
              tipo_documento_nombre: null,
              titulo: 'Expediente documental incompleto',
              vinculacion_id: checklist.vinculacion_id
            }
          : null;

      if (expedienteCandidate) {
        candidates.push(expedienteCandidate);
        candidateKeys.add(expedienteCandidate.key);
      }

      for (const candidate of candidates) {
        const result = await upsertAlertCandidate(client, candidate, activeByKey, actorUserId, auditMeta);
        alertasCreadas += result.created;
        alertasActualizadas += result.updated;
        alertasResueltas += result.resolved;
      }

      alertasResueltas += await resolveMissingAlerts(client, activeByKey, candidateKeys, actorUserId, auditMeta);
    }

    await buildAlertSummary(client, actorUserId, auditMeta, {
      alertas_actualizadas: alertasActualizadas,
      alertas_creadas: alertasCreadas,
      alertas_resueltas: alertasResueltas,
      vinculaciones_procesadas: vinculations.length
    });

    await client.query('COMMIT');

    return {
      alertas_actualizadas: alertasActualizadas,
      alertas_creadas: alertasCreadas,
      alertas_resueltas: alertasResueltas,
      vinculaciones_procesadas: vinculations.length
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const resolveAlertaDocumental = async (
  id: number,
  actorUserId: string,
  tenant: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<AlertaDocumentalItem> => {
  const current = await getAlertaDocumentalById(id, tenant);

  if (!current) {
    throw new AppError('Alert not found', 404, 'ALERTA_NOT_FOUND');
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    const updated = await resolveAlertaDocumentalRow(client, String(id));

    await registerAuditEntry({
      accion: 'UPDATE',
      after: updated,
      before: current,
      client,
      descripcion: 'Resolucion de alerta documental',
      ip: auditMeta?.ip ?? null,
      registro_id: String(id),
      tabla: 'alertas_documentales',
      user_agent: auditMeta?.user_agent ?? null,
      usuario_id: actorUserId
    });

    await client.query('COMMIT');
    const refreshed = await getAlertaDocumentalById(id, tenant);
    return refreshed ?? current;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const ignoreAlertaDocumental = async (
  id: number,
  actorUserId: string,
  tenant: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<AlertaDocumentalItem> => {
  const current = await getAlertaDocumentalById(id, tenant);

  if (!current) {
    throw new AppError('Alert not found', 404, 'ALERTA_NOT_FOUND');
  }

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query<AlertaDocumentalRow>(
      `
        UPDATE alertas_documentales
        SET
          estado = 'IGNORADA',
          activo = FALSE,
          updated_at = NOW()
        WHERE id = $1::bigint
        RETURNING
          id::text AS id,
          empresa_id::text AS empresa_id,
          contrato_id::text AS contrato_id,
          vinculacion_id::text AS vinculacion_id,
          persona_id::text AS persona_id,
          tipo_documento_id::text AS tipo_documento_id,
          tipo_alerta,
          severidad,
          estado,
          titulo,
          descripcion,
          fecha_alerta,
          fecha_vencimiento,
          dias_restantes,
          activo,
          created_at,
          updated_at,
          NULL::text AS empresa_nombre,
          NULL::text AS contrato_numero,
          NULL::text AS persona_nombre,
          NULL::text AS tipo_documento_codigo,
          NULL::text AS tipo_documento_nombre,
          NULL::text AS observacion
      `,
      [id]
    );

    const updated = result.rows[0];

    if (!updated) {
      throw new AppError('Failed to ignore alert', 500, 'ALERTA_IGNORE_FAILED');
    }

    await registerAuditEntry({
      accion: 'UPDATE',
      after: updated,
      before: current,
      client,
      descripcion: 'Alerta documental ignorada',
      ip: auditMeta?.ip ?? null,
      registro_id: String(id),
      tabla: 'alertas_documentales',
      user_agent: auditMeta?.user_agent ?? null,
      usuario_id: actorUserId
    });

    await client.query('COMMIT');
    const refreshed = await getAlertaDocumentalById(id, tenant);
    return refreshed ?? mapAlertRow(updated);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
