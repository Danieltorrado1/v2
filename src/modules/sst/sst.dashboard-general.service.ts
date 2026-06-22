import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import {
  getSstAccidentesAlertas,
  getSstAccidentesDashboard,
  getSstAlertas,
  getSstCapacitacionesDashboard,
  getSstDotacionEppAlertas,
  getSstDotacionEppDashboard,
  getSstExamenesAlertas,
  getSstExamenesDashboard
} from './sst.service';
import { getSstInspeccionesAlertas, getSstInspeccionesDashboard } from './sst.inspecciones.service';
import { getSstMatrizRiesgosAlertas, getSstMatrizRiesgosDashboard } from './sst.riesgos.service';
import {
  ListSstDashboardGeneralAlertasQuery,
  ListSstDashboardGeneralQuery
} from './sst.schemas';

type ConsolidatedSeverity = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';

export interface SstDashboardGeneral {
  accidentes: {
    abiertos: number;
    accidentes_total: number;
    acciones_correctivas_abiertas: number;
    cerrados: number;
    incidentes_total: number;
    investigacion: number;
  };
  alertas: {
    alertas_altas_total: number;
    alertas_bajas_total: number;
    alertas_criticas_total: number;
    alertas_medias_total: number;
  };
  capacitaciones: {
    capacitaciones_proximas_vencer: number;
    capacitaciones_total: number;
    capacitaciones_vencidas: number;
    capacitaciones_vigentes: number;
  };
  dotacion: {
    dotacion_total: number;
    entregas_total: number;
    reposiciones_proximas: number;
    reposiciones_vencidas: number;
  };
  examenes: {
    aptos: number;
    aptos_con_restricciones: number;
    examenes_total: number;
    examenes_vencidos: number;
    examenes_vigentes: number;
    no_aptos: number;
  };
  indicadores: {
    clasificacion: 'CRITICO' | 'MEDIO' | 'BUENO' | 'EXCELENTE';
    cumplimiento_acciones_correctivas: number;
    cumplimiento_capacitaciones: number;
    cumplimiento_dotacion: number;
    cumplimiento_examenes: number;
    cumplimiento_general_sst: number;
  };
  inspecciones: {
    acciones_inspeccion_abiertas: number;
    acciones_inspeccion_vencidas: number;
    hallazgos_criticos: number;
    hallazgos_total: number;
    inspecciones_total: number;
  };
  riesgos: {
    riesgos_altos: number;
    riesgos_criticos: number;
    riesgos_total: number;
  };
  resumen: {
    alertas_total: number;
    clasificacion: 'CRITICO' | 'MEDIO' | 'BUENO' | 'EXCELENTE';
    cumplimiento_general_sst: number;
    contrato_id: number | null;
    empresa_id: number | null;
  };
}

export interface SstDashboardGeneralAlertaItem {
  descripcion: string;
  fecha_alerta: string;
  id: string;
  modulo: 'CAPACITACIONES' | 'DOTACION' | 'EXAMENES' | 'ACCIDENTES' | 'INSPECCIONES' | 'RIESGOS';
  referencia: {
    entidad: string | null;
    id: number | string | null;
  };
  severidad: ConsolidatedSeverity;
  tipo_alerta: string;
  titulo: string;
}

export interface PaginatedSstDashboardGeneralAlertas {
  items: SstDashboardGeneralAlertaItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    total_pages: number;
  };
}

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundPercentage = (value: number): number => Math.round(value * 100) / 100;

const resolveGeneralClassification = (
  cumplimiento: number
): SstDashboardGeneral['indicadores']['clasificacion'] => {
  if (cumplimiento >= 90) {
    return 'EXCELENTE';
  }

  if (cumplimiento >= 80) {
    return 'BUENO';
  }

  if (cumplimiento >= 60) {
    return 'MEDIO';
  }

  return 'CRITICO';
};

const severityWeight = (value: ConsolidatedSeverity): number => {
  if (value === 'CRITICA') return 4;
  if (value === 'ALTA') return 3;
  if (value === 'MEDIA') return 2;
  return 1;
};

export const getSstDashboardGeneral = async (
  filters: ListSstDashboardGeneralQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<SstDashboardGeneral> => {
  const [capacitaciones, dotacion, examenes, accidentes, inspecciones, riesgos, alertas] = await Promise.all([
    getSstCapacitacionesDashboard(filters, actorUserId, tenant, auditMeta),
    getSstDotacionEppDashboard(filters, actorUserId, tenant, auditMeta),
    getSstExamenesDashboard(filters, actorUserId, tenant, auditMeta),
    getSstAccidentesDashboard(filters, actorUserId, tenant, auditMeta),
    getSstInspeccionesDashboard(filters, actorUserId, tenant, auditMeta),
    getSstMatrizRiesgosDashboard(filters, actorUserId, tenant, auditMeta),
    getSstDashboardGeneralAlertas(
      {
        ...filters,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    )
  ]);

  const cumplimiento_capacitaciones = capacitaciones.cumplimiento_porcentaje;
  const cumplimiento_dotacion = dotacion.cumplimiento_porcentaje;
  const cumplimiento_examenes = examenes.cumplimiento_porcentaje;
  const cumplimiento_acciones_correctivas = accidentes.cumplimiento_acciones_porcentaje;
  const cumplimiento_general_sst = roundPercentage(
    (
      cumplimiento_capacitaciones +
      cumplimiento_dotacion +
      cumplimiento_examenes +
      cumplimiento_acciones_correctivas
    ) / 4
  );
  const clasificacion = resolveGeneralClassification(cumplimiento_general_sst);

  const criticas = alertas.items.filter((item) => item.severidad === 'CRITICA').length;
  const altas = alertas.items.filter((item) => item.severidad === 'ALTA').length;
  const medias = alertas.items.filter((item) => item.severidad === 'MEDIA').length;
  const bajas = alertas.items.filter((item) => item.severidad === 'BAJA').length;

  const response: SstDashboardGeneral = {
    resumen: {
      empresa_id: toNullableNumber(filters.empresa_id),
      contrato_id: toNullableNumber(filters.contrato_id),
      alertas_total: alertas.pagination.total,
      cumplimiento_general_sst,
      clasificacion
    },
    capacitaciones: {
      capacitaciones_total: capacitaciones.capacitaciones_total,
      capacitaciones_vigentes: capacitaciones.capacitaciones_vigentes,
      capacitaciones_vencidas: capacitaciones.capacitaciones_vencidas,
      capacitaciones_proximas_vencer: capacitaciones.proximas_a_vencer_30_dias
    },
    dotacion: {
      dotacion_total: dotacion.items_total,
      entregas_total: dotacion.entregas_total,
      reposiciones_proximas: dotacion.proximas_reposicion_30_dias,
      reposiciones_vencidas: dotacion.entregas_vencidas
    },
    examenes: {
      examenes_total: examenes.registros_total,
      examenes_vigentes: examenes.examenes_vigentes,
      examenes_vencidos: examenes.examenes_vencidos,
      aptos: examenes.aptos,
      aptos_con_restricciones: examenes.aptos_con_restricciones,
      no_aptos: examenes.no_aptos
    },
    accidentes: {
      accidentes_total: accidentes.accidentes_total,
      incidentes_total: accidentes.incidentes_total,
      abiertos: accidentes.abiertos,
      investigacion: accidentes.investigacion,
      cerrados: accidentes.cerrados,
      acciones_correctivas_abiertas: accidentes.acciones_abiertas
    },
    inspecciones: {
      inspecciones_total: inspecciones.inspecciones_total,
      hallazgos_total: inspecciones.hallazgos_total,
      hallazgos_criticos: inspecciones.hallazgos_criticos,
      acciones_inspeccion_abiertas: inspecciones.acciones_abiertas,
      acciones_inspeccion_vencidas: inspecciones.acciones_vencidas
    },
    riesgos: {
      riesgos_total: riesgos.riesgos_total,
      riesgos_altos: riesgos.riesgos_altos,
      riesgos_criticos: riesgos.riesgos_criticos
    },
    alertas: {
      alertas_criticas_total: criticas,
      alertas_altas_total: altas,
      alertas_medias_total: medias,
      alertas_bajas_total: bajas
    },
    indicadores: {
      cumplimiento_capacitaciones,
      cumplimiento_dotacion,
      cumplimiento_examenes,
      cumplimiento_acciones_correctivas,
      cumplimiento_general_sst,
      clasificacion
    }
  };

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_DASHBOARD_GENERAL_VIEW',
    tabla: 'sst_dashboard_general',
    registro_id: `dashboard-general:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de dashboard general SST',
    after: response,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  }).catch(() => undefined);

  return response;
};

export const getSstDashboardGeneralAlertas = async (
  filters: ListSstDashboardGeneralAlertasQuery,
  actorUserId: string,
  tenant?: TenantAccessContext,
  auditMeta?: AuditRequestMeta
): Promise<PaginatedSstDashboardGeneralAlertas> => {
  const [capacitaciones, dotacion, examenes, accidentes, inspecciones, riesgos] = await Promise.all([
    getSstAlertas(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    ),
    getSstDotacionEppAlertas(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    ),
    getSstExamenesAlertas(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    ),
    getSstAccidentesAlertas(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    ),
    getSstInspeccionesAlertas(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    ),
    getSstMatrizRiesgosAlertas(
      {
        empresa_id: filters.empresa_id,
        contrato_id: filters.contrato_id,
        page: 1,
        limit: 5000
      },
      actorUserId,
      tenant,
      auditMeta
    )
  ]);

  const items: SstDashboardGeneralAlertaItem[] = [
    ...capacitaciones.items.map((item) => ({
      id: item.id,
      modulo: 'CAPACITACIONES' as const,
      tipo_alerta: item.tipo_alerta,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_alerta: item.fecha_alerta,
      referencia: {
        entidad: 'sst_capacitaciones_persona',
        id: item.capacitacion.id
      }
    })),
    ...dotacion.items.map((item) => ({
      id: item.id,
      modulo: 'DOTACION' as const,
      tipo_alerta: item.tipo_alerta,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_alerta: item.fecha_alerta,
      referencia: {
        entidad: 'sst_dotacion_epp_entregas',
        id: item.item.id
      }
    })),
    ...examenes.items.map((item) => ({
      id: item.id,
      modulo: 'EXAMENES' as const,
      tipo_alerta: item.tipo_alerta,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_alerta: item.fecha_alerta,
      referencia: {
        entidad: 'sst_examenes_persona',
        id: item.examen.id
      }
    })),
    ...accidentes.items.map((item) => ({
      id: item.id,
      modulo: 'ACCIDENTES' as const,
      tipo_alerta: item.tipo_alerta,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_alerta: item.fecha_alerta,
      referencia: {
        entidad: item.accion_correctiva ? 'sst_accidentes_acciones' : 'sst_accidentes_incidentes',
        id: item.accion_correctiva?.id ?? item.accidente?.id ?? null
      }
    })),
    ...inspecciones.items.map((item) => ({
      id: item.id,
      modulo: 'INSPECCIONES' as const,
      tipo_alerta: item.tipo_alerta,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_alerta: item.fecha_alerta,
      referencia: {
        entidad: item.accion ? 'sst_inspecciones_acciones' : item.hallazgo ? 'sst_inspecciones_hallazgos' : 'sst_inspecciones',
        id: item.accion?.id ?? item.hallazgo?.id ?? item.inspeccion.id
      }
    })),
    ...riesgos.items.map((item) => ({
      id: item.id,
      modulo: 'RIESGOS' as const,
      tipo_alerta: item.tipo_alerta,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion,
      fecha_alerta: item.fecha_alerta,
      referencia: {
        entidad: 'sst_matriz_riesgos',
        id: item.riesgo.id
      }
    }))
  ];

  items.sort((left, right) => {
    const severityDiff = severityWeight(right.severidad) - severityWeight(left.severidad);
    if (severityDiff !== 0) {
      return severityDiff;
    }

    return right.fecha_alerta.localeCompare(left.fecha_alerta);
  });

  const offset = (filters.page - 1) * filters.limit;
  const pagedItems = items.slice(offset, offset + filters.limit);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'SST_ALERTAS_CONSOLIDADAS_VIEW',
    tabla: 'sst_dashboard_general',
    registro_id: `alertas-consolidadas:${filters.empresa_id ?? 'all'}:${filters.contrato_id ?? 'all'}`,
    descripcion: 'Consulta de alertas consolidadas SST',
    after: {
      total_alertas: items.length,
      empresa_id: filters.empresa_id ?? null,
      contrato_id: filters.contrato_id ?? null
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
