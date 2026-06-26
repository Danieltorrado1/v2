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
