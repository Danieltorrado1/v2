import type { Request } from 'express';
import { dbPool, dbQuery } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { assertTenantAccessForPersonaId } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { uploadPersonaDocumento } from '../documentos/documentos.service';
import { createDocumentSignedUrlForBucket } from '../documentos/documentos.storage';
import { AppError } from '../../utils/AppError';
import { assertNominaEmpleadoCoberturaScope } from './nomina.procesos';

export const NOMINA_NOVEDAD_DOCUMENT_SLOTS = ['SOPORTE', 'SOLICITUD_PERMISO', 'AUTORIZACION_DESCUENTO'] as const;

export type NominaNovedadDocumentSlot = (typeof NOMINA_NOVEDAD_DOCUMENT_SLOTS)[number];

type NovedadDocumentRelation = 'SOPORTE_NOVEDAD' | 'SOLICITUD_PERMISO' | 'AUTORIZACION_DESCUENTO';

type SupportRow = {
  aprobado_en?: Date | string | null;
  aprobado_por?: string | null;
  created_at?: Date | string | null;
  created_by?: string | null;
  id: string;
  documento_persona_id: string;
  nombre_original: string;
  mime_type: string;
  storage_bucket: string;
  storage_path: string;
  tipo_relacion: NovedadDocumentRelation;
  version: number;
  estado_revision?: NominaNovedadDocumentReviewState;
  motivo_rechazo?: string | null;
  rechazado_en?: Date | string | null;
  rechazado_por?: string | null;
};

type NovedadScopeRow = {
  nomina_empleado_id: string;
  persona_id: string;
  requiere_soporte: boolean;
  requiere_solicitud_permiso: boolean;
  requiere_autorizacion_descuento: boolean;
  soporte_documento_tipo: string | null;
};

export interface NominaNovedadDocumentDetail {
  aprobado_en: string | null;
  aprobado_por: string | null;
  cargado_en: string | null;
  cargado_por: string | null;
  documento_persona_id: string;
  id: string;
  mime_type: string;
  nombre_original: string;
  tipo: NominaNovedadDocumentSlot;
  url: string;
  version: number;
  estado_revision: NominaNovedadDocumentReviewState;
  motivo_rechazo: string | null;
  rechazado_en: string | null;
  rechazado_por: string | null;
}

export type NominaNovedadDocumentReviewState =
  | 'PENDIENTE_VALIDACION'
  | 'APROBADO'
  | 'RECHAZADO';

export interface NominaNovedadDocumentStatus {
  cargado: boolean;
  documento: NominaNovedadDocumentDetail | null;
  requerido: boolean;
  tipo: NominaNovedadDocumentSlot;
  estado_revision: NominaNovedadDocumentReviewState | 'PENDIENTE_CARGA';
}

export interface NominaNovedadDocumentsSummary {
  novedad_id: string;
  slots: Record<NominaNovedadDocumentSlot, NominaNovedadDocumentStatus>;
}

const DOCUMENT_SLOT_CONFIG: Record<
  NominaNovedadDocumentSlot,
  {
    action: string;
    auditDescription: string;
    defaultTypeCode: string;
    legacyFieldSync: boolean;
    mimeErrorCode: string;
    missingTypeErrorCode: string;
    missingTypeMessage: string;
    relation: NovedadDocumentRelation;
  }
> = {
  SOPORTE: {
    action: 'NOMINA_NOVEDAD_SUPPORT_UPLOAD',
    auditDescription: 'Carga o reemplazo de soporte documental de novedad',
    defaultTypeCode: 'NOMINA_NOVEDAD',
    legacyFieldSync: true,
    mimeErrorCode: 'NOMINA_NOVEDAD_SUPPORT_MIME_INVALID',
    missingTypeErrorCode: 'NOMINA_NOVEDAD_SUPPORT_TYPE_MISSING',
    missingTypeMessage: 'Tipo documental de soporte de novedad no configurado',
    relation: 'SOPORTE_NOVEDAD',
  },
  SOLICITUD_PERMISO: {
    action: 'NOMINA_NOVEDAD_PERMISSION_REQUEST_UPLOAD',
    auditDescription: 'Carga o reemplazo de solicitud de permiso de novedad',
    defaultTypeCode: 'NOMINA_SOLICITUD_PERMISO',
    legacyFieldSync: false,
    mimeErrorCode: 'NOMINA_NOVEDAD_PERMISSION_REQUEST_MIME_INVALID',
    missingTypeErrorCode: 'NOMINA_NOVEDAD_PERMISSION_REQUEST_TYPE_MISSING',
    missingTypeMessage: 'Tipo documental de solicitud de permiso no configurado',
    relation: 'SOLICITUD_PERMISO',
  },
  AUTORIZACION_DESCUENTO: {
    action: 'NOMINA_NOVEDAD_DISCOUNT_AUTHORIZATION_UPLOAD',
    auditDescription: 'Carga o reemplazo de autorización firmada de descuento de novedad',
    defaultTypeCode: 'NOMINA_AUTORIZACION_DESCUENTO',
    legacyFieldSync: false,
    mimeErrorCode: 'NOMINA_NOVEDAD_DISCOUNT_AUTHORIZATION_MIME_INVALID',
    missingTypeErrorCode: 'NOMINA_NOVEDAD_DISCOUNT_AUTHORIZATION_TYPE_MISSING',
    missingTypeMessage: 'Tipo documental de autorización de descuento no configurado',
    relation: 'AUTORIZACION_DESCUENTO',
  },
};

const relationToSlot = (
  relation: NovedadDocumentRelation
): NominaNovedadDocumentSlot => {
  if (relation === 'SOLICITUD_PERMISO') return 'SOLICITUD_PERMISO';
  if (relation === 'AUTORIZACION_DESCUENTO') return 'AUTORIZACION_DESCUENTO';
  return 'SOPORTE';
};

const loadNovedadScope = async (novedadId: number) => {
  const result = await dbQuery<NovedadScopeRow>(
    `
      SELECT
        ne.id::text AS nomina_empleado_id,
        v.persona_id::text,
        COALESCE(ntn.requiere_soporte, FALSE) AS requiere_soporte,
        COALESCE(ntn.requiere_solicitud_permiso, FALSE) AS requiere_solicitud_permiso,
        COALESCE(ntn.requiere_autorizacion_descuento, FALSE) AS requiere_autorizacion_descuento,
        ntn.soporte_documento_tipo
      FROM nomina_novedades n
      INNER JOIN nomina_empleados ne ON ne.id = n.nomina_empleado_id
      INNER JOIN vinculaciones v ON v.id = ne.vinculacion_id
      INNER JOIN nomina_tipos_novedad ntn ON ntn.id = n.tipo_novedad_id
      WHERE n.id = $1
        AND COALESCE(n.activo, TRUE) = TRUE
    `,
    [novedadId]
  );

  if (!result.rows[0]) {
    throw new AppError('Novedad no encontrada', 404, 'NOMINA_NOVEDAD_NOT_FOUND');
  }

  return result.rows[0];
};

const loadNovedadDocuments = async (
  novedadId: number
): Promise<Partial<Record<NominaNovedadDocumentSlot, SupportRow>>> => {
  const result = await dbQuery<SupportRow>(
    `
      SELECT
        d.id::text,
        d.id::text AS documento_persona_id,
        d.storage_bucket,
        d.storage_path,
        d.nombre_original,
        d.mime_type,
        d.version,
        nd.estado_revision,
        nd.created_at,
        nd.created_by::text AS created_by,
        nd.aprobado_por::text AS aprobado_por,
        nd.aprobado_en,
        nd.rechazado_por::text AS rechazado_por,
        nd.rechazado_en,
        nd.motivo_rechazo,
        nd.tipo_relacion
      FROM nomina_novedad_documentos nd
      INNER JOIN documentos_persona d ON d.id = nd.documento_persona_id
      WHERE nd.nomina_novedad_id = $1
        AND nd.activo = TRUE
        AND d.activo = TRUE
      ORDER BY nd.id DESC, d.version DESC, d.id DESC
    `,
    [novedadId]
  );

  const bySlot: Partial<Record<NominaNovedadDocumentSlot, SupportRow>> = {};

  for (const row of result.rows) {
    const slot = relationToSlot(row.tipo_relacion);
    if (!bySlot[slot]) {
      bySlot[slot] = row;
    }
  }

  return bySlot;
};

const buildDocumentDetail = async (
  row: SupportRow
): Promise<NominaNovedadDocumentDetail> => {
  return {
    aprobado_en: row.aprobado_en ? new Date(row.aprobado_en).toISOString() : null,
    aprobado_por: row.aprobado_por ?? null,
    cargado_en: row.created_at ? new Date(row.created_at).toISOString() : null,
    cargado_por: row.created_by ?? null,
    documento_persona_id: row.documento_persona_id,
    id: row.id,
    mime_type: row.mime_type,
    nombre_original: row.nombre_original,
    tipo: relationToSlot(row.tipo_relacion),
    url: await createDocumentSignedUrlForBucket(row.storage_bucket, row.storage_path, 300),
    version: row.version,
    estado_revision: row.estado_revision ?? 'PENDIENTE_VALIDACION',
    motivo_rechazo: row.motivo_rechazo ?? null,
    rechazado_en: row.rechazado_en ? new Date(row.rechazado_en).toISOString() : null,
    rechazado_por: row.rechazado_por ?? null,
  };
};

const buildDocumentsSummary = async (
  novedadId: number,
  scope: NovedadScopeRow
): Promise<NominaNovedadDocumentsSummary> => {
  const documents = await loadNovedadDocuments(novedadId);
  const soporte = documents.SOPORTE ? await buildDocumentDetail(documents.SOPORTE) : null;
  const solicitud =
    documents.SOLICITUD_PERMISO
      ? await buildDocumentDetail(documents.SOLICITUD_PERMISO)
      : null;
  const autorizacion =
    documents.AUTORIZACION_DESCUENTO
      ? await buildDocumentDetail(documents.AUTORIZACION_DESCUENTO)
      : null;

  return {
    novedad_id: String(novedadId),
    slots: {
      SOPORTE: {
        cargado: Boolean(soporte),
        documento: soporte,
        requerido: scope.requiere_soporte,
        tipo: 'SOPORTE',
        estado_revision: soporte?.estado_revision ?? 'PENDIENTE_CARGA',
      },
      SOLICITUD_PERMISO: {
        cargado: Boolean(solicitud),
        documento: solicitud,
        requerido: scope.requiere_solicitud_permiso,
        tipo: 'SOLICITUD_PERMISO',
        estado_revision: solicitud?.estado_revision ?? 'PENDIENTE_CARGA',
      },
      AUTORIZACION_DESCUENTO: {
        cargado: Boolean(autorizacion),
        documento: autorizacion,
        requerido: scope.requiere_autorizacion_descuento,
        tipo: 'AUTORIZACION_DESCUENTO',
        estado_revision: autorizacion?.estado_revision ?? 'PENDIENTE_CARGA',
      },
    },
  };
};

const resolveDocumentTypeCode = (
  slot: NominaNovedadDocumentSlot,
  scope: NovedadScopeRow
) => {
  if (slot === 'SOPORTE') {
    return scope.soporte_documento_tipo?.trim() || DOCUMENT_SLOT_CONFIG.SOPORTE.defaultTypeCode;
  }

  return DOCUMENT_SLOT_CONFIG[slot].defaultTypeCode;
};

const assertPdfFile = (
  file: Express.Multer.File,
  slot: NominaNovedadDocumentSlot
) => {
  if (file.mimetype !== 'application/pdf') {
    throw new AppError(
      slot === 'SOPORTE'
        ? 'El soporte de novedad debe ser PDF'
        : slot === 'SOLICITUD_PERMISO'
          ? 'La solicitud de permiso debe ser PDF'
          : 'La autorización de descuento debe ser PDF',
      400,
      DOCUMENT_SLOT_CONFIG[slot].mimeErrorCode
    );
  }
};

export const getNovedadDocuments = async (
  novedadId: number,
  tenant?: TenantAccessContext
) => {
  const scope = await loadNovedadScope(novedadId);
  await assertNominaEmpleadoCoberturaScope(scope.nomina_empleado_id, tenant);
  await assertTenantAccessForPersonaId(tenant, scope.persona_id);
  return buildDocumentsSummary(novedadId, scope);
};

export const assertNovedadRequiredDocuments = async (
  novedadId: number,
  tenant?: TenantAccessContext
): Promise<void> => {
  const summary = await getNovedadDocuments(novedadId, tenant);
  const labels: Record<NominaNovedadDocumentSlot, string> = {
    SOPORTE: 'Soporte',
    SOLICITUD_PERMISO: 'Solicitud de permiso',
    AUTORIZACION_DESCUENTO: 'Autorización de descuento',
  };
  const missing = NOMINA_NOVEDAD_DOCUMENT_SLOTS
    .filter((slot) => summary.slots[slot].requerido && !summary.slots[slot].cargado)
    .map((slot) => `Falta cargar: ${labels[slot]}`);
  const pending = NOMINA_NOVEDAD_DOCUMENT_SLOTS
    .filter((slot) => summary.slots[slot].requerido && summary.slots[slot].estado_revision === 'PENDIENTE_VALIDACION')
    .map((slot) => `Pendiente de validar: ${labels[slot]}`);
  const rejected = NOMINA_NOVEDAD_DOCUMENT_SLOTS
    .filter((slot) => summary.slots[slot].requerido && summary.slots[slot].estado_revision === 'RECHAZADO')
    .map((slot) => `Documento rechazado: ${labels[slot]}`);

  if (missing.length > 0 || pending.length > 0 || rejected.length > 0) {
    throw new AppError(
      `No puede completar la revisión hasta que todos los documentos obligatorios estén aprobados. ${[...missing, ...pending, ...rejected].join(' ')}`,
      409,
      'NOMINA_NOVEDAD_DOCUMENTOS_OBLIGATORIOS_FALTANTES'
    );
  }
};

export const getNovedadDocument = async (
  novedadId: number,
  slot: NominaNovedadDocumentSlot,
  tenant?: TenantAccessContext
) => {
  const documents = await getNovedadDocuments(novedadId, tenant);
  return documents.slots[slot].documento;
};

const loadActiveDocumentForMutation = async (
  novedadId: number,
  slot: NominaNovedadDocumentSlot,
  tenant?: TenantAccessContext
) => {
  const scope = await loadNovedadScope(novedadId);
  await assertNominaEmpleadoCoberturaScope(scope.nomina_empleado_id, tenant);
  await assertTenantAccessForPersonaId(tenant, scope.persona_id);
  const result = await dbQuery<SupportRow>(
    `
      SELECT id::text, documento_persona_id::text, tipo_relacion, estado_revision,
             motivo_rechazo, aprobado_por::text AS aprobado_por, aprobado_en,
             rechazado_por::text AS rechazado_por, rechazado_en
      FROM nomina_novedad_documentos
      WHERE nomina_novedad_id = $1
        AND tipo_relacion = $2
        AND activo = TRUE
      ORDER BY id DESC
      LIMIT 1
    `,
    [novedadId, DOCUMENT_SLOT_CONFIG[slot].relation]
  );
  const document = result.rows[0];
  if (!document) {
    throw new AppError('No hay un documento cargado para este requisito.', 409, 'NOMINA_NOVEDAD_DOCUMENTO_NOT_FOUND');
  }
  return { document, scope };
};

export const reviewNovedadDocument = async (
  novedadId: number,
  slot: NominaNovedadDocumentSlot,
  decision: 'APROBADO' | 'RECHAZADO',
  actor: string,
  motivoRechazo: string | null,
  tenant?: TenantAccessContext,
  meta?: AuditRequestMeta
) => {
  const { document } = await loadActiveDocumentForMutation(novedadId, slot, tenant);
  if (document.estado_revision !== 'PENDIENTE_VALIDACION') {
    throw new AppError('Solo se pueden revisar documentos pendientes de validación.', 409, 'NOMINA_NOVEDAD_DOCUMENTO_ESTADO_INVALIDO');
  }
  if (decision === 'RECHAZADO' && !motivoRechazo?.trim()) {
    throw new AppError('El motivo de rechazo es obligatorio.', 400, 'NOMINA_NOVEDAD_DOCUMENTO_MOTIVO_REQUERIDO');
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `
        UPDATE nomina_novedad_documentos
        SET estado_revision = $2,
            aprobado_por = CASE WHEN $2 = 'APROBADO' THEN $3::bigint ELSE NULL END,
            aprobado_en = CASE WHEN $2 = 'APROBADO' THEN NOW() ELSE NULL END,
            rechazado_por = CASE WHEN $2 = 'RECHAZADO' THEN $3::bigint ELSE NULL END,
            rechazado_en = CASE WHEN $2 = 'RECHAZADO' THEN NOW() ELSE NULL END,
            motivo_rechazo = CASE WHEN $2 = 'RECHAZADO' THEN $4 ELSE NULL END
        WHERE id = $1::bigint
        RETURNING id::text
      `,
      [document.id, decision, actor, motivoRechazo?.trim() || null]
    );
    await registerAuditEntry({
      client,
      usuario_id: actor,
      accion: decision === 'APROBADO' ? 'NOMINA_NOVEDAD_DOCUMENT_APPROVE' : 'NOMINA_NOVEDAD_DOCUMENT_REJECT',
      tabla: 'nomina_novedad_documentos',
      registro_id: result.rows[0]?.id ?? document.id,
      descripcion: decision === 'APROBADO' ? 'Aprobación de documento de novedad' : 'Rechazo de documento de novedad',
      before: { estado_revision: 'PENDIENTE_VALIDACION' },
      after: { estado_revision: decision, motivo_rechazo: motivoRechazo?.trim() || null },
      ip: meta?.ip,
      user_agent: meta?.user_agent,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return getNovedadDocuments(novedadId, tenant);
};

export const getNovedadSupport = async (
  novedadId: number,
  tenant?: TenantAccessContext
) => {
  return getNovedadDocument(novedadId, 'SOPORTE', tenant);
};

export const uploadNovedadDocument = async (
  novedadId: number,
  slot: NominaNovedadDocumentSlot,
  file: Express.Multer.File,
  actor: string,
  tenant?: TenantAccessContext,
  meta?: AuditRequestMeta
) => {
  assertPdfFile(file, slot);
  const scope = await loadNovedadScope(novedadId);
  await assertNominaEmpleadoCoberturaScope(scope.nomina_empleado_id, tenant);
  await assertTenantAccessForPersonaId(tenant, scope.persona_id);

  const requiredBySlot: Record<NominaNovedadDocumentSlot, boolean> = {
    SOPORTE: scope.requiere_soporte,
    SOLICITUD_PERMISO: scope.requiere_solicitud_permiso,
    AUTORIZACION_DESCUENTO: scope.requiere_autorizacion_descuento,
  };
  if (!requiredBySlot[slot]) {
    throw new AppError(
      'Este tipo de novedad no requiere el documento seleccionado.',
      409,
      'NOMINA_NOVEDAD_DOCUMENTO_NO_REQUERIDO'
    );
  }

  const currentDocument = await dbQuery<{ estado_revision: NominaNovedadDocumentReviewState }>(
    `SELECT estado_revision FROM nomina_novedad_documentos WHERE nomina_novedad_id = $1 AND tipo_relacion = $2 AND activo = TRUE ORDER BY id DESC LIMIT 1`,
    [novedadId, DOCUMENT_SLOT_CONFIG[slot].relation]
  );
  const currentState = currentDocument.rows[0]?.estado_revision;
  if (currentState && currentState !== 'RECHAZADO') {
    throw new AppError('El documento solo puede reemplazarse después de ser rechazado.', 409, 'NOMINA_NOVEDAD_DOCUMENTO_REEMPLAZO_NO_PERMITIDO');
  }

  const typeCode = resolveDocumentTypeCode(slot, scope);
  const typeResult = await dbQuery<{ id: string }>(
    `
      SELECT id::text
      FROM tipos_documentos
      WHERE codigo = $1
        AND activo = TRUE
      LIMIT 1
    `,
    [typeCode]
  );

  if (!typeResult.rows[0]) {
    throw new AppError(
      DOCUMENT_SLOT_CONFIG[slot].missingTypeMessage,
      409,
      DOCUMENT_SLOT_CONFIG[slot].missingTypeErrorCode
    );
  }

  const document = await uploadPersonaDocumento(
    scope.persona_id,
    file,
    {
      tipo_documento_id: typeResult.rows[0].id,
      fecha_expedicion: null,
      fecha_vencimiento: null,
    },
    actor,
    tenant
  );

  const client = await dbPool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `
        UPDATE nomina_novedad_documentos
        SET activo = FALSE
        WHERE nomina_novedad_id = $1
          AND tipo_relacion = $2
          AND activo = TRUE
      `,
      [novedadId, DOCUMENT_SLOT_CONFIG[slot].relation]
    );

    const relation = await client.query<{ id: string }>(
      `
        INSERT INTO nomina_novedad_documentos (
          nomina_novedad_id,
          documento_persona_id,
          tipo_relacion,
          created_by
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id::text
      `,
      [novedadId, document.id, DOCUMENT_SLOT_CONFIG[slot].relation, actor]
    );

    if (DOCUMENT_SLOT_CONFIG[slot].legacyFieldSync) {
      await client.query(
        `UPDATE nomina_novedades SET documento_persona_id = $2 WHERE id = $1`,
        [novedadId, document.id]
      );
    }

    await registerAuditEntry({
      client,
      usuario_id: actor,
      accion: DOCUMENT_SLOT_CONFIG[slot].action,
      tabla: 'nomina_novedad_documentos',
      registro_id: relation.rows[0]?.id ?? String(novedadId),
      descripcion: DOCUMENT_SLOT_CONFIG[slot].auditDescription,
      after: {
        novedad_id: novedadId,
        documento_persona_id: document.id,
        tipo: slot,
      },
      ip: meta?.ip,
      user_agent: meta?.user_agent,
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return getNovedadDocuments(novedadId, tenant);
};

export const uploadNovedadSupport = async (
  novedadId: number,
  file: Express.Multer.File,
  actor: string,
  tenant?: TenantAccessContext,
  meta?: AuditRequestMeta
) => {
  const summary = await uploadNovedadDocument(
    novedadId,
    'SOPORTE',
    file,
    actor,
    tenant,
    meta
  );

  return summary.slots.SOPORTE.documento;
};

export const requestMetaFrom = (req: Request) => ({
  ip: req.ip,
  user_agent: req.get('user-agent'),
});
