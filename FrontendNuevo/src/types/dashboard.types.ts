// ── Raw API shapes (mirror backend responses) ─────────────────────────────────

export interface DashboardPersonasApi {
  ingresos_periodo: number;
  personas_activas: number;
  personas_inactivas: number;
  personas_por_cargo: Array<{
    cargo_id: string;
    cargo_nombre: string | null;
    total: number;
  }>;
  personas_por_contrato: Array<{
    contrato_id: string;
    contrato_nombre: string | null;
    total: number;
  }>;
  personas_por_municipio: Array<{
    municipio_id: string | null;
    municipio_nombre: string | null;
    total: number;
  }>;
  retiros_periodo: number;
  total_personas: number;
  vinculaciones_activas: number;
}

export interface DashboardCoberturaApi {
  cobertura_asignada_total: number;
  cobertura_por_modalidad_base: Array<{
    asignada_total: number;
    cobertura_porcentaje: number;
    modalidad_base: string;
    requerida_total: number;
  }>;
  cobertura_por_municipio: Array<{
    asignada_total: number;
    cobertura_porcentaje: number;
    municipio_id: string | null;
    municipio_nombre: string | null;
    requerida_total: number;
  }>;
  cobertura_requerida_total: number;
  cumplimiento_cobertura_porcentaje: number;
  faltantes_total: number;
  sobrecobertura_total: number;
  total_sedes_modalidad: number;
}

export interface DashboardResumenApi {
  alertas_activas: number;
  contratos_activos: number;
  documentos_por_vencer: number;
  documentos_vencidos: number;
  total_contratos: number;
  total_empresas: number;
  total_personas: number;
  vinculaciones_activas: number;
  vinculaciones_retiradas: number;
  vinculaciones_suspendidas: number;
}

export interface DashboardAlertasApi {
  alertas_activas: number;
  alertas_altas: number;
  alertas_criticas: number;
  alertas_por_tipo: Array<{
    tipo_alerta: string;
    total: number;
  }>;
  notificaciones_no_leidas: number;
}

export interface DashboardNominaApi {
  neto_pagado: number;
  novedades_pendientes: number;
  novedades_por_tipo: Array<{
    tipo: string;
    total: number;
    valor_total: number;
  }>;
  periodos_abiertos: number;
  periodos_cerrados: number;
  total_deducciones: number;
  total_devengado: number;
  total_liquidado: number;
  ultimo_periodo: {
    estado: string;
    estado_liquidacion: string;
    fecha_fin: string;
    fecha_inicio: string;
    id: string;
    nombre: string;
  } | null;
}

export interface DashboardSSTApi {
  accidentes_trabajo: number;
  capacitaciones: number;
  enfermedades_laborales: number;
  entregas_epp: number;
  incidentes: number;
  planes_abiertos: number;
  planes_cerrados: number;
  planes_vencidos: number;
  porcentaje_cierre_planes: number;
  total_eventos: number;
}

// ── Normalized frontend types ──────────────────────────────────────────────────

export interface CargoItem {
  id: string;
  label: string;
  value: number;
}

export interface ModalidadSegment {
  label: string;
  count: number;
  colorClass: string;
}

export interface DashboardAlertaTipoItem {
  tipo: string;
  total: number;
}

export interface DashboardNominaNormalizada {
  periodosAbiertos: number;
  novedadesPendientes: number;
  totalDevengado: number;
  netoPagado: number;
  ultimoPeriodoNombre: string | null;
  ultimoPeriodoEstado: string | null;
}

export interface DashboardSSTNormalizado {
  totalEventos: number;
  accidentesTrabajo: number;
  capacitaciones: number;
  porcentajeCierrePlanes: number;
  planesVencidos: number;
  planesAbiertos: number;
}
