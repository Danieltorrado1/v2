import { resolvePersonalRequirement } from './documentos.applicability.domain';
import { aggregateManipulation, isCombined, type ManipulationMetadata } from './documentos.manipulacion.domain';
import { documentPolicy, documentState, type DocumentState } from './documentos.review.domain';
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
  cargo_nombre: string | null;
  regla_obligatorio: boolean | null;
  regla_aplica: boolean | null;
  cotiza_pension: boolean | null;
  aplica: boolean;
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
  tipo_documento_ids: string[];
  componentes: Record<string,string>;
  tipo_requisito: string;
  cuenta_cumplimiento: boolean;
  grupo_visual: string;
}

interface ChecklistLoadedRow extends QueryResultRow {
  estado_revision?: string | null;
  policy_type?: { requiere_fecha_expedicion?:boolean; requiere_fecha_vencimiento?:boolean; tiene_vencimiento?:boolean; vigencia_dias_default?:number|null; dias_alerta_amarilla?:number };

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
  | 'NO_APLICA' | 'SIN_DOCUMENTO' | 'PENDIENTE_REVISION' | 'APROBADO' | 'RECHAZADO' | 'POR_VENCER' | 'PARCIAL';

export interface ContextualChecklistItem {
  aplica: boolean;
  motivo_aplicabilidad?: string;
  cuenta_numerador: boolean;
  ambito_documental: 'PERSONA' | 'VINCULACION';
  codigo: string | null;
  contrato_cargo_id: number | null;
  detalle_contexto: 'GENERAL' | 'CARGO' | 'TIPO_VINCULACION' | 'CARGO_TIPO_VINCULACION';
  dias_para_vencimiento: number | null;
  documento_id: number | null;
  documentos?: { documento_id: number; tipo_documento_id: number; nombre: string; estado?: DocumentState }[];
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
  tipo_documento_ids?: number[];
  componentes?: Record<string,string>;
  tipo_documento_nombre: string | null;
  tipo_requisito: string | null;
  cuenta_cumplimiento?: boolean;
  grupo_visual?: string | null;
  tipo_vinculacion_id: number | null;
  vigencia_meses: number | null;
}

export interface ContextualChecklistRequirementInput {
  motivo_aplicabilidad?: string;
  aplica?: boolean;
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
  tipo_documento_ids?: number[];
  componentes?: Record<string,string>;
  tipo_vinculacion_id: number | null;
  vigencia_meses: number | null;
  tipo_requisito?: string | null;
  cuenta_cumplimiento?: boolean;
  grupo_visual?: string | null;
}

export interface ContextualChecklistDocumentInput {
  estado_revision?: string | null;
  policy_type?: { requiere_fecha_expedicion?:boolean; requiere_fecha_vencimiento?:boolean; tiene_vencimiento?:boolean; vigencia_dias_default?:number|null; dias_alerta_amarilla?:number };

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
  exigibles: number;
  cumplidos: number;
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

  // One canonical position; duplicate contextual rows must not create additional obligations.
  const byCanonical = new Map<string,ContextualChecklistRequirementInput>();
  for(const requirement of input.requirements){
    const key=requirement.codigo??`id:${requirement.id}`;
    const previous=byCanonical.get(key);
    byCanonical.set(key,previous ? {...requirement,tipo_documento_ids:[...new Set([
      ...(previous.tipo_documento_ids??[previous.tipo_documento_id]),...(requirement.tipo_documento_ids??[requirement.tipo_documento_id]),
    ])],componentes:{...previous.componentes,...requirement.componentes}} : requirement);
  }
  const uniqueRequirements = [...byCanonical.values()];
  const requisitos = uniqueRequirements.map((requirement) => {
    const aplica = requirement.aplica !== false;
    const excluded = ['OPCIONAL','ACREDITABLE','HISTORICO','PROCESS_SUPPORT','SYSTEM_GENERATED'].includes(requirement.tipo_requisito ?? '');
    const obligatorio = aplica && requirement.obligatorio && !excluded;
    const isDotacion = ['DOTACION','DOTACION_HISTORICA'].includes(requirement.codigo ?? '');
    const documentIndex = requirement.ambito_documental === 'PERSONA' ? personaDocumentIndex : vinculacionDocumentIndex;
    const candidateDocuments = (requirement.tipo_documento_ids ?? [requirement.tipo_documento_id])
      .map(typeId => documentIndex.get(typeId) ?? null)
      .filter((document): document is ContextualChecklistDocumentInput => Boolean(document))
      .sort((a,b)=>String(b.fecha_carga).localeCompare(String(a.fecha_carga)) || b.id-a.id);
    const composite = requirement.codigo === 'MANIPULACION';
    const sourceDocument = candidateDocuments[0] ?? null;
    const evaluate = (d: ContextualChecklistDocumentInput) => documentState({...d,fecha_expedicion:toDateString(d.fecha_expedicion),fecha_vencimiento:toDateString(d.fecha_vencimiento)},documentPolicy(requirement.codigo ?? '',d.policy_type),todayIso);
    const computedFechaVencimiento = sourceDocument && documentPolicy(requirement.codigo ?? '',sourceDocument.policy_type).kind !== 'NORMAL' ? toDateString(sourceDocument.fecha_vencimiento) : null;
    const diasParaVencimiento = computedFechaVencimiento ? daysBetween(todayIso,computedFechaVencimiento) : null;
    const origin = resolveOrigin(requirement.contrato_cargo_id,requirement.tipo_vinculacion_id);
    let estadoDetallado: ChecklistDetailedState = sourceDocument ? evaluate(sourceDocument) : 'SIN_DOCUMENTO';
    let observacion: string | null = null;
    if (requirement.aplica === false || (!sourceDocument && !requirement.obligatorio && requirement.tipo_requisito !== 'ACREDITABLE')) {
      estadoDetallado='NO_APLICA';
    } else if (composite) {
      const componentKey = (id:number) => requirement.componentes?.[String(id)] ?? String(id);
      const required = new Set(requirement.componentes ? Object.values(requirement.componentes).filter(Boolean) : (requirement.tipo_documento_ids ?? []).map(String));
      const latestByComponent = new Map<string,ContextualChecklistDocumentInput>();
      for(const d of candidateDocuments) if(!latestByComponent.has(componentKey(d.tipo_documento_id)))latestByComponent.set(componentKey(d.tipo_documento_id),d);
      const compliant=[...latestByComponent.values()].filter(d=>countsAsApproved(evaluate(d))).length;
      estadoDetallado = required.size >= 2 && compliant === required.size ? 'COMPLETO' : compliant > 0 ? 'PARCIAL' : 'PENDIENTE';
    }
    const estado: LegacyChecklistState = estadoDetallado === 'VENCIDO' ? 'VENCIDO' : sourceDocument ? 'CARGADO' : 'FALTANTE';

    return {
      aplica, obligatorio, motivo_aplicabilidad:requirement.motivo_aplicabilidad,
      cuenta_numerador:obligatorio&&['APROBADO','POR_VENCER'].includes(estadoDetallado),
      requisito_id: requirement.id,
      nombre_requisito: requirement.nombre_requisito,
      codigo: requirement.codigo,
      tipo_documento_id: requirement.tipo_documento_id,
      tipo_documento_ids: requirement.tipo_documento_ids ?? [requirement.tipo_documento_id],
      tipo_documento_nombre: requirement.nombre_documento,
      tipo_requisito: requirement.tipo_requisito ?? null,
      cuenta_cumplimiento: obligatorio,
      grupo_visual: requirement.grupo_visual ?? null,
      ambito_documental: sourceDocument?.fuente_documento ?? requirement.ambito_documental,
      requiere_fecha_expedicion: requirement.requiere_fecha_expedicion,
      requiere_fecha_vencimiento: requirement.requiere_fecha_vencimiento,
      vigencia_meses: requirement.vigencia_meses,
      contrato_cargo_id: requirement.contrato_cargo_id,
      tipo_vinculacion_id: requirement.tipo_vinculacion_id,
      origen: origin,
      detalle_contexto: origin,
      documentos: (isDotacion ? candidateDocuments : requirement.ambito_documental === 'PERSONA' ? input.personaDocuments : input.vinculacionDocuments)
        .filter(d => d.activo && (isDotacion || (requirement.tipo_documento_ids ?? [requirement.tipo_documento_id]).includes(d.tipo_documento_id)))
        .map(d => ({ documento_id: d.id, tipo_documento_id: d.tipo_documento_id, nombre: d.nombre_original, estado: evaluate(d) })),
      documento_id: sourceDocument ? sourceDocument.id : null,
      fuente_documento: sourceDocument ? sourceDocument.fuente_documento ?? requirement.ambito_documental : null,
      fecha_vencimiento: computedFechaVencimiento,
      dias_para_vencimiento: diasParaVencimiento,
      estado,
      estado_detallado: estadoDetallado,
      observacion
    } satisfies ContextualChecklistItem;
  });

  const exigibles = requisitos.filter((item) => item.aplica && item.obligatorio);
  const totalRequisitos = exigibles.length;
  const completos = exigibles.filter((item) => item.estado_detallado === 'APROBADO').length;
  const proximosVencer = exigibles.filter(
    (item) => item.estado_detallado === 'POR_VENCER'
  ).length;
  const pendientes = exigibles.filter((item) => ['PENDIENTE','SIN_DOCUMENTO','PENDIENTE_REVISION','RECHAZADO','PARCIAL'].includes(item.estado_detallado)).length;
  const noAplica = requisitos.filter((item) => item.estado_detallado === 'NO_APLICA').length;
  const cargados = requisitos.filter((item) => item.estado === 'CARGADO').length;
  const vencidos = exigibles.filter((item) => item.estado === 'VENCIDO').length;
  const cumplimientoPorcentaje =
    totalRequisitos === 0
      ? 0
      : Number((((completos + proximosVencer) / totalRequisitos) * 100).toFixed(2));

  return {
    vinculacion_id: input.vinculacionId,
    persona_id: input.personaId,
    contrato_id: input.contratoId,
    contrato_cargo_id: input.contratoCargoId,
    exigibles: totalRequisitos,
    cumplidos: completos + proximosVencer,
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

// Compatibility export for callers; the canonical policy lives in the domain module.
export function resolveCanonicalApplicability(code:string|null,type:string,configured:boolean|null,cotizaPension:boolean|null,cargoNombre?:string|null) {
  const {aplica,obligatorio}=resolvePersonalRequirement(code,type,configured,cotizaPension,cargoNombre);
  return {aplica,obligatorio};
}

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
          c.id::text AS id, c.nombre AS nombre_requisito,
          COALESCE(rr.aplica,legacy.aplica) AS regla_aplica, legacy.obligatorio AS regla_obligatorio, v.cotiza_pension, cc.nombre_cargo AS cargo_nombre, c.activo,
          'PERSONA'::text AS ambito_documental,
          false AS requiere_fecha_expedicion, false AS requiere_fecha_vencimiento,
          NULL::int AS vigencia_meses, 30 AS dias_proximo_vencimiento,
          NULL::text AS contrato_cargo_id, NULL::text AS tipo_vinculacion_id,
          MIN(a.tipo_documento_id)::text AS tipo_documento_id,
          ARRAY_AGG(a.tipo_documento_id::text ORDER BY a.tipo_alias, a.tipo_documento_id) AS tipo_documento_ids,
          COALESCE(jsonb_object_agg(a.tipo_documento_id::text,a.componente_codigo) FILTER (WHERE a.tipo_documento_id IS NOT NULL AND a.componente_codigo IS NOT NULL),'{}'::jsonb) AS componentes,
          c.codigo AS codigo, MIN(td.nombre_documento) AS nombre_documento,
          c.tipo_requisito, c.cuenta_cumplimiento, c.grupo_visual
        FROM documentos_requisitos_canonicos c
        LEFT JOIN documentos_requisitos_aliases a ON a.requisito_canonico_id = c.id
        LEFT JOIN tipos_documentos td ON td.id = a.tipo_documento_id
        JOIN vinculaciones v ON v.id::text = $4
        LEFT JOIN contrato_cargos cc ON cc.id::text = $2
        LEFT JOIN LATERAL (
          SELECT r.aplica FROM documentos_requisitos_reglas r
          WHERE r.requisito_canonico_id = c.id
            AND (r.contrato_id IS NULL OR r.contrato_id::text = $1)
            AND (r.contrato_cargo_id IS NULL OR r.contrato_cargo_id::text = $2)
            AND (r.tipo_vinculacion_id IS NULL OR r.tipo_vinculacion_id::text = $3)
          ORDER BY ((r.contrato_id IS NOT NULL)::int + (r.contrato_cargo_id IS NOT NULL)::int
            + (r.tipo_vinculacion_id IS NOT NULL)::int) DESC, r.id DESC
          LIMIT 1
        ) rr ON TRUE
        LEFT JOIN LATERAL (
          SELECT true AS aplica,r.obligatorio FROM contrato_documento_requisitos r
          WHERE r.activo AND r.objetivo_requisito='VINCULACION' AND r.contrato_id::text=$1
            AND (r.contrato_cargo_id IS NULL OR r.contrato_cargo_id::text=$2)
            AND (r.tipo_vinculacion_id IS NULL OR r.tipo_vinculacion_id::text=$3)
            AND r.tipo_documento_id IN (SELECT ax.tipo_documento_id FROM documentos_requisitos_aliases ax WHERE ax.requisito_canonico_id=c.id)
          ORDER BY ((r.contrato_cargo_id IS NOT NULL)::int+(r.tipo_vinculacion_id IS NOT NULL)::int) DESC,r.id DESC LIMIT 1
        ) legacy ON TRUE
        WHERE c.activo = TRUE AND (c.tipo_requisito <> 'HISTORICO' OR c.codigo='DOTACION_HISTORICA')
        GROUP BY c.id, c.codigo, c.nombre, c.tipo_requisito, c.cuenta_cumplimiento, c.grupo_visual,
          rr.aplica, legacy.aplica, legacy.obligatorio, v.cotiza_pension, cc.nombre_cargo
        ORDER BY
          c.id ASC
      `,
      [vinculacion.contrato_id, contratoCargoContext, tipoVinculacionContext, vinculacionId]
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
          dv.activo, dv.estado_revision, to_jsonb(td) AS policy_type
        FROM documentos_vinculacion dv
        INNER JOIN tipos_documentos td ON td.id = dv.tipo_documento_id
        WHERE dv.vinculacion_id::text = $1
          AND dv.activo = TRUE AND dv.es_vigente = TRUE
          AND COALESCE(NULLIF(dv.storage_path,''),NULLIF(dv.archivo_path,'')) IS NOT NULL
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
          EXISTS(SELECT 1 FROM sst_dotacion_epp_entregas e JOIN sst_dotacion_epp i ON i.id=e.item_id
            JOIN vinculaciones vc ON vc.id::text=$2 JOIN contratos ct ON ct.id=vc.contrato_id
            WHERE e.documento_persona_id=dp.id AND e.persona_id=dp.persona_id AND e.activo AND i.activo
              AND i.tipo_item='DOTACION' AND e.estado_entrega IN ('ENTREGADO','REPUESTO')
              AND i.empresa_id=ct.empresa_id AND (i.contrato_id IS NULL OR i.contrato_id=vc.contrato_id)
              AND (e.vinculacion_id=vc.id OR (e.vinculacion_id IS NULL AND i.contrato_id=vc.contrato_id))) AS dotacion_evidencia,
          dp.activo, dp.metadatos_revision, dp.estado_revision, to_jsonb(td) AS policy_type
        FROM documentos_persona dp
        INNER JOIN tipos_documentos td ON td.id = dp.tipo_documento_id
        WHERE dp.persona_id::text = $1
          AND dp.activo = TRUE
          AND dp.es_vigente = TRUE
          AND COALESCE(NULLIF(dp.storage_path,''),NULLIF(dp.archivo_path,'')) IS NOT NULL
        ORDER BY dp.fecha_carga DESC, dp.version DESC, dp.id DESC
      `,
      [vinculacion.persona_id,vinculacionId]
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
      ...resolvePersonalRequirement(requirement.codigo, requirement.tipo_requisito, requirement.regla_aplica, requirement.cotiza_pension, requirement.cargo_nombre, requirement.regla_obligatorio),
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
      tipo_documento_ids: (requirement.tipo_documento_ids ?? []).filter(value => value !== null).map(value => toNumber(value)),
      codigo: requirement.codigo,
      componentes: requirement.componentes,
      nombre_documento: requirement.nombre_documento,
      grupo_visual: requirement.grupo_visual
    })),
    vinculacionDocuments: vinculacionDocumentsResult.rows.map((document) => ({
      id: toNumber(document.id),
      tipo_documento_id: toNumber(document.tipo_documento_id),
      tipo_documento_nombre: document.tipo_documento_nombre,
      nombre_original: document.nombre_original,
      fecha_expedicion: document.fecha_expedicion,
      fecha_vencimiento: document.fecha_vencimiento,
      fecha_carga: document.fecha_carga,
      activo: document.activo,
      estado_revision: document.estado_revision,
      policy_type: document.policy_type
    })),
    personaDocuments: personaDocumentsResult.rows.map((document) => ({
      id: toNumber(document.id),
      tipo_documento_id: toNumber(document.tipo_documento_id),
      tipo_documento_nombre: document.tipo_documento_nombre,
      nombre_original: document.nombre_original,
      fecha_expedicion: document.fecha_expedicion,
      fecha_vencimiento: document.fecha_vencimiento,
      fecha_carga: document.fecha_carga,
      activo: document.activo,
      estado_revision: document.estado_revision,
      policy_type: document.policy_type
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

