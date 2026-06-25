export type EstadoConfig   = 'activo' | 'inactivo';
export type MetodoPersonal = 'formula' | 'rangos';
export type ReglaRedondeo  = 'nearest' | 'floor' | 'ceil' | 'none';

// ─── Salary ──────────────────────────────────────────────────────────────────

export interface SalarioConfig {
  id: number;
  version: number;
  nombre: string;
  descripcion?: string;
  salario_base_tc: number;
  salario_base_mt: number;
  salario_base_ops: number;
  auxilio_transporte: number;
  porcentaje_salud: number;
  porcentaje_pension: number;
  recargo_horas_extra: number;
  dias_mes: number;
  formula_neto: string;
  variables_permitidas: string[];
  regla_redondeo: ReglaRedondeo;
  config_padre_id?: number;
  vigencia_desde: string;
  vigencia_hasta?: string;
  estado: EstadoConfig;
  observacion_cambio?: string;
  usuario_creacion: number;
  usuario_modificacion?: number;
  nombre_usuario_creacion?: string;
  creado_en: string;
  modificado_en: string;
}

export interface CreateSalarioConfigInput {
  nombre: string;
  descripcion?: string;
  salario_base_tc: number;
  salario_base_mt: number;
  salario_base_ops: number;
  auxilio_transporte: number;
  porcentaje_salud: number;
  porcentaje_pension: number;
  recargo_horas_extra: number;
  dias_mes?: number;
  formula_neto: string;
  variables_permitidas?: string[];
  regla_redondeo?: ReglaRedondeo;
  vigencia_desde: string;
  vigencia_hasta?: string;
  observacion_cambio?: string;
}

// ─── Personnel ────────────────────────────────────────────────────────────────

export interface PersonalRango {
  id: number;
  config_id: number;
  desde: number;
  hasta?: number | null;
  personal_requerido: number;
  orden: number;
  estado: EstadoConfig;
  creado_en: string;
}

export interface PersonalConfig {
  id: number;
  version: number;
  nombre: string;
  descripcion?: string;
  metodo: MetodoPersonal;
  modalidad?: string;
  formula?: string;
  variables_permitidas: string[];
  personal_minimo: number;
  personal_maximo?: number;
  regla_redondeo: ReglaRedondeo;
  config_padre_id?: number;
  vigencia_desde: string;
  vigencia_hasta?: string;
  estado: EstadoConfig;
  observacion_cambio?: string;
  usuario_creacion: number;
  usuario_modificacion?: number;
  nombre_usuario_creacion?: string;
  creado_en: string;
  modificado_en: string;
  rangos?: PersonalRango[];
}

export interface RangoInput {
  desde: number;
  hasta?: number | null;
  personal_requerido: number;
}

export interface CreatePersonalConfigInput {
  nombre: string;
  descripcion?: string;
  metodo: MetodoPersonal;
  modalidad?: string;
  formula?: string;
  variables_permitidas?: string[];
  personal_minimo?: number;
  personal_maximo?: number;
  regla_redondeo?: ReglaRedondeo;
  vigencia_desde: string;
  vigencia_hasta?: string;
  observacion_cambio?: string;
  rangos?: RangoInput[];
}

// ─── Test Calculation ─────────────────────────────────────────────────────────

export interface ProbarSalarioInput {
  formula: string;
  variables_permitidas: string[];
  salario_base: number;
  auxilio_transporte: number;
  adiciones: number;
  recargos: number;
  salud: number;
  pension: number;
  deducciones: number;
}

export interface ProbarSalarioResult {
  formula_aplicada: string;
  variables: Record<string, number>;
  resultado: number;
  advertencias: string[];
}

export interface ProbarPersonalInput {
  metodo: MetodoPersonal;
  formula?: string;
  variables_permitidas?: string[];
  rangos?: RangoInput[];
  cupos: number;
  base?: number;
  minimo?: number;
  divisor?: number;
  regla_redondeo?: ReglaRedondeo;
}

export interface ProbarPersonalResult {
  metodo_aplicado: MetodoPersonal;
  resultado: number;
  resultado_redondeado: number;
  detalle: string;
  advertencias: string[];
}

// ─── Formula Validation ───────────────────────────────────────────────────────

export interface ValidacionFormula {
  valid: boolean;
  error?: string;
}
