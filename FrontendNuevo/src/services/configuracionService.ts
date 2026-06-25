import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EstadoConfig   = 'activo' | 'inactivo';
export type MetodoPersonal = 'formula' | 'rangos';
export type ReglaRedondeo  = 'nearest' | 'floor' | 'ceil' | 'none';

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
  vigencia_desde: string;
  vigencia_hasta?: string;
  estado: EstadoConfig;
  observacion_cambio?: string;
  nombre_usuario_creacion?: string;
  creado_en: string;
  modificado_en: string;
}

export interface PersonalRango {
  id: number;
  config_id: number;
  desde: number;
  hasta?: number | null;
  personal_requerido: number;
  orden: number;
  estado: EstadoConfig;
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
  vigencia_desde: string;
  vigencia_hasta?: string;
  estado: EstadoConfig;
  observacion_cambio?: string;
  nombre_usuario_creacion?: string;
  creado_en: string;
  modificado_en: string;
  rangos?: PersonalRango[];
}

export interface CreateSalarioInput {
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

export interface CreatePersonalInput {
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
  rangos?: Array<{ desde: number; hasta?: number | null; personal_requerido: number }>;
}

export interface ProbarSalarioResult {
  formula_aplicada: string;
  variables: Record<string, number>;
  resultado: number;
  advertencias: string[];
}

export interface ProbarPersonalResult {
  metodo_aplicado: MetodoPersonal;
  resultado: number;
  resultado_redondeado: number;
  detalle: string;
  advertencias: string[];
}

// ─── Salary API ───────────────────────────────────────────────────────────────

export async function fetchSalarioConfigs(): Promise<SalarioConfig[]> {
  const res = await api.get<{ data: SalarioConfig[] }>('/configuracion/calculadoras/salario');
  return res.data.data;
}

export async function fetchSalarioConfigActiva(): Promise<SalarioConfig | null> {
  try {
    const res = await api.get<{ data: SalarioConfig }>('/configuracion/calculadoras/salario/activa');
    return res.data.data;
  } catch {
    return null;
  }
}

export async function createSalarioConfig(input: CreateSalarioInput): Promise<SalarioConfig> {
  const res = await api.post<{ data: SalarioConfig }>('/configuracion/calculadoras/salario', input);
  return res.data.data;
}

export async function toggleSalarioEstado(
  id: number,
  estado: EstadoConfig,
  observacion?: string,
): Promise<SalarioConfig> {
  const res = await api.patch<{ data: SalarioConfig }>(
    `/configuracion/calculadoras/salario/${id}/estado`,
    { estado, observacion },
  );
  return res.data.data;
}

export async function probarSalario(params: {
  formula: string;
  variables_permitidas: string[];
  salario_base: number;
  auxilio_transporte: number;
  adiciones: number;
  recargos: number;
  salud: number;
  pension: number;
  deducciones: number;
}): Promise<ProbarSalarioResult> {
  const res = await api.post<{ data: ProbarSalarioResult }>('/configuracion/calculadoras/salario/probar', params);
  return res.data.data;
}

export async function validarFormula(
  formula: string,
  variables_permitidas: string[],
): Promise<{ valid: boolean; error?: string }> {
  const res = await api.post<{ data: { valid: boolean; error?: string } }>(
    '/configuracion/calculadoras/formula/validar',
    { formula, variables_permitidas },
  );
  return res.data.data;
}

// ─── Personnel API ────────────────────────────────────────────────────────────

export async function fetchPersonalConfigs(): Promise<PersonalConfig[]> {
  const res = await api.get<{ data: PersonalConfig[] }>('/configuracion/calculadoras/personal');
  return res.data.data;
}

export async function fetchPersonalConfigActiva(modalidad?: string): Promise<PersonalConfig | null> {
  try {
    const res = await api.get<{ data: PersonalConfig }>(
      '/configuracion/calculadoras/personal/activa',
      { params: modalidad ? { modalidad } : undefined },
    );
    return res.data.data;
  } catch {
    return null;
  }
}

export async function createPersonalConfig(input: CreatePersonalInput): Promise<PersonalConfig> {
  const res = await api.post<{ data: PersonalConfig }>('/configuracion/calculadoras/personal', input);
  return res.data.data;
}

export async function togglePersonalEstado(
  id: number,
  estado: EstadoConfig,
  observacion?: string,
): Promise<PersonalConfig> {
  const res = await api.patch<{ data: PersonalConfig }>(
    `/configuracion/calculadoras/personal/${id}/estado`,
    { estado, observacion },
  );
  return res.data.data;
}

export async function updatePersonalRangos(
  configId: number,
  rangos: Array<{ desde: number; hasta?: number | null; personal_requerido: number }>,
): Promise<PersonalRango[]> {
  const res = await api.put<{ data: PersonalRango[] }>(
    `/configuracion/calculadoras/personal/${configId}/rangos`,
    { rangos },
  );
  return res.data.data;
}

export async function probarPersonal(params: {
  metodo: MetodoPersonal;
  formula?: string;
  variables_permitidas?: string[];
  rangos?: Array<{ desde: number; hasta?: number | null; personal_requerido: number }>;
  cupos: number;
  base?: number;
  minimo?: number;
  divisor?: number;
  regla_redondeo?: ReglaRedondeo;
}): Promise<ProbarPersonalResult> {
  const res = await api.post<{ data: ProbarPersonalResult }>(
    '/configuracion/calculadoras/personal/probar',
    params,
  );
  return res.data.data;
}
