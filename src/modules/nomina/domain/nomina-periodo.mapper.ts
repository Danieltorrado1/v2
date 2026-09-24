import type { NominaPeriodoRepositoryRow } from '../infrastructure/repositories/nomina-periodo.repository';

export interface NominaPeriodo {
  anulado_at?: string | null;
  anulado_por?: string | null;
  activo: boolean;
  contrato: {
    empresa_id: string | null;
    entidad_contratante: string | null;
    fecha_finalizacion: string | null;
    fecha_inicio: string | null;
    id: string;
    numero_contrato: string | null;
  } | null;
  contrato_id: string | null;
  created_at: string;
  estado: string;
  fecha_fin: string;
  fecha_inicio: string;
  id: string;
  nombre_periodo: string;
  motivo_anulacion?: string | null;
  periodo_canonico_id?: string | null;
  requiere_asistencia: boolean;
  tipo_periodo: string;
  descripcion?: string | null;
  empresa_id?: string | null;
  fecha_cierre?: string | null;
  nombre?: string;
  updated_at?: string;
}

const dateString = (value: Date | string | null): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
};

const booleanValue = (value: boolean | null | undefined): boolean => Boolean(value);
const isoString = (value: Date | string | null | undefined): string | null => {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
};

export const mapNominaPeriodo = (row: NominaPeriodoRepositoryRow): NominaPeriodo => {
  const contrato = row.contrato_id
    ? {
        id: row.contrato_id,
        empresa_id: row.contrato_empresa_id,
        numero_contrato: row.contrato_numero,
        entidad_contratante: row.contrato_entidad_contratante,
        fecha_inicio: dateString(row.contrato_fecha_inicio),
        fecha_finalizacion: dateString(row.contrato_fecha_finalizacion)
      }
    : null;

  return {
    id: row.id,
    contrato_id: row.contrato_id,
    nombre_periodo: row.nombre_periodo,
    tipo_periodo: row.tipo_periodo,
    fecha_inicio: dateString(row.fecha_inicio) ?? '',
    fecha_fin: dateString(row.fecha_fin) ?? '',
    requiere_asistencia: booleanValue(row.requiere_asistencia),
    estado: row.estado,
    activo: booleanValue(row.activo),
    created_at: isoString(row.created_at) ?? '',
    anulado_at: isoString(row.anulado_at),
    anulado_por: row.anulado_por,
    motivo_anulacion: row.motivo_anulacion,
    periodo_canonico_id: row.periodo_canonico_id,
    contrato
  };
};
