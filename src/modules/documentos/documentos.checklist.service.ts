import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { env } from '../../config/env';
import {
  assertTenantAccessForVinculacionId,
  type TenantAccessContext
} from '../../middlewares/tenantMiddleware';
import { registerAuditEntry } from '../auditoria/auditoria.helper';
import { ensureVinculacionExists } from './documentos.validator';

interface ChecklistRequirementRow extends QueryResultRow {
  activo: boolean;
  ambito_documental: 'PERSONA' | 'VINCULACION';
  codigo: string | null;
  contrato_cargo_id: string | null;
  dias_proximo_vencimiento: number;
  id: string;
  nombre_documento: string | null;
  nombre_requisito: string;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento_id: string;
  tipo_vinculacion_id: string | null;
  vigencia_meses: number | null;
}

interface ChecklistLoadedRow extends QueryResultRow {
  activo: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: string;
  nombre_original: string;
  tipo_documento_id: string;
  tipo_documento_nombre: string | null;
}

type LegacyChecklistState = 'CARGADO' | 'FALTANTE' | 'VENCIDO';
type ChecklistDetailedState =
  | 'COMPLETO'
  | 'PENDIENTE'
  | 'PROXIMO_A_VENCER'
  | 'VENCIDO'
  | 'NO_APLICA';

export interface ContextualChecklistItem {
  ambito_documental: 'PERSONA' | 'VINCULACION';
  codigo: string | null;
  contrato_cargo_id: number | null;
  detalle_contexto: 'GENERAL' | 'CARGO' | 'TIPO_VINCULACION' | 'CARGO_TIPO_VINCULACION';
  dias_para_vencimiento: number | null;
  documento_id: number | null;
  estado: LegacyChecklistState;
  estado_detallado: ChecklistDetailedState;
  fecha_vencimiento: string | null;
  fuente_documento: 'PERSONA' | 'VINCULACION' | null;
  nombre_requisito: string;
  observacion: string | null;
  obligatorio: boolean;
  origen: 'GENERAL' | 'CARGO' | 'TIPO_VINCULACION' | 'CARGO_TIPO_VINCULACION';
  requisito_id: number;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento_id: number | null;
  tipo_documento_nombre: string | null;
  tipo_requisito: string | null;
  tipo_vinculacion_id: number | null;
  vigencia_meses: number | null;
}

export interface ContextualChecklistRequirementInput {
  ambito_documental: 'PERSONA' | 'VINCULACION';
  codigo: string | null;
  contrato_cargo_id: number | null;
  dias_proximo_vencimiento: number;
  id: number;
  nombre_documento: string | null;
  nombre_requisito: string;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento_id: number;
  tipo_vinculacion_id: number | null;
  vigencia_meses: number | null;
}

export interface ContextualChecklistDocumentInput {
  activo: boolean;
  fecha_carga: Date | string | null;
  fecha_expedicion: Date | string | null;
  fecha_vencimiento: Date | string | null;
  id: number;
  nombre_original: string;
  tipo_documento_id: number;
  tipo_documento_nombre: string | null;
}

export interface ContextualVinculacionChecklist {
  cargados: number;
  completos: number;
  contrato_cargo_id: number;
  contrato_id: number;
  cumplimiento_porcentaje: number;
  faltantes: number;
  no_aplica: number;
  pendientes: number;
  persona_id: number;
  proximos_vencer: number;
  requisitos: ContextualChecklistItem[];
  tiene_configuracion: boolean;
  total_requisitos: number;
  vinculacion_id: number;
  vencidos: number;
}

const toDateString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
};

const toNumber = (value: number | string): number => {
  return typeof value === 'number' ? value : Number(value);
};

const addMonths = (isoDate: string, months: number): string | null => {
  if (!isoDate || !months) {
    return null;
  }

  const base = new Date(`${isoDate}T00:00:00.000Z`);

  if (Number.isNaN(base.getTime())) {
    return null;
  }

  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
};

const daysBetween = (fromIsoDate: string, toIsoDate: string): number => {
  const from = Date.parse(`${fromIsoDate}T00:00:00.000Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
};

const resolveOrigin = (
  contratoCargoId: number | null,
  tipoVinculacionId: number | null
): ContextualChecklistItem['origen'] => {
  if (contratoCargoId !== null && tipoVinculacionId !== null) {
    return 'CARGO_TIPO_VINCULACION';
  }

  if (contratoCargoId !== null) {
    return 'CARGO';
  }

  if (tipoVinculacionId !== null) {
    return 'TIPO_VINCULACION';
  }

  return 'GENERAL';
};

export const filterContextualChecklistRequirements = (
  requirements: ContextualChecklistRequirementInput[],
  context: {
    contratoCargoId: number | null;
    tipoVinculacionId: number | null;
  }
): ContextualChecklistRequirementInput[] =>
  requirements.filter(
    (requirement) =>
      (requirement.contrato_cargo_id === null ||
        requirement.contrato_cargo_id === context.contratoCargoId) &&
      (requirement.tipo_vinculacion_id === null ||
        requirement.tipo_vinculacion_id === context.tipoVinculacionId)
  );

const buildDocumentIndex = (
  documents: ContextualChecklistDocumentInput[]
): Map<number, ContextualChecklistDocumentInput> => {
  const index = new Map<number, ContextualChecklistDocumentInput>();

  for (const document of documents) {
    if (document.activo && !index.has(document.tipo_documento_id)) {
      index.set(document.tipo_documento_id, document);
    }
  }

  return index;
};

export const buildContextualChecklistSnapshot = (input: {
  contratoCargoId: number;
  contratoId: number;
  personaDocuments: ContextualChecklistDocumentInput[];
  personaId: number;
  requirements: ContextualChecklistRequirementInput[];
  todayIso?: string;
  vinculacionDocuments: ContextualChecklistDocumentInput[];
  vinculacionId: number;
}): ContextualVinculacionChecklist => {
  const personaDocumentIndex = buildDocumentIndex(input.personaDocuments);
  const vinculacionDocumentIndex = buildDocumentIndex(input.vinculacionDocuments);
  const todayIso = input.todayIso ?? new Date().toISOString().slice(0, 10);

  const requisitos = input.requirements.map((requirement) => {
    const sourceDocument =
      requirement.ambito_documental === 'PERSONA'
        ? personaDocumentIndex.get(requirement.tipo_documento_id) ?? null
        : vinculacionDocumentIndex.get(requirement.tipo_documento_id) ?? null;
    const fechaExpedicion = sourceDocument ? toDateString(sourceDocument.fecha_expedicion) : null;
    const explicitFechaVencimiento = sourceDocument
      ? toDateString(sourceDocument.fecha_vencimiento)
      : null;
    const computedFechaVencimiento =
      explicitFechaVencimiento ??
      (fechaExpedicion && requirement.vigencia_meses
        ? addMonths(fechaExpedicion, requirement.vigencia_meses)
        : null);
    const diasParaVencimiento = computedFechaVencimiento
      ? daysBetween(todayIso, computedFechaVencimiento)
      : null;
    const origin = resolveOrigin(requirement.contrato_cargo_id, requirement.tipo_vinculacion_id);
    let estado: LegacyChecklistState = 'FALTANTE';
    let estadoDetallado: ChecklistDetailedState = 'PENDIENTE';
    let observacion: string | null = null;

    if (!sourceDocument) {
      if (requirement.obligatorio) {
        estado = 'FALTANTE';
        estadoDetallado = 'PENDIENTE';
      } else {
        estado = 'FALTANTE';
        estadoDetallado = 'NO_APLICA';
        observacion = 'Requisito opcional sin documento cargado.';
      }
    } else if (computedFechaVencimiento && computedFechaVencimiento < todayIso) {
      estado = 'VENCIDO';
      estadoDetallado = 'VENCIDO';
    } else if (
      computedFechaVencimiento &&
      diasParaVencimiento !== null &&
      diasParaVencimiento <= requirement.dias_proximo_vencimiento
    ) {
      estado = 'CARGADO';
      estadoDetallado = 'PROXIMO_A_VENCER';
    } else {
      estado = 'CARGADO';
      estadoDetallado = 'COMPLETO';
    }

    return {
      requisito_id: requirement.id,
      nombre_requisito: requirement.nombre_requisito,
      codigo: requirement.codigo,
      tipo_documento_id: requirement.tipo_documento_id,
      tipo_documento_nombre: requirement.nombre_documento,
      tipo_requisito: null,
      ambito_documental: requirement.ambito_documental,
      obligatorio: requirement.obligatorio,
      requiere_fecha_expedicion: requirement.requiere_fecha_expedicion,
      requiere_fecha_vencimiento: requirement.requiere_fecha_vencimiento,
      vigencia_meses: requirement.vigencia_meses,
      contrato_cargo_id: requirement.contrato_cargo_id,
      tipo_vinculacion_id: requirement.tipo_vinculacion_id,
      origen: origin,
      detalle_contexto: origin,
      documento_id: sourceDocument ? sourceDocument.id : null,
      fuente_documento: sourceDocument ? requirement.ambito_documental : null,
      fecha_vencimiento: computedFechaVencimiento,
      dias_para_vencimiento: diasParaVencimiento,
      estado,
      estado_detallado: estadoDetallado,
      observacion
    } satisfies ContextualChecklistItem;
  });

  const totalRequisitos = requisitos.length;
  const completos = requisitos.filter((item) => item.estado_detallado === 'COMPLETO').length;
  const proximosVencer = requisitos.filter(
    (item) => item.estado_detallado === 'PROXIMO_A_VENCER'
  ).length;
  const pendientes = requisitos.filter((item) => item.estado_detallado === 'PENDIENTE').length;
  const noAplica = requisitos.filter((item) => item.estado_detallado === 'NO_APLICA').length;
  const cargados = requisitos.filter((item) => item.estado === 'CARGADO').length;
  const vencidos = requisitos.filter((item) => item.estado === 'VENCIDO').length;
  const cumplimientoPorcentaje =
    totalRequisitos === 0
      ? 0
      : Number((((completos + proximosVencer) / totalRequisitos) * 100).toFixed(2));

  return {
    vinculacion_id: input.vinculacionId,
    persona_id: input.personaId,
    contrato_id: input.contratoId,
    contrato_cargo_id: input.contratoCargoId,
    total_requisitos: totalRequisitos,
    tiene_configuracion: totalRequisitos > 0,
    completos,
    cargados,
    faltantes: pendientes,
    pendientes,
    proximos_vencer: proximosVencer,
    no_aplica: noAplica,
    vencidos,
    cumplimiento_porcentaje: cumplimientoPorcentaje,
    requisitos
  };
};

export const buildContextualVinculacionChecklist = async (
  vinculacionId: string,
  tenant?: TenantAccessContext,
  options?: {
    audit?: boolean;
    contratoCargoIdOverride?: number | null;
    tipoVinculacionIdOverride?: number | null;
  }
): Promise<ContextualVinculacionChecklist> => {
  await assertTenantAccessForVinculacionId(tenant, vinculacionId);
  const vinculacion = await ensureVinculacionExists(vinculacionId);

  const contratoCargoContext =
    options?.contratoCargoIdOverride === undefined
      ? vinculacion.contrato_cargo_id
      : options.contratoCargoIdOverride === null
        ? null
        : String(options.contratoCargoIdOverride);
  const tipoVinculacionContext =
    options?.tipoVinculacionIdOverride === undefined
      ? vinculacion.tipo_vinculacion_id
      : options.tipoVinculacionIdOverride === null
        ? null
        : String(options.tipoVinculacionIdOverride);

  const [requirementsResult, vinculacionDocumentsResult, personaDocumentsResult] = await Promise.all([
    dbQuery<ChecklistRequirementRow>(
      `
        SELECT
          r.id::text AS id,
          r.nombre_requisito,
          r.obligatorio,
          r.activo,
          r.ambito_documental,
          r.requiere_fecha_expedicion,
          r.requiere_fecha_vencimiento,
          r.vigencia_meses,
          r.dias_proximo_vencimiento,
          r.contrato_cargo_id::text AS contrato_cargo_id,
          r.tipo_vinculacion_id::text AS tipo_vinculacion_id,
          r.tipo_documento_id::text AS tipo_documento_id,
          td.codigo,
          td.nombre_documento
        FROM contrato_documento_requisitos r
        INNER JOIN tipos_documentos td ON td.id = r.tipo_documento_id
        WHERE r.contrato_id::text = $1
          AND r.objetivo_requisito = 'VINCULACION'
          AND r.activo = TRUE
          AND (r.contrato_cargo_id IS NULL OR r.contrato_cargo_id::text = $2)
          AND (r.tipo_vinculacion_id IS NULL OR r.tipo_vinculacion_id::text = $3)
        ORDER BY
          COALESCE(r.contrato_cargo_id, 0) ASC,
          COALESCE(r.tipo_vinculacion_id, 0) ASC,
          r.id ASC
      `,
      [vinculacion.contrato_id, contratoCargoContext, tipoVinculacionContext]
    ),
    dbQuery<ChecklistLoadedRow>(
      `
        SELECT
          dv.id::text AS id,
          dv.tipo_documento_id::text AS tipo_documento_id,
          td.nombre_documento AS tipo_documento_nombre,
          dv.nombre_original,
          dv.fecha_expedicion,
          dv.fecha_vencimiento,
          dv.fecha_carga,
          dv.activo
        FROM documentos_vinculacion dv
        INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
        WHERE dv.vinculacion_id::text = $1
          AND dv.activo = TRUE
        ORDER BY dv.fecha_carga DESC, dv.id DESC
      `,
      [vinculacionId]
    ),
    dbQuery<ChecklistLoadedRow>(
      `
        SELECT
          dp.id::text AS id,
          dp.tipo_documento_id::text AS tipo_documento_id,
          td.nombre_documento AS tipo_documento_nombre,
          dp.nombre_original,
          dp.fecha_expedicion,
          dp.fecha_vencimiento,
          dp.fecha_carga,
          dp.activo
        FROM documentos_persona dp
        INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
        WHERE dp.persona_id::text = $1
          AND dp.activo = TRUE
          AND dp.es_vigente = TRUE
        ORDER BY dp.fecha_carga DESC, dp.version DESC, dp.id DESC
      `,
      [vinculacion.persona_id]
    )
  ]);

  const checklist = buildContextualChecklistSnapshot({
    vinculacionId: toNumber(vinculacionId),
    personaId: toNumber(vinculacion.persona_id),
    contratoId: toNumber(vinculacion.contrato_id),
    contratoCargoId: toNumber(contratoCargoContext ?? vinculacion.contrato_cargo_id),
    requirements: requirementsResult.rows.map((requirement) => ({
      id: toNumber(requirement.id),
      nombre_requisito: requirement.nombre_requisito,
      obligatorio: requirement.obligatorio,
      ambito_documental: requirement.ambito_documental,
      requiere_fecha_expedicion: requirement.requiere_fecha_expedicion,
      requiere_fecha_vencimiento: requirement.requiere_fecha_vencimiento,
      vigencia_meses: requirement.vigencia_meses,
      dias_proximo_vencimiento: requirement.dias_proximo_vencimiento,
      contrato_cargo_id: requirement.contrato_cargo_id
        ? toNumber(requirement.contrato_cargo_id)
        : null,
      tipo_vinculacion_id: requirement.tipo_vinculacion_id
        ? toNumber(requirement.tipo_vinculacion_id)
        : null,
      tipo_documento_id: toNumber(requirement.tipo_documento_id),
      codigo: requirement.codigo,
      nombre_documento: requirement.nombre_documento
    })),
    vinculacionDocuments: vinculacionDocumentsResult.rows.map((document) => ({
      id: toNumber(document.id),
      tipo_documento_id: toNumber(document.tipo_documento_id),
      tipo_documento_nombre: document.tipo_documento_nombre,
      nombre_original: document.nombre_original,
      fecha_expedicion: document.fecha_expedicion,
      fecha_vencimiento: document.fecha_vencimiento,
      fecha_carga: document.fecha_carga,
      activo: document.activo
    })),
    personaDocuments: personaDocumentsResult.rows.map((document) => ({
      id: toNumber(document.id),
      tipo_documento_id: toNumber(document.tipo_documento_id),
      tipo_documento_nombre: document.tipo_documento_nombre,
      nombre_original: document.nombre_original,
      fecha_expedicion: document.fecha_expedicion,
      fecha_vencimiento: document.fecha_vencimiento,
      fecha_carga: document.fecha_carga,
      activo: document.activo
    }))
  });

  if (options?.audit !== false) {
    try {
      await registerAuditEntry({
        accion: 'CONSULTA_CHECKLIST',
        after: {
          completos: checklist.completos,
          cumplimiento_porcentaje: checklist.cumplimiento_porcentaje,
          no_aplica: checklist.no_aplica,
          pendientes: checklist.pendientes,
          proximos_vencer: checklist.proximos_vencer,
          total_requisitos: checklist.total_requisitos,
          vencidos: checklist.vencidos,
          vinculacionId
        },
        descripcion: 'Consulta de checklist documental contextual de vinculacion',
        registro_id: randomUUID(),
        tabla: 'documentos_vinculacion_checklist',
        usuario_id: null
      });
    } catch (error) {
      console.error('Failed to audit checklist consultation', error);
    }
  }

  if (env.NODE_ENV === 'development' && checklist.total_requisitos === 0) {
    console.debug('No configured contextual document requirements found', {
      contrato_id: vinculacion.contrato_id,
      contrato_cargo_id: contratoCargoContext,
      tipo_vinculacion_id: tipoVinculacionContext,
      vinculacion_id: vinculacionId
    });
  }

  return checklist;
};

