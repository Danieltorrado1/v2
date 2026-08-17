import type { Express } from 'express';
import type { PoolClient, QueryResultRow } from 'pg';

import { dbPool } from '../../config/db';
import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { createDocumentSignedUrlForBucket, uploadDocumentToStorage } from '../documentos/documentos.storage';
import { ensureTipoDocumentoExists } from '../documentos/documentos.validator';
import type {
  AnularContratoEventoInput,
  ContratoDocumentoAnularInput,
  ContratoDocumentoDevolverInput,
  ContratoDocumentoRevisionInput,
  ContratoDocumentoUploadInput,
  ContratoEventoListQuery,
  ContratoEstadoPatchInput,
  CreateContratoEventoInput,
  CreateContratoExcepcionInput,
  RegularizarContratoExcepcionInput,
  RevocarContratoExcepcionInput
} from './contratos.schemas';
import {
  calculateContratoChecklistCompletion,
  resolveContratoChecklistEstado,
  resolveContratoDocumentoEstado,
  resolveContratoEstadoPosterior,
  validateManualContratoStateChange,
  type ContratoEstado
} from './contratos.domain';

interface ActorMeta {
  ip: string | null;
  userAgent: string | null;
  userId: string;
}

interface ContratoDbRow extends QueryResultRow {
  id: string;
  empresa_id: string;
  empresa_nombre: string | null;
  numero_contrato: string;
  numero_licitacion: string | null;
  entidad_contratante: string;
  fecha_inicio: Date | string;
  fecha_finalizacion: Date | string | null;
  fecha_final_estimada: Date | string | null;
  fecha_final_real: Date | string | null;
  estado_contractual: ContratoEstado;
  contrato_padre_id: string | null;
  objeto_contractual: string | null;
  observaciones: string | null;
  aplica_cobertura: boolean;
  activo: boolean;
}

const CONTRACT_CATEGORIES = ['CREACION_EMPRESA_JURIDICA', 'INICIO_CONTRATO', 'EJECUCION', 'CIERRE'] as const;
const DOCUMENT_ALERT_WINDOW = 30;

const toNumber = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new AppError('Invalid numeric value', 500, 'INVALID_NUMERIC_VALUE');
  return parsed;
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  return toNumber(value);
};

const toDateString = (value: Date | string | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const toTimestampString = (value: Date | string | null): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const daysBetween = (fromIsoDate: string, toIsoDate: string): number => {
  const from = Date.parse(`${fromIsoDate}T00:00:00.000Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
};

const audit = async (client: PoolClient, actor: ActorMeta, action: string, table: string, recordId: string, before: unknown, after: unknown, description: string): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: actor.userId,
    accion: action,
    tabla: table,
    registro_id: recordId,
    descripcion: description,
    before,
    after,
    ip: actor.ip,
    user_agent: actor.userAgent
  });
};

const ensureTenantContractAccess = async (client: PoolClient, tenant: TenantAccessContext | undefined, contratoId: number): Promise<void> => {
  if (!tenant || tenant.isGlobalAdmin || tenant.contratoIds.includes(contratoId)) return;
  if (tenant.empresaIds.length === 0) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  const result = await client.query<{ empresa_id: string | null }>(`SELECT empresa_id::text AS empresa_id FROM contratos WHERE id = $1::bigint LIMIT 1`, [contratoId]);
  const empresaId = toNullableNumber(result.rows[0]?.empresa_id);
  if (empresaId === null || !tenant.empresaIds.includes(empresaId)) throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
};

const loadContrato = async (client: PoolClient, contratoId: number, forUpdate = false): Promise<ContratoDbRow> => {
  const result = await client.query<ContratoDbRow>(`
    SELECT
      c.id::text AS id,
      c.empresa_id::text AS empresa_id,
      e.nombre_empresa AS empresa_nombre,
      c.numero_contrato,
      c.numero_licitacion,
      c.entidad_contratante,
      c.fecha_inicio,
      c.fecha_finalizacion,
      c.fecha_final_estimada,
      c.fecha_final_real,
      c.estado_contractual,
      c.contrato_padre_id::text AS contrato_padre_id,
      c.objeto_contractual,
      c.observaciones,
      c.aplica_cobertura,
      COALESCE(c.activo, TRUE) AS activo
    FROM contratos c
    INNER JOIN empresas e ON e.id = c.empresa_id
    WHERE c.id = $1::bigint
    LIMIT 1
    ${forUpdate ? 'FOR UPDATE' : ''}
  `, [contratoId]);
  const row = result.rows[0];
  if (!row) throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  return row;
};

const mapContrato = (row: ContratoDbRow) => ({
  id: toNumber(row.id),
  empresa: { id: toNumber(row.empresa_id), nombre_empresa: row.empresa_nombre },
  numero_contrato: row.numero_contrato,
  numero_licitacion: row.numero_licitacion,
  entidad_contratante: row.entidad_contratante,
  fecha_inicio: toDateString(row.fecha_inicio),
  fecha_finalizacion: toDateString(row.fecha_final_estimada ?? row.fecha_finalizacion),
  fecha_final_estimada: toDateString(row.fecha_final_estimada ?? row.fecha_finalizacion),
  fecha_final_real: toDateString(row.fecha_final_real),
  estado_contractual: row.estado_contractual,
  contrato_padre_id: toNullableNumber(row.contrato_padre_id),
  objeto_contractual: row.objeto_contractual,
  observaciones: row.observaciones,
  aplica_cobertura: row.aplica_cobertura,
  activo: row.activo
});

const ensureContractRequirement = async (client: PoolClient, contratoId: number, requisitoId: number): Promise<void> => {
  const result = await client.query<{ id: string }>(`SELECT id::text AS id FROM contrato_documento_requisitos WHERE id = $1::bigint AND contrato_id = $2::bigint AND activo = TRUE LIMIT 1`, [requisitoId, contratoId]);
  if (!result.rows[0]) throw new AppError('Requisito contractual not found', 404, 'CONTRATO_REQUISITO_NOT_FOUND');
};

const ensureContractDocument = async (client: PoolClient, contratoId: number, documentoId: number): Promise<void> => {
  const result = await client.query<{ id: string }>(`SELECT id::text AS id FROM documentos_contrato WHERE id = $1::bigint AND contrato_id = $2::bigint LIMIT 1`, [documentoId, contratoId]);
  if (!result.rows[0]) throw new AppError('Documento contractual not found', 404, 'CONTRATO_DOCUMENTO_NOT_FOUND');
};
const loadEventos = async (client: PoolClient, contratoId: number, query?: ContratoEventoListQuery) => {
  const conditions = ['ce.contrato_id = $1::bigint'];
  const params: unknown[] = [contratoId];
  if (query?.tipo_evento) {
    params.push(query.tipo_evento);
    conditions.push(`ce.tipo_evento = $${params.length}`);
  }
  const whereClause = `WHERE ${conditions.join(' AND ')}`;
  const countResult = await client.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM contrato_eventos ce ${whereClause}`, params);
  const total = countResult.rows[0]?.total ?? 0;
  const page = query?.page ?? 1;
  const limit = query?.limit ?? Math.max(total, 1);
  const offset = (page - 1) * limit;
  const listParams = [...params, limit, offset];
  const result = await client.query<QueryResultRow>(`
    SELECT
      ce.id::text AS id,
      ce.tipo_evento,
      ce.fecha_evento,
      ce.fecha_efecto_desde,
      ce.fecha_efecto_hasta,
      ce.descripcion,
      ce.motivo,
      ce.documento_soporte_id::text AS documento_soporte_id,
      ce.datos_anteriores,
      ce.datos_posteriores,
      ce.estado_evento,
      ce.motivo_anulacion,
      ce.activo,
      ce.anulado_at,
      ce.created_at,
      ce.usuario_creador_id::text AS usuario_creador_id,
      u.nombre_completo AS usuario_creador_nombre
    FROM contrato_eventos ce
    LEFT JOIN usuarios u ON u.id = ce.usuario_creador_id
    ${whereClause}
    ORDER BY ce.fecha_evento DESC, ce.id DESC
    LIMIT $${listParams.length - 1}::int OFFSET $${listParams.length}::int
  `, listParams);
  return {
    items: result.rows.map((row) => ({
      id: toNumber(String(row.id)),
      tipo_evento: row.tipo_evento,
      fecha_evento: toDateString(row.fecha_evento as Date | string | null),
      fecha_efecto_desde: toDateString(row.fecha_efecto_desde as Date | string | null),
      fecha_efecto_hasta: toDateString(row.fecha_efecto_hasta as Date | string | null),
      descripcion: row.descripcion as string | null,
      motivo: row.motivo as string | null,
      documento_soporte_id: toNullableNumber(row.documento_soporte_id as string | number | null),
      datos_anteriores: row.datos_anteriores as Record<string, unknown> | null,
      datos_posteriores: row.datos_posteriores as Record<string, unknown> | null,
      estado_evento: row.estado_evento,
      motivo_anulacion: row.motivo_anulacion as string | null,
      activo: Boolean(row.activo),
      anulado_at: toTimestampString(row.anulado_at as Date | string | null),
      created_at: toTimestampString(row.created_at as Date | string | null),
      usuario_creador: {
        id: toNullableNumber(row.usuario_creador_id as string | number | null),
        nombre: row.usuario_creador_nombre as string | null
      }
    })),
    pagination: { page, limit, total, total_pages: total === 0 ? 0 : Math.ceil(total / limit) }
  };
};

const loadDocumentos = async (client: PoolClient, contratoId: number) => {
  const result = await client.query<QueryResultRow>(`
    SELECT
      dc.id::text AS id,
      dc.contrato_id::text AS contrato_id,
      dc.requisito_id::text AS requisito_id,
      dc.categoria,
      dc.storage_bucket,
      dc.storage_path,
      dc.nombre_original,
      dc.mime_type,
      dc.tamano_bytes,
      dc.fecha_expedicion,
      dc.fecha_vencimiento,
      dc.fecha_carga,
      dc.vigencia_dias_configurada,
      dc.version,
      dc.documento_reemplaza_id::text AS documento_reemplaza_id,
      dc.es_vigente,
      dc.estado_revision,
      dc.motivo_devolucion,
      dc.revisado_por_usuario_id::text AS revisado_por_usuario_id,
      u.nombre_completo AS revisado_por_usuario_nombre,
      dc.revisado_at,
      dc.observaciones,
      dc.activo,
      td.id::text AS tipo_documento_id,
      td.codigo AS tipo_documento_codigo,
      td.nombre_documento AS tipo_documento_nombre
    FROM documentos_contrato dc
    INNER JOIN tipos_documentos td ON td.id = dc.tipo_documento_id
    LEFT JOIN usuarios u ON u.id = dc.revisado_por_usuario_id
    WHERE dc.contrato_id = $1::bigint
    ORDER BY dc.categoria ASC, dc.fecha_carga DESC, dc.version DESC, dc.id DESC
  `, [contratoId]);
  const currentDate = todayIso();
  return result.rows.map((row) => ({
    id: toNumber(String(row.id)),
    contrato_id: toNumber(String(row.contrato_id)),
    requisito_id: toNullableNumber(row.requisito_id as string | number | null),
    categoria: row.categoria as string,
    storage_bucket: row.storage_bucket as string,
    storage_path: row.storage_path as string,
    nombre_original: row.nombre_original as string,
    mime_type: row.mime_type as string,
    tamano_bytes: toNumber(row.tamano_bytes as string | number),
    fecha_expedicion: toDateString(row.fecha_expedicion as Date | string | null),
    fecha_vencimiento: toDateString(row.fecha_vencimiento as Date | string | null),
    fecha_carga: toTimestampString(row.fecha_carga as Date | string | null),
    vigencia_dias_configurada: toNullableNumber(row.vigencia_dias_configurada as string | number | null),
    version: toNumber(row.version as string | number),
    documento_reemplaza_id: toNullableNumber(row.documento_reemplaza_id as string | number | null),
    es_vigente: Boolean(row.es_vigente),
    estado_revision: row.estado_revision as string,
    estado_documental: resolveContratoDocumentoEstado({
      activo: Boolean(row.activo),
      es_vigente: Boolean(row.es_vigente),
      estado_revision: row.estado_revision as never,
      fecha_vencimiento: toDateString(row.fecha_vencimiento as Date | string | null),
      dias_alerta: DOCUMENT_ALERT_WINDOW
    }, currentDate),
    motivo_devolucion: row.motivo_devolucion as string | null,
    revisado_at: toTimestampString(row.revisado_at as Date | string | null),
    revisado_por: {
      id: toNullableNumber(row.revisado_por_usuario_id as string | number | null),
      nombre: row.revisado_por_usuario_nombre as string | null
    },
    observaciones: row.observaciones as string | null,
    activo: Boolean(row.activo),
    tipo_documento: {
      id: toNumber(String(row.tipo_documento_id)),
      codigo: row.tipo_documento_codigo as string | null,
      nombre: row.tipo_documento_nombre as string | null
    }
  }));
};

const loadExcepciones = async (client: PoolClient, contratoId: number) => {
  const result = await client.query<QueryResultRow>(`
    SELECT
      e.id::text AS id,
      e.contrato_id::text AS contrato_id,
      e.requisito_id::text AS requisito_id,
      r.nombre_requisito AS requisito_nombre,
      e.documento_id::text AS documento_id,
      d.nombre_original AS documento_nombre_original,
      e.motivo,
      e.usuario_autorizador_id::text AS usuario_autorizador_id,
      ua.nombre_completo AS usuario_autorizador_nombre,
      e.fecha_autorizacion,
      e.fecha_limite_regularizacion,
      e.soporte_documento_id::text AS soporte_documento_id,
      e.estado,
      e.observaciones,
      e.regularizada_por_usuario_id::text AS regularizada_por_usuario_id,
      ur.nombre_completo AS regularizada_por_usuario_nombre,
      e.regularizada_at,
      e.revocada_por_usuario_id::text AS revocada_por_usuario_id,
      uv.nombre_completo AS revocada_por_usuario_nombre,
      e.revocada_at,
      e.motivo_revocacion,
      e.activo,
      e.created_at
    FROM contrato_excepciones_documentales e
    LEFT JOIN contrato_documento_requisitos r ON r.id = e.requisito_id
    LEFT JOIN documentos_contrato d ON d.id = e.documento_id
    LEFT JOIN usuarios ua ON ua.id = e.usuario_autorizador_id
    LEFT JOIN usuarios ur ON ur.id = e.regularizada_por_usuario_id
    LEFT JOIN usuarios uv ON uv.id = e.revocada_por_usuario_id
    WHERE e.contrato_id = $1::bigint
    ORDER BY e.fecha_autorizacion DESC, e.id DESC
  `, [contratoId]);
  return result.rows.map((row) => ({
    id: toNumber(String(row.id)),
    contrato_id: toNumber(String(row.contrato_id)),
    requisito: { id: toNullableNumber(row.requisito_id as string | number | null), nombre: row.requisito_nombre as string | null },
    documento: { id: toNullableNumber(row.documento_id as string | number | null), nombre_original: row.documento_nombre_original as string | null },
    motivo: row.motivo as string,
    usuario_autorizador: { id: toNumber(String(row.usuario_autorizador_id)), nombre: row.usuario_autorizador_nombre as string | null },
    fecha_autorizacion: toTimestampString(row.fecha_autorizacion as Date | string | null),
    fecha_limite_regularizacion: toDateString(row.fecha_limite_regularizacion as Date | string | null),
    soporte_documento_id: toNullableNumber(row.soporte_documento_id as string | number | null),
    estado: row.estado as string,
    observaciones: row.observaciones as string | null,
    regularizacion: { at: toTimestampString(row.regularizada_at as Date | string | null), by: { id: toNullableNumber(row.regularizada_por_usuario_id as string | number | null), nombre: row.regularizada_por_usuario_nombre as string | null } },
    revocacion: { at: toTimestampString(row.revocada_at as Date | string | null), by: { id: toNullableNumber(row.revocada_por_usuario_id as string | number | null), nombre: row.revocada_por_usuario_nombre as string | null } },
    motivo_revocacion: row.motivo_revocacion as string | null,
    activo: Boolean(row.activo),
    created_at: toTimestampString(row.created_at as Date | string | null)
  }));
};

type ContratoDocumentoItem = Awaited<ReturnType<typeof loadDocumentos>>[number];
type ContratoExcepcionItem = Awaited<ReturnType<typeof loadExcepciones>>[number];

const buildChecklist = async (client: PoolClient, contratoId: number) => {
  const [requisitosResult, documentos, excepciones] = await Promise.all([
    client.query<QueryResultRow>(`
      SELECT
        r.id::text AS id,
        r.categoria,
        r.nombre_requisito,
        r.obligatorio,
        r.criticidad,
        r.bloquea_creacion,
        r.bloquea_inicio,
        r.bloquea_ejecucion,
        r.bloquea_cierre,
        r.responsable,
        r.tipo_documento_id::text AS tipo_documento_id,
        td.codigo AS tipo_documento_codigo,
        td.nombre_documento AS tipo_documento_nombre,
        td.alcance AS tipo_documento_alcance
      FROM contrato_documento_requisitos r
      LEFT JOIN tipos_documentos td ON td.id = r.tipo_documento_id
      WHERE r.contrato_id = $1::bigint AND r.activo = TRUE
      ORDER BY r.categoria ASC, r.orden ASC, r.id ASC
    `, [contratoId]),
    loadDocumentos(client, contratoId),
    loadExcepciones(client, contratoId)
  ]);
  const docByReq = new Map<number, ContratoDocumentoItem>();
  const docByType = new Map<number, ContratoDocumentoItem>();
  const openExcByReq = new Map<number, ContratoExcepcionItem>();
  for (const doc of documentos) {
    if (doc.es_vigente && doc.activo) {
      if (doc.requisito_id !== null && !docByReq.has(doc.requisito_id)) docByReq.set(doc.requisito_id, doc);
      if (!docByType.has(doc.tipo_documento.id)) docByType.set(doc.tipo_documento.id, doc);
    }
  }
  for (const exc of excepciones) {
    if (exc.estado === 'ABIERTA' && exc.requisito.id !== null && !openExcByReq.has(exc.requisito.id)) openExcByReq.set(exc.requisito.id, exc);
  }
  const items = requisitosResult.rows.map((row) => {
    const requirementId = toNumber(String(row.id));
    const typeId = toNullableNumber(row.tipo_documento_id as string | number | null);
    const document = docByReq.get(requirementId) ?? (typeId !== null ? docByType.get(typeId) ?? null : null);
    const exception = openExcByReq.get(requirementId) ?? null;
    const status = resolveContratoChecklistEstado({
      obligatorio: Boolean(row.obligatorio),
      no_aplica: !Boolean(row.obligatorio) && !document && !exception,
      documento_estado: document?.estado_documental ?? null,
      excepcion_estado: (exception?.estado ?? null) as never
    });
    return {
      requisito_id: requirementId,
      categoria: row.categoria as string,
      nombre_requisito: row.nombre_requisito as string,
      obligatorio: Boolean(row.obligatorio),
      criticidad: row.criticidad as string,
      responsable: row.responsable as string | null,
      bloquea_creacion: Boolean(row.bloquea_creacion),
      bloquea_inicio: Boolean(row.bloquea_inicio),
      bloquea_ejecucion: Boolean(row.bloquea_ejecucion),
      bloquea_cierre: Boolean(row.bloquea_cierre),
      documento_actual: document,
      excepcion_actual: exception,
      estado: status,
      fecha_vencimiento: document?.fecha_vencimiento ?? null,
      observacion: document?.estado_documental === 'DEVUELTO' ? document.motivo_devolucion : null,
      tipo_documento: { id: typeId, codigo: row.tipo_documento_codigo as string | null, nombre: row.tipo_documento_nombre as string | null, alcance: row.tipo_documento_alcance as string | null }
    };
  });
  const states = items.map((item) => item.estado);
  return {
    items,
    completitud_porcentaje: calculateContratoChecklistCompletion(states),
    resumen: {
      cumplidos: items.filter((item) => item.estado === 'CUMPLIDO').length,
      pendientes: items.filter((item) => item.estado === 'PENDIENTE').length,
      vencidos: items.filter((item) => item.estado === 'VENCIDO').length,
      en_revision: items.filter((item) => item.estado === 'EN_REVISION').length,
      devueltos: items.filter((item) => item.estado === 'DEVUELTO').length,
      aprobado_provisional: items.filter((item) => item.estado === 'APROBADO_PROVISIONAL').length,
      no_aplica: items.filter((item) => item.estado === 'NO_APLICA').length
    }
  };
};

const buildDynamicAlerts = (contract: ReturnType<typeof mapContrato>, checklist: Awaited<ReturnType<typeof buildChecklist>>, events: Awaited<ReturnType<typeof loadEventos>>['items'], exceptions: Awaited<ReturnType<typeof loadExcepciones>>) => {
  const alerts: Array<Record<string, unknown>> = [];
  const seenAlertKeys = new Set<string>();
  const currentDate = todayIso();
  let seq = 1;

  const pushAlert = (alert: Record<string, unknown>, dedupeKey: string) => {
    if (seenAlertKeys.has(dedupeKey)) {
      return;
    }

    seenAlertKeys.add(dedupeKey);
    alerts.push(alert);
  };

  for (const item of checklist.items) {
    if (item.documento_actual?.estado_documental === 'DEVUELTO') {
      pushAlert({ id: -seq++, tipo_alerta: 'DOCUMENTO_DEVUELTO', severidad: 'ALTA', estado: 'ACTIVA', titulo: `Documento devuelto: ${item.nombre_requisito}`, descripcion: item.documento_actual.motivo_devolucion ?? 'Documento devuelto para ajuste.', fecha_alerta: currentDate, fecha_vencimiento: item.fecha_vencimiento, dias_restantes: item.fecha_vencimiento ? daysBetween(currentDate, item.fecha_vencimiento) : null, activo: true, created_at: null, updated_at: null, tipo_documento_id: item.tipo_documento.id, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=expediente` }, `DOCUMENTO_DEVUELTO:${item.requisito_id}`);
    }

    if (item.criticidad === 'CRITICA' && ['PENDIENTE', 'VENCIDO', 'DEVUELTO'].includes(item.estado)) {
      pushAlert({ id: -seq++, tipo_alerta: 'REQUISITO_CRITICO_PENDIENTE', severidad: 'CRITICA', estado: 'ACTIVA', titulo: `Requisito critico pendiente: ${item.nombre_requisito}`, descripcion: `El requisito ${item.nombre_requisito} requiere regularizacion inmediata.`, fecha_alerta: currentDate, fecha_vencimiento: item.fecha_vencimiento, dias_restantes: item.fecha_vencimiento ? daysBetween(currentDate, item.fecha_vencimiento) : null, activo: true, created_at: null, updated_at: null, tipo_documento_id: item.tipo_documento.id, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=checklist` }, `REQUISITO_CRITICO_PENDIENTE:${item.requisito_id}`);
    }
  }

  for (const exception of exceptions) {
    if (exception.estado !== 'ABIERTA') continue;
    const days = daysBetween(currentDate, String(exception.fecha_limite_regularizacion));
    if (days < 0 || days <= 7) {
      pushAlert({ id: -seq++, tipo_alerta: days < 0 ? 'EXCEPCION_VENCIDA' : 'EXCEPCION_POR_VENCER', severidad: days < 0 ? 'CRITICA' : days <= 2 ? 'ALTA' : 'MEDIA', estado: 'ACTIVA', titulo: `${days < 0 ? 'Excepcion vencida' : 'Excepcion por vencer'}: ${exception.requisito.nombre ?? exception.documento.nombre_original ?? exception.id}`, descripcion: days < 0 ? 'La excepcion supero su fecha limite.' : `La excepcion vence en ${days} dias.`, fecha_alerta: currentDate, fecha_vencimiento: exception.fecha_limite_regularizacion, dias_restantes: days, activo: true, created_at: null, updated_at: null, tipo_documento_id: null, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=excepciones` }, `${days < 0 ? 'EXCEPCION_VENCIDA' : 'EXCEPCION_POR_VENCER'}:${exception.id}`);
    }
  }

  if (contract.estado_contractual === 'SUSPENDIDO') {
    pushAlert({ id: -seq++, tipo_alerta: 'CONTRATO_SUSPENDIDO', severidad: 'CRITICA', estado: 'ACTIVA', titulo: 'Contrato suspendido', descripcion: 'El contrato se encuentra en estado suspendido.', fecha_alerta: currentDate, fecha_vencimiento: null, dias_restantes: null, activo: true, created_at: null, updated_at: null, tipo_documento_id: null, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=resumen` }, `CONTRATO_SUSPENDIDO:${contract.id}`);
  }

  if (contract.fecha_final_estimada && !['FINALIZADO', 'LIQUIDADO', 'ANULADO'].includes(contract.estado_contractual)) {
    const days = daysBetween(currentDate, contract.fecha_final_estimada);
    if (days >= 0 && days <= 30) {
      pushAlert({ id: -seq++, tipo_alerta: 'CONTRATO_POR_VENCER', severidad: days <= 7 ? 'ALTA' : 'MEDIA', estado: 'ACTIVA', titulo: 'Contrato proximo a fecha final estimada', descripcion: `El contrato alcanza su fecha final estimada en ${days} dias.`, fecha_alerta: currentDate, fecha_vencimiento: contract.fecha_final_estimada, dias_restantes: days, activo: true, created_at: null, updated_at: null, tipo_documento_id: null, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=resumen` }, `CONTRATO_POR_VENCER:${contract.id}:${contract.fecha_final_estimada}`);
    }
  }

  const hasActaInicio = events.some((item) => item.tipo_evento === 'ACTA_INICIO' && item.activo);
  if (!hasActaInicio && ['PENDIENTE_INICIO', 'ACTIVO', 'PRORROGADO', 'SUSPENDIDO'].includes(contract.estado_contractual)) {
    pushAlert({ id: -seq++, tipo_alerta: 'CONTRATO_SIN_ACTA_INICIO', severidad: 'ALTA', estado: 'ACTIVA', titulo: 'Contrato sin acta de inicio', descripcion: 'No hay acta de inicio registrada en el historial contractual.', fecha_alerta: currentDate, fecha_vencimiento: null, dias_restantes: null, activo: true, created_at: null, updated_at: null, tipo_documento_id: null, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=eventos` }, `CONTRATO_SIN_ACTA_INICIO:${contract.id}`);
  }

  for (const event of events) {
    if (event.activo && event.documento_soporte_id === null && ['PRORROGA', 'ADICION', 'OTROSI', 'MODIFICACION', 'SUSPENSION', 'REINICIO', 'TERMINACION', 'LIQUIDACION'].includes(String(event.tipo_evento))) {
      pushAlert({ id: -seq++, tipo_alerta: 'EVENTO_SIN_SOPORTE', severidad: 'MEDIA', estado: 'ACTIVA', titulo: `Evento pendiente de soporte: ${event.tipo_evento}`, descripcion: 'La actuacion contractual requiere documento soporte.', fecha_alerta: currentDate, fecha_vencimiento: null, dias_restantes: null, activo: true, created_at: null, updated_at: null, tipo_documento_id: null, ruta_accion: `/admin?tab=contratos&contrato=${contract.id}&view=eventos` }, `EVENTO_SIN_SOPORTE:${event.id}`);
    }
  }

  return alerts;
};

const normalizeLookupText = (value: string): string => {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
};

interface RequirementSeedDefinition {
  categoria: (typeof CONTRACT_CATEGORIES)[number];
  criticidad: 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
  nombre: string;
  orden: number;
}

const DEFAULT_REQUIREMENTS: RequirementSeedDefinition[] = [
  { categoria: 'CREACION_EMPRESA_JURIDICA', nombre: 'RUT', criticidad: 'ALTA', orden: 10 },
  { categoria: 'CREACION_EMPRESA_JURIDICA', nombre: 'Acta de conformacion', criticidad: 'MEDIA', orden: 20 },
  { categoria: 'CREACION_EMPRESA_JURIDICA', nombre: 'NIT', criticidad: 'ALTA', orden: 30 },
  { categoria: 'CREACION_EMPRESA_JURIDICA', nombre: 'Certificado bancario', criticidad: 'MEDIA', orden: 40 },
  { categoria: 'CREACION_EMPRESA_JURIDICA', nombre: 'Representacion legal', criticidad: 'ALTA', orden: 50 },
  { categoria: 'CREACION_EMPRESA_JURIDICA', nombre: 'Documentos de participantes', criticidad: 'MEDIA', orden: 60 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Contrato firmado', criticidad: 'CRITICA', orden: 70 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Acta de inicio', criticidad: 'CRITICA', orden: 80 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Polizas', criticidad: 'CRITICA', orden: 90 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Aprobacion de polizas', criticidad: 'ALTA', orden: 100 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Afiliacion ARL de empresa', criticidad: 'ALTA', orden: 110 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Certificados iniciales', criticidad: 'MEDIA', orden: 120 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Cronograma', criticidad: 'MEDIA', orden: 130 },
  { categoria: 'INICIO_CONTRATO', nombre: 'Designacion de supervisor', criticidad: 'ALTA', orden: 140 },
  { categoria: 'EJECUCION', nombre: 'Otrosies', criticidad: 'MEDIA', orden: 150 },
  { categoria: 'EJECUCION', nombre: 'Prorrogas', criticidad: 'MEDIA', orden: 160 },
  { categoria: 'EJECUCION', nombre: 'Adiciones', criticidad: 'MEDIA', orden: 170 },
  { categoria: 'EJECUCION', nombre: 'Suspensiones', criticidad: 'ALTA', orden: 180 },
  { categoria: 'EJECUCION', nombre: 'Reinicios', criticidad: 'ALTA', orden: 190 },
  { categoria: 'EJECUCION', nombre: 'Comunicaciones', criticidad: 'MEDIA', orden: 200 },
  { categoria: 'EJECUCION', nombre: 'Requerimientos', criticidad: 'ALTA', orden: 210 },
  { categoria: 'EJECUCION', nombre: 'Informes', criticidad: 'MEDIA', orden: 220 },
  { categoria: 'EJECUCION', nombre: 'Modificaciones de cobertura', criticidad: 'MEDIA', orden: 230 },
  { categoria: 'CIERRE', nombre: 'Acta de terminacion', criticidad: 'CRITICA', orden: 240 },
  { categoria: 'CIERRE', nombre: 'Acta de liquidacion', criticidad: 'CRITICA', orden: 250 },
  { categoria: 'CIERRE', nombre: 'Paz y salvo', criticidad: 'ALTA', orden: 260 },
  { categoria: 'CIERRE', nombre: 'Informe final', criticidad: 'ALTA', orden: 270 }
];

const findMatchingTipoDocumentoId = async (client: PoolClient, requirementName: string): Promise<number | null> => {
  const result = await client.query<QueryResultRow>(`
    SELECT id::text AS id, codigo, nombre_documento, alcance
    FROM tipos_documentos
    WHERE COALESCE(activo, TRUE) = TRUE
      AND (alcance = 'CONTRATO' OR alcance = 'GENERAL' OR alcance IS NULL)
    ORDER BY id ASC
  `);
  const normalizedRequirement = normalizeLookupText(requirementName);
  const exact = result.rows.find((row) => {
    const code = row.codigo ? normalizeLookupText(String(row.codigo)) : '';
    const name = row.nombre_documento ? normalizeLookupText(String(row.nombre_documento)) : '';
    return code === normalizedRequirement || name === normalizedRequirement;
  });
  if (exact) {
    return toNumber(String(exact.id));
  }
  const partial = result.rows.find((row) => {
    const name = row.nombre_documento ? normalizeLookupText(String(row.nombre_documento)) : '';
    return normalizedRequirement.includes(name) || name.includes(normalizedRequirement);
  });
  return partial ? toNumber(String(partial.id)) : null;
};

const ensureContractScaffold = async (client: PoolClient, contractRow: ContratoDbRow, actor?: ActorMeta): Promise<void> => {
  const contractId = toNumber(contractRow.id);
  const requirementCountResult = await client.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM contrato_documento_requisitos WHERE contrato_id = $1::bigint`, [contractId]);
  if ((requirementCountResult.rows[0]?.total ?? 0) === 0) {
    for (const definition of DEFAULT_REQUIREMENTS) {
      const tipoDocumentoId = await findMatchingTipoDocumentoId(client, definition.nombre);
      await client.query(`
        INSERT INTO contrato_documento_requisitos (
          contrato_id, tipo_documento_id, categoria, codigo_requisito, nombre_requisito,
          obligatorio, criticidad, bloquea_creacion, bloquea_inicio, bloquea_ejecucion,
          bloquea_cierre, solo_alerta, responsable, plazo_regularizacion_dias, orden, activo
        )
        VALUES (
          $1::bigint, $2::bigint, $3, $4, $5,
          TRUE, $6, FALSE, FALSE, FALSE,
          FALSE, TRUE, NULL, NULL, $7::int, TRUE
        )
        ON CONFLICT (contrato_id, nombre_requisito) DO NOTHING
      `, [contractId, tipoDocumentoId, definition.categoria, normalizeLookupText(definition.nombre).replace(/\s+/g, '_'), definition.nombre, definition.criticidad, definition.orden]);
    }
  }

  const eventCountResult = await client.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM contrato_eventos WHERE contrato_id = $1::bigint`, [contractId]);
  if ((eventCountResult.rows[0]?.total ?? 0) === 0) {
    await client.query(`
      INSERT INTO contrato_eventos (
        contrato_id, tipo_evento, fecha_evento, descripcion, motivo,
        usuario_creador_id, datos_anteriores, datos_posteriores, estado_evento, activo
      )
      VALUES ($1::bigint, 'CREACION', $2::date, $3, NULL, $4::bigint, NULL, $5::jsonb, 'ACTIVO', TRUE)
    `, [
      contractId,
      toDateString(contractRow.fecha_inicio) ?? todayIso(),
      'Creacion inicial del contrato',
      actor?.userId ? toNumber(actor.userId) : null,
      JSON.stringify(mapContrato(contractRow))
    ]);
  }
};

const ensureContractRow = async (
  client: PoolClient,
  contratoId: number,
  tenant?: TenantAccessContext,
  options?: { forUpdate?: boolean; withScaffold?: boolean; actor?: ActorMeta }
): Promise<ContratoDbRow> => {
  await ensureTenantContractAccess(client, tenant, contratoId);
  const contractRow = await loadContrato(client, contratoId, options?.forUpdate ?? false);
  if (options?.withScaffold) {
    await ensureContractScaffold(client, contractRow, options.actor);
  }
  return contractRow;
};

const updateContractLifecycleState = async (
  client: PoolClient,
  contractId: number,
  nextValues: {
    estado_contractual: ContratoEstado;
    fecha_final_estimada: string | null;
    fecha_final_real: string | null;
    observaciones: string | null;
  }
): Promise<ContratoDbRow> => {
  const result = await client.query<ContratoDbRow>(`
    UPDATE contratos
    SET
      estado_contractual = $2,
      fecha_final_estimada = $3::date,
      fecha_finalizacion = $3::date,
      fecha_final_real = $4::date,
      observaciones = $5
    WHERE id = $1::bigint
    RETURNING
      id::text AS id,
      empresa_id::text AS empresa_id,
      (SELECT nombre_empresa FROM empresas WHERE id = contratos.empresa_id) AS empresa_nombre,
      numero_contrato,
      numero_licitacion,
      entidad_contratante,
      fecha_inicio,
      fecha_finalizacion,
      fecha_final_estimada,
      fecha_final_real,
      estado_contractual,
      contrato_padre_id::text AS contrato_padre_id,
      objeto_contractual,
      observaciones,
      aplica_cobertura,
      COALESCE(activo, TRUE) AS activo
  `, [contractId, nextValues.estado_contractual, nextValues.fecha_final_estimada, nextValues.fecha_final_real, nextValues.observaciones]);
  const row = result.rows[0];
  if (!row) {
    throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  }
  return row;
};

export const getContratoContractualDetail = async (contratoId: number, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    const contractRow = await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    const contrato = mapContrato(contractRow);
    const [checklist, eventos, excepciones, documentos] = await Promise.all([
      buildChecklist(client, contratoId),
      loadEventos(client, contratoId, { page: 1, limit: 10 }),
      loadExcepciones(client, contratoId),
      loadDocumentos(client, contratoId)
    ]);
    return {
      contrato,
      resumen: {
        completitud_porcentaje: checklist.completitud_porcentaje,
        proximos_vencimientos: documentos.filter((item) => item.estado_documental === 'PROXIMO_A_VENCER').slice(0, 5),
        requisitos_criticos: checklist.items.filter((item) => item.criticidad === 'CRITICA' && ['PENDIENTE', 'VENCIDO', 'DEVUELTO'].includes(item.estado)),
        ultimas_actuaciones: eventos.items.slice(0, 5)
      },
      expediente: {
        categorias: CONTRACT_CATEGORIES.map((categoria) => ({
          categoria,
          documentos: documentos.filter((item) => item.categoria === categoria)
        }))
      },
      checklist,
      eventos,
      excepciones,
      alertas: buildDynamicAlerts(contrato, checklist, eventos.items, excepciones)
    };
  } finally {
    client.release();
  }
};

export const getContratoExpediente = async (contratoId: number, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    const contractRow = await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    const contrato = mapContrato(contractRow);
    const [documentos, checklist] = await Promise.all([
      loadDocumentos(client, contratoId),
      buildChecklist(client, contratoId)
    ]);
    return {
      contrato,
      categorias: CONTRACT_CATEGORIES.map((categoria) => ({
        categoria,
        documentos: documentos.filter((item) => item.categoria === categoria)
      })),
      checklist_resumen: checklist.resumen,
      completitud_porcentaje: checklist.completitud_porcentaje
    };
  } finally {
    client.release();
  }
};

export const getContratoChecklist = async (contratoId: number, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    return buildChecklist(client, contratoId);
  } finally {
    client.release();
  }
};

export const getContratoEventos = async (contratoId: number, query: ContratoEventoListQuery, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    return loadEventos(client, contratoId, query);
  } finally {
    client.release();
  }
};

export const getContratoExcepciones = async (contratoId: number, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    return loadExcepciones(client, contratoId);
  } finally {
    client.release();
  }
};

export const getContratoAlertas = async (contratoId: number, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    const contractRow = await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    const contrato = mapContrato(contractRow);
    const [checklist, eventos, excepciones] = await Promise.all([
      buildChecklist(client, contratoId),
      loadEventos(client, contratoId, { page: 1, limit: 100 }),
      loadExcepciones(client, contratoId)
    ]);
    return buildDynamicAlerts(contrato, checklist, eventos.items, excepciones);
  } finally {
    client.release();
  }
};

export const createContratoEvento = async (
  contratoId: number,
  input: CreateContratoEventoInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const currentRow = await ensureContractRow(client, contratoId, tenant, {
      forUpdate: true,
      withScaffold: true,
      actor
    });
    if (input.documento_soporte_id !== undefined) {
      await ensureContractDocument(client, contratoId, input.documento_soporte_id);
    }

    const beforeContrato = mapContrato(currentRow);
    const transition = resolveContratoEstadoPosterior(currentRow.estado_contractual, input.tipo_evento);
    if (!transition.allowed) {
      throw new AppError(transition.reason ?? 'Invalid contract transition', 409, 'CONTRATO_EVENTO_INVALIDO');
    }

    const nextFechaFinalEstimada = Object.prototype.hasOwnProperty.call(input.cambios_contrato, 'fecha_final_estimada')
      ? input.cambios_contrato.fecha_final_estimada ?? null
      : beforeContrato.fecha_final_estimada;
    const nextFechaFinalReal = Object.prototype.hasOwnProperty.call(input.cambios_contrato, 'fecha_final_real')
      ? input.cambios_contrato.fecha_final_real ?? null
      : beforeContrato.fecha_final_real;
    const nextObservaciones = Object.prototype.hasOwnProperty.call(input.cambios_contrato, 'observaciones')
      ? input.cambios_contrato.observaciones ?? null
      : beforeContrato.observaciones;

    if (input.tipo_evento === 'PRORROGA' && !nextFechaFinalEstimada) {
      throw new AppError('La prorroga requiere una nueva fecha final estimada.', 422, 'CONTRATO_PRORROGA_REQUIERE_FECHA');
    }
    if (input.tipo_evento === 'TERMINACION' && !nextFechaFinalReal) {
      throw new AppError('La terminacion requiere fecha final real.', 422, 'CONTRATO_TERMINACION_REQUIERE_FECHA');
    }

    const updatedRow = await updateContractLifecycleState(client, contratoId, {
      estado_contractual: transition.nextState,
      fecha_final_estimada: nextFechaFinalEstimada,
      fecha_final_real: nextFechaFinalReal,
      observaciones: nextObservaciones
    });
    const afterContrato = mapContrato(updatedRow);

    await client.query(`
      INSERT INTO contrato_eventos (
        contrato_id, tipo_evento, fecha_evento, fecha_efecto_desde, fecha_efecto_hasta,
        descripcion, motivo, documento_soporte_id, usuario_creador_id,
        datos_anteriores, datos_posteriores, estado_evento, activo
      )
      VALUES (
        $1::bigint, $2, $3::date, $4::date, $5::date,
        $6, $7, $8::bigint, $9::bigint,
        $10::jsonb, $11::jsonb, 'ACTIVO', TRUE
      )
    `, [
      contratoId,
      input.tipo_evento,
      input.fecha_evento,
      input.fecha_efecto_desde,
      input.fecha_efecto_hasta,
      input.descripcion,
      input.motivo,
      input.documento_soporte_id ?? null,
      toNumber(actor.userId),
      JSON.stringify(beforeContrato),
      JSON.stringify(afterContrato)
    ]);

    await audit(client, actor, 'UPDATE', 'contratos', String(contratoId), beforeContrato, afterContrato, `Evento contractual ${input.tipo_evento}`);
    await client.query('COMMIT');
    const eventos = await loadEventos(client, contratoId, { page: 1, limit: 1 });
    return { contrato: afterContrato, evento: eventos.items[0] ?? null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const anularContratoEvento = async (
  contratoId: number,
  eventoId: number,
  input: AnularContratoEventoInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true, actor });
    const beforeResult = await client.query<QueryResultRow>(`SELECT id::text AS id, estado_evento, activo FROM contrato_eventos WHERE id = $1::bigint AND contrato_id = $2::bigint LIMIT 1 FOR UPDATE`, [eventoId, contratoId]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new AppError('Contrato event not found', 404, 'CONTRATO_EVENTO_NOT_FOUND');
    }
    if (String(before.estado_evento) === 'ANULADO') {
      throw new AppError('El evento ya se encuentra anulado.', 409, 'CONTRATO_EVENTO_YA_ANULADO');
    }
    await client.query(`
      UPDATE contrato_eventos
      SET estado_evento = 'ANULADO', activo = FALSE, motivo_anulacion = $3,
          anulado_por_usuario_id = $4::bigint, anulado_at = NOW(), updated_at = NOW()
      WHERE id = $1::bigint AND contrato_id = $2::bigint
    `, [eventoId, contratoId, input.motivo, toNumber(actor.userId)]);
    await audit(client, actor, 'ANULAR', 'contrato_eventos', String(eventoId), before, { ...before, estado_evento: 'ANULADO', activo: false, motivo_anulacion: input.motivo }, input.motivo);
    await client.query('COMMIT');
    const eventos = await loadEventos(client, contratoId, { page: 1, limit: 100 });
    return eventos.items.find((item) => item.id === eventoId) ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const uploadContratoDocumento = async (
  contratoId: number,
  input: ContratoDocumentoUploadInput,
  file: Express.Multer.File,
  actor: ActorMeta,
  tenant?: TenantAccessContext
) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true, actor });
    if (input.requisito_id !== undefined) {
      await ensureContractRequirement(client, contratoId, input.requisito_id);
    }
    await ensureTipoDocumentoExists(input.tipo_documento_id, client);

    const previousResult = await client.query<QueryResultRow>(`
      SELECT id::text AS id, version
      FROM documentos_contrato
      WHERE contrato_id = $1::bigint
        AND activo = TRUE
        AND es_vigente = TRUE
        AND (
          ($2::bigint IS NOT NULL AND requisito_id = $2::bigint)
          OR ($2::bigint IS NULL AND requisito_id IS NULL AND tipo_documento_id = $3::bigint)
        )
      ORDER BY version DESC, id DESC
      LIMIT 1
      FOR UPDATE
    `, [contratoId, input.requisito_id ?? null, input.tipo_documento_id]);
    const previous = previousResult.rows[0];
    if (previous) {
      await client.query(`UPDATE documentos_contrato SET es_vigente = FALSE, updated_at = NOW() WHERE id = $1::bigint`, [toNumber(String(previous.id))]);
    }

    const storage = await uploadDocumentToStorage({
      fileBuffer: file.buffer,
      mimeType: file.mimetype,
      originalFileName: file.originalname,
      scope: 'contratos',
      targetId: String(contratoId),
      tipoDocumentoId: input.tipo_documento_id
    });

    const version = previous ? toNumber(String(previous.version)) + 1 : 1;
    const insertResult = await client.query<QueryResultRow>(`
      INSERT INTO documentos_contrato (
        contrato_id, requisito_id, tipo_documento_id, categoria, archivo_path,
        storage_bucket, storage_path, nombre_original, mime_type, tamano_bytes,
        fecha_expedicion, fecha_vencimiento, vigencia_dias_configurada, version,
        documento_reemplaza_id, es_vigente, estado_revision, observaciones, activo
      )
      VALUES (
        $1::bigint, $2::bigint, $3::bigint, $4, $5,
        $6, $7, $8, $9, $10::bigint,
        $11::date, $12::date, $13::int, $14::int,
        $15::bigint, TRUE, 'PENDIENTE', $16, TRUE
      )
      RETURNING id::text AS id
    `, [
      contratoId,
      input.requisito_id ?? null,
      input.tipo_documento_id,
      input.categoria,
      storage.path,
      storage.bucket,
      storage.path,
      file.originalname,
      file.mimetype,
      file.size,
      input.fecha_expedicion,
      input.fecha_vencimiento,
      input.vigencia_dias_configurada,
      version,
      previous ? toNumber(String(previous.id)) : null,
      input.observaciones
    ]);
    const documentoId = toNumber(String(insertResult.rows[0]?.id));
    await audit(client, actor, 'UPLOAD', 'documentos_contrato', String(documentoId), previous ?? null, { contrato_id: contratoId, documento_id: documentoId, version }, `Carga documental de contrato ${contratoId}`);
    await client.query('COMMIT');
    const documentos = await loadDocumentos(client, contratoId);
    return documentos.find((item) => item.id === documentoId) ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateContratoDocumentoRevision = async (
  contratoId: number,
  documentoId: number,
  actor: ActorMeta,
  tenant: TenantAccessContext | undefined,
  nextState: 'EN_REVISION' | 'APROBADO' | 'DEVUELTO' | 'ANULADO',
  options: { observacion?: string | null; motivo?: string | null }
) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true, actor });
    await ensureContractDocument(client, contratoId, documentoId);
    const beforeResult = await client.query<QueryResultRow>(`SELECT id::text AS id, estado_revision, activo, es_vigente, motivo_devolucion FROM documentos_contrato WHERE id = $1::bigint AND contrato_id = $2::bigint LIMIT 1 FOR UPDATE`, [documentoId, contratoId]);
    const before = beforeResult.rows[0];
    await client.query(`
      UPDATE documentos_contrato
      SET estado_revision = $3,
          motivo_devolucion = $4,
          revisado_por_usuario_id = $5::bigint,
          revisado_at = NOW(),
          observaciones = COALESCE($6, observaciones),
          activo = CASE WHEN $3 = 'ANULADO' THEN FALSE ELSE activo END,
          es_vigente = CASE WHEN $3 = 'ANULADO' THEN FALSE ELSE es_vigente END,
          updated_at = NOW()
      WHERE id = $1::bigint AND contrato_id = $2::bigint
    `, [documentoId, contratoId, nextState, options.motivo ?? null, toNumber(actor.userId), options.observacion ?? null]);
    await audit(client, actor, 'UPDATE', 'documentos_contrato', String(documentoId), before ?? null, { ...before, estado_revision: nextState, motivo_devolucion: options.motivo ?? null }, options.motivo ?? options.observacion ?? 'Revision documental');
    await client.query('COMMIT');
    const documentos = await loadDocumentos(client, contratoId);
    return documentos.find((item) => item.id === documentoId) ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const reviewContratoDocumento = async (contratoId: number, documentoId: number, input: ContratoDocumentoRevisionInput, actor: ActorMeta, tenant?: TenantAccessContext) => {
  return updateContratoDocumentoRevision(contratoId, documentoId, actor, tenant, input.estado, { observacion: input.observacion ?? null });
};

export const devolverContratoDocumento = async (contratoId: number, documentoId: number, input: ContratoDocumentoDevolverInput, actor: ActorMeta, tenant?: TenantAccessContext) => {
  return updateContratoDocumentoRevision(contratoId, documentoId, actor, tenant, 'DEVUELTO', { observacion: input.observacion ?? null, motivo: input.motivo });
};

export const anularContratoDocumento = async (contratoId: number, documentoId: number, input: ContratoDocumentoAnularInput, actor: ActorMeta, tenant?: TenantAccessContext) => {
  return updateContratoDocumentoRevision(contratoId, documentoId, actor, tenant, 'ANULADO', { motivo: input.motivo });
};

export const getContratoDocumentoDownloadUrl = async (contratoId: number, documentoId: number, tenant?: TenantAccessContext) => {
  const client = await dbPool.connect();
  try {
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true });
    await ensureContractDocument(client, contratoId, documentoId);
    const result = await client.query<QueryResultRow>(`SELECT storage_bucket, storage_path FROM documentos_contrato WHERE id = $1::bigint AND contrato_id = $2::bigint LIMIT 1`, [documentoId, contratoId]);
    const row = result.rows[0];
    if (!row) {
      throw new AppError('Documento contractual not found', 404, 'CONTRATO_DOCUMENTO_NOT_FOUND');
    }
    return {
      url: await createDocumentSignedUrlForBucket(String(row.storage_bucket), String(row.storage_path))
    };
  } finally {
    client.release();
  }
};

export const createContratoExcepcion = async (
  contratoId: number,
  input: CreateContratoExcepcionInput,
  actor: ActorMeta,
  tenant?: TenantAccessContext
) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true, actor });
    if (input.requisito_id !== undefined) {
      await ensureContractRequirement(client, contratoId, input.requisito_id);
    }
    if (input.documento_id !== undefined) {
      await ensureContractDocument(client, contratoId, input.documento_id);
    }
    if (input.soporte_documento_id !== undefined) {
      await ensureContractDocument(client, contratoId, input.soporte_documento_id);
    }
    const result = await client.query<QueryResultRow>(`
      INSERT INTO contrato_excepciones_documentales (
        contrato_id, requisito_id, documento_id, motivo, usuario_autorizador_id,
        fecha_limite_regularizacion, soporte_documento_id, estado, observaciones, activo
      )
      VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5::bigint, $6::date, $7::bigint, 'ABIERTA', $8, TRUE)
      RETURNING id::text AS id
    `, [
      contratoId,
      input.requisito_id ?? null,
      input.documento_id ?? null,
      input.motivo,
      toNumber(actor.userId),
      input.fecha_limite_regularizacion,
      input.soporte_documento_id ?? null,
      input.observaciones
    ]);
    const excepcionId = toNumber(String(result.rows[0]?.id));
    await audit(client, actor, 'CREATE', 'contrato_excepciones_documentales', String(excepcionId), null, { contrato_id: contratoId, excepcion_id: excepcionId, estado: 'ABIERTA' }, input.motivo);
    await client.query('COMMIT');
    const excepciones = await loadExcepciones(client, contratoId);
    return excepciones.find((item) => item.id === excepcionId) ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const updateContratoExcepcionState = async (
  contratoId: number,
  excepcionId: number,
  actor: ActorMeta,
  tenant: TenantAccessContext | undefined,
  nextState: 'REGULARIZADA' | 'REVOCADA',
  options: { motivo?: string | null; observaciones?: string | null }
) => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    await ensureContractRow(client, contratoId, tenant, { withScaffold: true, actor });
    const beforeResult = await client.query<QueryResultRow>(`SELECT id::text AS id, estado, activo FROM contrato_excepciones_documentales WHERE id = $1::bigint AND contrato_id = $2::bigint LIMIT 1 FOR UPDATE`, [excepcionId, contratoId]);
    const before = beforeResult.rows[0];
    if (!before) {
      throw new AppError('Contract exception not found', 404, 'CONTRATO_EXCEPCION_NOT_FOUND');
    }
    if (String(before.estado) !== 'ABIERTA') {
      throw new AppError('Solo las excepciones ABIERTAS pueden modificarse.', 409, 'CONTRATO_EXCEPCION_ESTADO_INVALIDO');
    }
    if (nextState === 'REGULARIZADA') {
      await client.query(`
        UPDATE contrato_excepciones_documentales
        SET estado = 'REGULARIZADA', regularizada_por_usuario_id = $3::bigint,
            regularizada_at = NOW(), observaciones = COALESCE($4, observaciones), updated_at = NOW()
        WHERE id = $1::bigint AND contrato_id = $2::bigint
      `, [excepcionId, contratoId, toNumber(actor.userId), options.observaciones ?? null]);
    } else {
      await client.query(`
        UPDATE contrato_excepciones_documentales
        SET estado = 'REVOCADA', revocada_por_usuario_id = $3::bigint,
            revocada_at = NOW(), motivo_revocacion = $4, observaciones = COALESCE($5, observaciones), updated_at = NOW()
        WHERE id = $1::bigint AND contrato_id = $2::bigint
      `, [excepcionId, contratoId, toNumber(actor.userId), options.motivo ?? null, options.observaciones ?? null]);
    }
    await audit(client, actor, 'UPDATE', 'contrato_excepciones_documentales', String(excepcionId), before ?? null, { ...before, estado: nextState }, options.motivo ?? options.observaciones ?? `Excepcion ${nextState.toLowerCase()}`);
    await client.query('COMMIT');
    const excepciones = await loadExcepciones(client, contratoId);
    return excepciones.find((item) => item.id === excepcionId) ?? null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const regularizarContratoExcepcion = async (contratoId: number, excepcionId: number, input: RegularizarContratoExcepcionInput, actor: ActorMeta, tenant?: TenantAccessContext) => {
  return updateContratoExcepcionState(contratoId, excepcionId, actor, tenant, 'REGULARIZADA', { observaciones: input.observaciones ?? null });
};

export const revocarContratoExcepcion = async (contratoId: number, excepcionId: number, input: RevocarContratoExcepcionInput, actor: ActorMeta, tenant?: TenantAccessContext) => {
  return updateContratoExcepcionState(contratoId, excepcionId, actor, tenant, 'REVOCADA', { motivo: input.motivo, observaciones: input.observaciones ?? null });
};
