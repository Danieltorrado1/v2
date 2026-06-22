import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const identifierSchema = z.preprocess((value) => {
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return value;
}, z.string().trim().min(1));

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

const nullableNumberSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.coerce.number().nullable());

const nullableTimeSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable());

const nonNegativeNumberSchema = z.coerce.number().min(0);
const nonNegativeIntegerSchema = z.coerce.number().int().min(0);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const tipoPeriodoSchema = z.enum(['PRIMERA_QUINCENA', 'SEGUNDA_QUINCENA', 'MENSUAL']);
export const estadoPeriodoSchema = z.enum([
  'ABIERTO',
  'REVISADO',
  'CERRADO',
  'PAGADO',
  'ANULADO'
]);
export const estadoLiquidacionSchema = z.enum(['PRELIMINAR', 'FINAL']);
export const tipoNovedadSchema = z.enum(['ADICION', 'DEDUCCION']);
export const afectaConceptoSchema = z.enum(['SALARIO', 'TRANSPORTE', 'AMBOS']);
export const nominaExportTipoSchema = z.enum([
  'resumen',
  'dashboard',
  'plano_bancario',
  'empleados',
  'novedades',
  'movimientos',
  'desprendibles',
  'liquidaciones',
  'todo'
]);
export const nominaAsistenciaEstadoSchema = z.enum([
  'PENDIENTE',
  'PRESENTE',
  'AUSENTE',
  'INCAPACIDAD',
  'PERMISO',
  'SUSPENSION',
  'DESCANSO',
  'VACACIONES',
  'LICENCIA'
]);
export const nominaMovimientoTipoSchema = z.enum([
  'HORA_EXTRA_DIURNA',
  'HORA_EXTRA_NOCTURNA',
  'RECARGO_NOCTURNO',
  'DOMINICAL',
  'FESTIVO',
  'TURNO_EXTERNO',
  'BONIFICACION',
  'AUXILIO',
  'ADICION_MANUAL',
  'DESCUENTO_MANUAL',
  'EMBARGO',
  'LIBRANZA',
  'AJUSTE'
]);
export const nominaRecargoTipoSchema = z.enum([
  'HORA_EXTRA_DIURNA',
  'HORA_EXTRA_NOCTURNA',
  'RECARGO_NOCTURNO',
  'DOMINICAL',
  'FESTIVO'
]);

export const periodoIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const periodoLiquidacionParamSchema = z.object({
  periodo_id: trimmedStringSchema
});

export const periodoVinculacionParamSchema = z.object({
  periodo_id: trimmedStringSchema,
  vinculacion_id: trimmedStringSchema
});

export const nominaNovedadIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const nominaEmpleadoIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const nominaAsistenciaIdParamSchema = z.object({
  id: identifierSchema
});

export const nominaMovimientoIdParamSchema = z.object({
  id: identifierSchema
});

export const listNominaPeriodosQuerySchema = paginationSchema.extend({
  contrato_id: nullableTrimmedStringSchema.optional(),
  empresa_id: nullableTrimmedStringSchema.optional(),
  estado: estadoPeriodoSchema.optional()
});

export const nominaPeriodoActionSchema = z.object({
  force: z.coerce.boolean().optional().default(false)
});

const createNominaPeriodoBaseSchema = z.object({
  nombre_periodo: trimmedStringSchema,
  tipo_periodo: tipoPeriodoSchema,
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  contrato_id: trimmedStringSchema,
  requiere_asistencia: z.coerce.boolean().optional().default(false),
  activo: z.boolean().optional().default(true)
});

export const createNominaPeriodoSchema = createNominaPeriodoBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_inicio > data.fecha_fin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

const updateNominaPeriodoBaseSchema = z.object({
  nombre_periodo: trimmedStringSchema.optional(),
  tipo_periodo: tipoPeriodoSchema.optional(),
  fecha_inicio: z.string().date().optional(),
  fecha_fin: z.string().date().optional(),
  contrato_id: trimmedStringSchema.optional(),
  requiere_asistencia: z.coerce.boolean().optional(),
  activo: z.boolean().optional()
});

export const updateNominaPeriodoSchema = updateNominaPeriodoBaseSchema.superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field must be provided for update'
    });
  }

  if (data.fecha_inicio && data.fecha_fin && data.fecha_inicio > data.fecha_fin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const listNominaEmpleadosQuerySchema = paginationSchema.extend({
  contrato_id: nullableTrimmedStringSchema.optional(),
  empresa_id: nullableTrimmedStringSchema.optional(),
  vinculacion_id: nullableTrimmedStringSchema.optional(),
  persona_id: nullableTrimmedStringSchema.optional(),
  estado: nullableTrimmedStringSchema.optional(),
  revisado: z.coerce.boolean().optional()
});

export const updateNominaEmpleadoSchema = z.object({
  metodo_liquidacion: trimmedStringSchema.optional(),
  categoria_salarial_id: nullableTrimmedStringSchema.optional(),
  salario_base: nonNegativeNumberSchema.optional(),
  auxilio_transporte: nonNegativeNumberSchema.optional(),
  otros_devengos: nonNegativeNumberSchema.optional(),
  fecha_inicio_pago: nullableDateSchema.optional(),
  fecha_fin_pago: nullableDateSchema.optional(),
  dias_pagados: nonNegativeIntegerSchema.optional(),
  horas_trabajadas: nonNegativeNumberSchema.optional(),
  horas_extra_total: nonNegativeNumberSchema.optional(),
  revisado: z.coerce.boolean().optional(),
  estado: trimmedStringSchema.optional(),
  motivo_caso_especial: nullableTrimmedStringSchema.optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field must be provided for update'
    });
  }

  if (data.fecha_inicio_pago && data.fecha_fin_pago && data.fecha_inicio_pago > data.fecha_fin_pago) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin_pago must be greater than or equal to fecha_inicio_pago',
      path: ['fecha_fin_pago']
    });
  }
});

export const listNominaLiquidacionesQuerySchema = paginationSchema.extend({
  contrato_id: nullableTrimmedStringSchema.optional(),
  empresa_id: nullableTrimmedStringSchema.optional(),
  vinculacion_id: nullableTrimmedStringSchema.optional(),
  persona_id: nullableTrimmedStringSchema.optional(),
  estado: estadoLiquidacionSchema.optional()
});

export const listNominaNovedadesQuerySchema = paginationSchema.extend({
  periodo_id: identifierSchema.nullable().optional(),
  nomina_empleado_id: identifierSchema.nullable().optional(),
  vinculacion_id: identifierSchema.nullable().optional(),
  tipo_novedad_id: identifierSchema.nullable().optional(),
  revisado: z.coerce.boolean().optional(),
  activo: z.coerce.boolean().optional()
});

export const exportNominaPeriodoQuerySchema = z.object({
  tipo: nominaExportTipoSchema.optional().default('todo'),
  include_versiones: z.coerce.boolean().optional().default(false)
});

export const listNominaMovimientosQuerySchema = paginationSchema.extend({
  periodo_id: identifierSchema.nullable().optional(),
  nomina_empleado_id: identifierSchema.nullable().optional(),
  vinculacion_id: identifierSchema.nullable().optional(),
  tipo_movimiento: nominaMovimientoTipoSchema.optional(),
  activo: z.coerce.boolean().optional()
});

export const listNominaAsistenciaQuerySchema = paginationSchema.extend({
  vinculacion_id: identifierSchema.nullable().optional(),
  fecha: nullableDateSchema.optional(),
  estado_dia: nominaAsistenciaEstadoSchema.optional(),
  activo: z.coerce.boolean().optional()
});

export const updateNominaAsistenciaSchema = z.object({
  hora_ingreso: nullableTimeSchema.optional(),
  hora_salida: nullableTimeSchema.optional(),
  horas_trabajadas: nonNegativeNumberSchema.optional(),
  estado_dia: nominaAsistenciaEstadoSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.coerce.boolean().optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field must be provided for update'
    });
  }
});

export const createNominaMovimientoSchema = z.object({
  periodo_id: identifierSchema,
  nomina_empleado_id: identifierSchema,
  vinculacion_id: identifierSchema,
  fecha: nullableDateSchema.optional().default(null),
  tipo_movimiento: nominaMovimientoTipoSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  cantidad: nullableNumberSchema.optional().default(null),
  valor_unitario: nullableNumberSchema.optional().default(null),
  valor_total: z.coerce.number(),
  es_devengado: z.coerce.boolean().optional().default(true),
  es_deduccion: z.coerce.boolean().optional().default(false),
  afecta_seguridad_social: z.coerce.boolean().optional().default(true),
  activo: z.coerce.boolean().optional().default(true)
}).superRefine((data, ctx) => {
  if (data.valor_total < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'valor_total must be greater than or equal to 0',
      path: ['valor_total']
    });
  }
});

export const createNominaRecargoSchema = z.object({
  periodo_id: identifierSchema,
  nomina_empleado_id: identifierSchema,
  vinculacion_id: identifierSchema,
  fecha: z.string().date(),
  tipo_recargo: nominaRecargoTipoSchema,
  horas: z.coerce.number().gt(0),
  salario_base: nonNegativeNumberSchema
});

export const updateNominaMovimientoSchema = z.object({
  fecha: nullableDateSchema.optional(),
  tipo_movimiento: nominaMovimientoTipoSchema.optional(),
  descripcion: nullableTrimmedStringSchema.optional(),
  cantidad: nullableNumberSchema.optional(),
  valor_unitario: nullableNumberSchema.optional(),
  valor_total: z.coerce.number().optional(),
  es_devengado: z.coerce.boolean().optional(),
  es_deduccion: z.coerce.boolean().optional(),
  afecta_seguridad_social: z.coerce.boolean().optional(),
  activo: z.coerce.boolean().optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field must be provided for update'
    });
  }

  if (data.valor_total !== undefined && data.valor_total < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'valor_total must be greater than or equal to 0',
      path: ['valor_total']
    });
  }
});

export const createNominaNovedadSchema = z.object({
  periodo_id: identifierSchema,
  nomina_empleado_id: identifierSchema,
  vinculacion_id: identifierSchema,
  tipo_novedad_id: identifierSchema,
  fecha_inicio: nullableDateSchema.optional().default(null),
  fecha_fin: nullableDateSchema.optional().default(null),
  dias: nullableNumberSchema.optional().default(null),
  horas: nullableNumberSchema.optional().default(null),
  valor_manual: nullableNumberSchema.optional().default(null),
  categoria_anterior_id: identifierSchema.nullable().optional().default(null),
  categoria_nueva_id: identifierSchema.nullable().optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  revisado: z.coerce.boolean().optional().default(false),
  requiere_cobertura: z.coerce.boolean().optional().default(false),
  cubierta: z.coerce.boolean().optional().default(false),
  activo: z.boolean().optional().default(true)
}).superRefine((data, ctx) => {
  if (data.fecha_inicio && data.fecha_fin && data.fecha_inicio > data.fecha_fin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const updateNominaNovedadSchema = z.object({
  tipo_novedad_id: identifierSchema.optional(),
  fecha_inicio: nullableDateSchema.optional(),
  fecha_fin: nullableDateSchema.optional(),
  dias: nullableNumberSchema.optional(),
  horas: nullableNumberSchema.optional(),
  valor_manual: nullableNumberSchema.optional(),
  categoria_anterior_id: identifierSchema.nullable().optional(),
  categoria_nueva_id: identifierSchema.nullable().optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  revisado: z.coerce.boolean().optional(),
  requiere_cobertura: z.coerce.boolean().optional(),
  cubierta: z.coerce.boolean().optional(),
  activo: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field must be provided for update'
    });
  }

  if (data.fecha_inicio && data.fecha_fin && data.fecha_inicio > data.fecha_fin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export type TipoPeriodo = z.infer<typeof tipoPeriodoSchema>;
export type EstadoPeriodo = z.infer<typeof estadoPeriodoSchema>;
export type EstadoLiquidacion = z.infer<typeof estadoLiquidacionSchema>;
export type TipoNovedad = z.infer<typeof tipoNovedadSchema>;
export type AfectaConcepto = z.infer<typeof afectaConceptoSchema>;
export type NominaExportTipo = z.infer<typeof nominaExportTipoSchema>;
export type NominaAsistenciaEstado = z.infer<typeof nominaAsistenciaEstadoSchema>;
export type NominaMovimientoTipo = z.infer<typeof nominaMovimientoTipoSchema>;
export type NominaRecargoTipo = z.infer<typeof nominaRecargoTipoSchema>;
export type CreateNominaPeriodoInput = z.infer<typeof createNominaPeriodoSchema>;
export type UpdateNominaPeriodoInput = z.infer<typeof updateNominaPeriodoSchema>;
export type ListNominaPeriodosQuery = z.infer<typeof listNominaPeriodosQuerySchema>;
export type NominaPeriodoActionInput = z.infer<typeof nominaPeriodoActionSchema>;
export type ListNominaEmpleadosQuery = z.infer<typeof listNominaEmpleadosQuerySchema>;
export type UpdateNominaEmpleadoInput = z.infer<typeof updateNominaEmpleadoSchema>;
export type ListNominaLiquidacionesQuery = z.infer<typeof listNominaLiquidacionesQuerySchema>;
export type ListNominaNovedadesQuery = z.infer<typeof listNominaNovedadesQuerySchema>;
export type ExportNominaPeriodoQuery = z.infer<typeof exportNominaPeriodoQuerySchema>;
export type ListNominaMovimientosQuery = z.infer<typeof listNominaMovimientosQuerySchema>;
export type ListNominaAsistenciaQuery = z.infer<typeof listNominaAsistenciaQuerySchema>;
export type UpdateNominaAsistenciaInput = z.infer<typeof updateNominaAsistenciaSchema>;
export type CreateNominaMovimientoInput = z.infer<typeof createNominaMovimientoSchema>;
export type CreateNominaRecargoInput = z.infer<typeof createNominaRecargoSchema>;
export type UpdateNominaMovimientoInput = z.infer<typeof updateNominaMovimientoSchema>;
export type CreateNominaNovedadInput = z.infer<typeof createNominaNovedadSchema>;
export type UpdateNominaNovedadInput = z.infer<typeof updateNominaNovedadSchema>;
