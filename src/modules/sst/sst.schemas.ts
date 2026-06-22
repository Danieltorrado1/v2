import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const numericStringSchema = z.string().trim().regex(/^\d+$/);
const numericIdSchema = z.union([z.number().int().positive(), numericStringSchema]).transform((value) =>
  String(value)
);

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

const nullableRecordSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, z.record(z.string(), z.unknown()).nullable());

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const sstTipoEventoSchema = z.enum([
  'ACCIDENTE_TRABAJO',
  'INCIDENTE',
  'ENFERMEDAD_LABORAL',
  'INSPECCION',
  'CAPACITACION',
  'ENTREGA_EPP',
  'ACTO_INSEGURO',
  'CONDICION_INSEGURA'
]);

export const sstEstadoSchema = z.enum([
  'ABIERTO',
  'EN_INVESTIGACION',
  'EN_SEGUIMIENTO',
  'CERRADO',
  'ANULADO'
]);

export const sstIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const sstNumericIdParamSchema = z.object({
  id: numericIdSchema
});

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  return value;
}, numericIdSchema.nullable());

const nullableIntegerSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  return value;
}, z.union([z.number().int(), z.string().trim().regex(/^-?\d+$/)]).transform((value) => Number(value)).nullable());

const nullableDecimalSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  return value;
}, z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)]).transform((value) => Number(value)).nullable());

const positiveIntegerSchema = z
  .union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)])
  .transform((value) => Number(value))
  .refine((value) => value > 0, 'Value must be greater than 0');

const positiveDecimalSchema = z
  .union([z.number().positive(), z.string().trim().regex(/^\d+(\.\d+)?$/)])
  .transform((value) => Number(value))
  .refine((value) => value > 0, 'Value must be greater than 0');

const nonNegativeDecimalSchema = z
  .union([z.number().min(0), z.string().trim().regex(/^\d+(\.\d+)?$/)])
  .transform((value) => Number(value))
  .refine((value) => value >= 0, 'Value must be greater than or equal to 0');

const nullablePositiveIntegerSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  return value;
}, positiveIntegerSchema.nullable());

const nullableNonNegativeDecimalSchema = z.preprocess((value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }

  return value;
}, nonNegativeDecimalSchema.nullable());

const optionalBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean().nullable());

const estadoCapacitacionSchema = z.enum(['vigente', 'vencida', 'sin_vencimiento']);
export const sstDotacionEppTipoItemSchema = z.enum(['DOTACION', 'EPP', 'BIOSEGURIDAD', 'HERRAMIENTA']);
export const sstDotacionEppEstadoEntregaSchema = z.enum([
  'ENTREGADO',
  'PENDIENTE',
  'RECHAZADO',
  'REPUESTO',
  'DEVUELTO'
]);
export const sstDotacionEppEstadoReposicionSchema = z.enum(['vigente', 'vencida', 'proxima_a_vencer']);
export const sstExamenOcupacionalTipoExamenSchema = z.enum([
  'INGRESO',
  'PERIODICO',
  'RETIRO',
  'POST_INCAPACIDAD',
  'CAMBIO_OCUPACIONAL',
  'MANIPULACION_ALIMENTOS',
  'OTRO'
]);
export const sstExamenOcupacionalConceptoMedicoSchema = z.enum([
  'APTO',
  'APTO_CON_RESTRICCIONES',
  'NO_APTO',
  'PENDIENTE'
]);
export const estadoExamenSchema = z.enum(['vigente', 'vencido', 'sin_vencimiento', 'proximo_a_vencer']);
export const sstAccidenteTipoEventoSchema = z.enum(['ACCIDENTE_TRABAJO', 'INCIDENTE', 'CASI_ACCIDENTE']);
export const sstAccidenteSeveridadSchema = z.enum(['LEVE', 'MODERADO', 'GRAVE', 'MORTAL']);
export const sstAccidenteEstadoSchema = z.enum(['ABIERTO', 'EN_INVESTIGACION', 'CERRADO']);
export const sstAccionAccidenteEstadoSchema = z.enum(['ABIERTA', 'EN_PROCESO', 'CERRADA']);
export const sstPlanAnualEstadoSchema = z.enum(['ABIERTO', 'EN_EJECUCION', 'FINALIZADO', 'CERRADO']);
export const sstPlanAnualActividadEstadoSchema = z.enum([
  'PENDIENTE',
  'EN_PROCESO',
  'EJECUTADA',
  'VENCIDA',
  'CANCELADA'
]);
export const sstPlanAnualActividadEstadoAlertaSchema = z.enum([
  'vigente',
  'proxima_a_vencer',
  'vencida',
  'ejecutada',
  'cancelada'
]);

export const listSstEventosQuerySchema = paginationSchema.extend({
  empresa_id: nullableTrimmedStringSchema.optional(),
  contrato_id: nullableTrimmedStringSchema.optional(),
  vinculacion_id: nullableTrimmedStringSchema.optional(),
  tipo_evento: sstTipoEventoSchema.optional(),
  estado: sstEstadoSchema.optional(),
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional()
}).refine(
  (data) => {
    if (!data.fecha_desde || !data.fecha_hasta) {
      return true;
    }

    return data.fecha_desde <= data.fecha_hasta;
  },
  {
    message: 'fecha_hasta must be greater than or equal to fecha_desde',
    path: ['fecha_hasta']
  }
);

export const createSstEventoSchema = z.object({
  persona_id: nullableTrimmedStringSchema.optional().default(null),
  vinculacion_id: nullableTrimmedStringSchema.optional().default(null),
  contrato_id: nullableTrimmedStringSchema.optional().default(null),
  empresa_id: nullableTrimmedStringSchema.optional().default(null),
  tipo_evento: sstTipoEventoSchema,
  estado: sstEstadoSchema.optional().default('ABIERTO'),
  fecha_evento: z.string().date(),
  fecha_cierre: nullableDateSchema.optional().default(null),
  titulo: trimmedStringSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  ubicacion: nullableTrimmedStringSchema.optional().default(null),
  metadata: nullableRecordSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSstEventoSchema = z.object({
  persona_id: nullableTrimmedStringSchema.optional(),
  vinculacion_id: nullableTrimmedStringSchema.optional(),
  contrato_id: nullableTrimmedStringSchema.optional(),
  empresa_id: nullableTrimmedStringSchema.optional(),
  tipo_evento: sstTipoEventoSchema.optional(),
  estado: sstEstadoSchema.optional(),
  fecha_evento: z.string().date().optional(),
  fecha_cierre: nullableDateSchema.optional(),
  titulo: trimmedStringSchema.optional(),
  descripcion: nullableTrimmedStringSchema.optional(),
  ubicacion: nullableTrimmedStringSchema.optional(),
  metadata: nullableRecordSchema.optional(),
  activo: z.boolean().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be provided for update'
);

export const listSstPlanesQuerySchema = paginationSchema.extend({
  evento_id: nullableTrimmedStringSchema.optional(),
  responsable_id: nullableTrimmedStringSchema.optional(),
  estado: sstEstadoSchema.optional(),
  fecha_compromiso_desde: nullableDateSchema.optional(),
  fecha_compromiso_hasta: nullableDateSchema.optional()
}).refine(
  (data) => {
    if (!data.fecha_compromiso_desde || !data.fecha_compromiso_hasta) {
      return true;
    }

    return data.fecha_compromiso_desde <= data.fecha_compromiso_hasta;
  },
  {
    message: 'fecha_compromiso_hasta must be greater than or equal to fecha_compromiso_desde',
    path: ['fecha_compromiso_hasta']
  }
);

export const createSstPlanAccionSchema = z.object({
  evento_id: trimmedStringSchema,
  responsable: trimmedStringSchema,
  responsable_id: nullableTrimmedStringSchema.optional().default(null),
  descripcion: trimmedStringSchema,
  fecha_compromiso: z.string().date(),
  fecha_cierre: nullableDateSchema.optional().default(null),
  estado: sstEstadoSchema.optional().default('ABIERTO'),
  observaciones: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSstPlanAccionSchema = z.object({
  responsable: trimmedStringSchema.optional(),
  responsable_id: nullableTrimmedStringSchema.optional(),
  descripcion: trimmedStringSchema.optional(),
  fecha_compromiso: z.string().date().optional(),
  fecha_cierre: nullableDateSchema.optional(),
  estado: sstEstadoSchema.optional(),
  observaciones: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be provided for update'
).refine(
  (data) => data.estado !== 'CERRADO' || Boolean(data.fecha_cierre),
  {
    message: 'fecha_cierre is required when estado is CERRADO',
    path: ['fecha_cierre']
  }
);

export const closeSstPlanAccionSchema = z.object({
  fecha_cierre: z.string().date(),
  observaciones: nullableTrimmedStringSchema.optional().default(null)
});

export const listSstIndicadoresQuerySchema = z.object({
  empresa_id: nullableTrimmedStringSchema.optional(),
  contrato_id: nullableTrimmedStringSchema.optional(),
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional()
}).refine(
  (data) => {
    if (!data.fecha_desde || !data.fecha_hasta) {
      return true;
    }

    return data.fecha_desde <= data.fecha_hasta;
  },
  {
    message: 'fecha_hasta must be greater than or equal to fecha_desde',
    path: ['fecha_hasta']
  }
);

export const calculateSstIndicadoresSchema = z.object({
  empresa_id: nullableTrimmedStringSchema.optional().default(null),
  contrato_id: nullableTrimmedStringSchema.optional().default(null),
  fecha_desde: z.string().date(),
  fecha_hasta: z.string().date()
}).refine(
  (data) => data.fecha_desde <= data.fecha_hasta,
  {
    message: 'fecha_hasta must be greater than or equal to fecha_desde',
    path: ['fecha_hasta']
  }
);

export const listSstCapacitacionesQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  categoria: nullableTrimmedStringSchema.optional(),
  obligatoria: optionalBooleanSchema,
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createSstCapacitacionSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  nombre_capacitacion: trimmedStringSchema,
  tema: nullableTrimmedStringSchema.optional().default(null),
  categoria: trimmedStringSchema.default('GENERAL'),
  obligatoria: z.boolean().optional().default(true),
  vigencia_meses: nullableIntegerSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSstCapacitacionSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  nombre_capacitacion: trimmedStringSchema.optional(),
  tema: nullableTrimmedStringSchema.optional(),
  categoria: trimmedStringSchema.optional(),
  obligatoria: z.boolean().optional(),
  vigencia_meses: nullableIntegerSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstCapacitacionesPersonaQuerySchema = paginationSchema.extend({
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  capacitacion_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  estado: estadoCapacitacionSchema.optional(),
  activo: optionalBooleanSchema
});

export const createSstCapacitacionPersonaSchema = z.object({
  capacitacion_id: numericIdSchema,
  persona_id: numericIdSchema,
  vinculacion_id: nullableNumericIdSchema.optional().default(null),
  fecha_capacitacion: z.string().date(),
  fecha_vencimiento: nullableDateSchema.optional().default(null),
  aprobado: z.boolean().optional().default(true),
  calificacion: nullableDecimalSchema.optional().default(null),
  documento_persona_id: nullableNumericIdSchema.optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
}).refine(
  (data) => !data.fecha_vencimiento || data.fecha_capacitacion <= data.fecha_vencimiento,
  {
    message: 'fecha_vencimiento must be greater than or equal to fecha_capacitacion',
    path: ['fecha_vencimiento']
  }
);

export const updateSstCapacitacionPersonaSchema = z.object({
  capacitacion_id: numericIdSchema.optional(),
  persona_id: numericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  fecha_capacitacion: z.string().date().optional(),
  fecha_vencimiento: nullableDateSchema.optional(),
  aprobado: z.boolean().optional(),
  calificacion: nullableDecimalSchema.optional(),
  documento_persona_id: nullableNumericIdSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional()
});

export const listSstDotacionEppQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_item: sstDotacionEppTipoItemSchema.optional(),
  obligatorio: optionalBooleanSchema,
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createSstDotacionEppSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  nombre_item: trimmedStringSchema,
  tipo_item: sstDotacionEppTipoItemSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  talla_requerida: z.boolean().optional().default(false),
  requiere_reposicion: z.boolean().optional().default(false),
  frecuencia_reposicion_dias: nullablePositiveIntegerSchema.optional().default(null),
  obligatorio: z.boolean().optional().default(true),
  activo: z.boolean().optional().default(true)
});

export const updateSstDotacionEppSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  nombre_item: trimmedStringSchema.optional(),
  tipo_item: sstDotacionEppTipoItemSchema.optional(),
  descripcion: nullableTrimmedStringSchema.optional(),
  talla_requerida: z.boolean().optional(),
  requiere_reposicion: z.boolean().optional(),
  frecuencia_reposicion_dias: nullablePositiveIntegerSchema.optional(),
  obligatorio: z.boolean().optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstDotacionEppEntregasQuerySchema = paginationSchema.extend({
  item_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  estado_entrega: sstDotacionEppEstadoEntregaSchema.optional(),
  estado_reposicion: sstDotacionEppEstadoReposicionSchema.optional(),
  activo: optionalBooleanSchema
});

export const createSstDotacionEppEntregaSchema = z.object({
  item_id: numericIdSchema,
  persona_id: numericIdSchema,
  vinculacion_id: nullableNumericIdSchema.optional().default(null),
  fecha_entrega: z.string().date(),
  cantidad: positiveDecimalSchema.optional().default(1),
  talla: nullableTrimmedStringSchema.optional().default(null),
  estado_entrega: sstDotacionEppEstadoEntregaSchema.optional().default('ENTREGADO'),
  fecha_proxima_reposicion: nullableDateSchema.optional(),
  documento_persona_id: nullableNumericIdSchema.optional().default(null),
  recibido_por: nullableTrimmedStringSchema.optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
}).refine(
  (data) => !data.fecha_proxima_reposicion || data.fecha_entrega <= data.fecha_proxima_reposicion,
  {
    message: 'fecha_proxima_reposicion must be greater than or equal to fecha_entrega',
    path: ['fecha_proxima_reposicion']
  }
);

export const updateSstDotacionEppEntregaSchema = z.object({
  item_id: numericIdSchema.optional(),
  persona_id: numericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  fecha_entrega: z.string().date().optional(),
  cantidad: positiveDecimalSchema.optional(),
  talla: nullableTrimmedStringSchema.optional(),
  estado_entrega: sstDotacionEppEstadoEntregaSchema.optional(),
  fecha_proxima_reposicion: nullableDateSchema.optional(),
  documento_persona_id: nullableNumericIdSchema.optional(),
  recibido_por: nullableTrimmedStringSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstDotacionEppDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstDotacionEppAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional()
});

export const listSstExamenesOcupacionalesQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_examen: sstExamenOcupacionalTipoExamenSchema.optional(),
  obligatorio: optionalBooleanSchema,
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createSstExamenOcupacionalSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  nombre_examen: trimmedStringSchema,
  tipo_examen: sstExamenOcupacionalTipoExamenSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  obligatorio: z.boolean().optional().default(true),
  vigencia_meses: nullablePositiveIntegerSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSstExamenOcupacionalSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  nombre_examen: trimmedStringSchema.optional(),
  tipo_examen: sstExamenOcupacionalTipoExamenSchema.optional(),
  descripcion: nullableTrimmedStringSchema.optional(),
  obligatorio: z.boolean().optional(),
  vigencia_meses: nullablePositiveIntegerSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstExamenesPersonaQuerySchema = paginationSchema.extend({
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  examen_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  concepto_medico: sstExamenOcupacionalConceptoMedicoSchema.optional(),
  estado: estadoExamenSchema.optional(),
  activo: optionalBooleanSchema
});

export const createSstExamenPersonaSchema = z.object({
  examen_id: numericIdSchema,
  persona_id: numericIdSchema,
  vinculacion_id: nullableNumericIdSchema.optional().default(null),
  fecha_examen: z.string().date(),
  fecha_vencimiento: nullableDateSchema.optional(),
  concepto_medico: sstExamenOcupacionalConceptoMedicoSchema.optional().default('APTO'),
  restricciones: nullableTrimmedStringSchema.optional().default(null),
  documento_persona_id: nullableNumericIdSchema.optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
}).refine(
  (data) => !data.fecha_vencimiento || data.fecha_examen <= data.fecha_vencimiento,
  {
    message: 'fecha_vencimiento must be greater than or equal to fecha_examen',
    path: ['fecha_vencimiento']
  }
);

export const updateSstExamenPersonaSchema = z.object({
  examen_id: numericIdSchema.optional(),
  persona_id: numericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  fecha_examen: z.string().date().optional(),
  fecha_vencimiento: nullableDateSchema.optional(),
  concepto_medico: sstExamenOcupacionalConceptoMedicoSchema.optional(),
  restricciones: nullableTrimmedStringSchema.optional(),
  documento_persona_id: nullableNumericIdSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstExamenesDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstExamenesAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional()
});

export const listSstAccidentesQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  tipo_evento: sstAccidenteTipoEventoSchema.optional(),
  severidad: sstAccidenteSeveridadSchema.optional(),
  estado: sstAccidenteEstadoSchema.optional(),
  lesionado: optionalBooleanSchema,
  activo: optionalBooleanSchema,
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional()
}).refine(
  (data) => {
    if (!data.fecha_desde || !data.fecha_hasta) {
      return true;
    }

    return data.fecha_desde <= data.fecha_hasta;
  },
  {
    message: 'fecha_hasta must be greater than or equal to fecha_desde',
    path: ['fecha_hasta']
  }
);

export const createSstAccidenteSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  persona_id: numericIdSchema,
  vinculacion_id: nullableNumericIdSchema.optional().default(null),
  tipo_evento: sstAccidenteTipoEventoSchema,
  fecha_evento: z.string().date(),
  hora_evento: nullableTrimmedStringSchema.optional().default(null),
  lugar_evento: nullableTrimmedStringSchema.optional().default(null),
  descripcion: trimmedStringSchema,
  lesionado: z.boolean().optional().default(false),
  tipo_lesion: nullableTrimmedStringSchema.optional().default(null),
  parte_cuerpo: nullableTrimmedStringSchema.optional().default(null),
  dias_incapacidad: nullableIntegerSchema.optional().default(0),
  requiere_investigacion: z.boolean().optional().default(true),
  severidad: sstAccidenteSeveridadSchema.optional().default('LEVE'),
  estado: sstAccidenteEstadoSchema.optional().default('ABIERTO'),
  activo: z.boolean().optional().default(true)
});

export const updateSstAccidenteSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: numericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  tipo_evento: sstAccidenteTipoEventoSchema.optional(),
  fecha_evento: z.string().date().optional(),
  hora_evento: nullableTrimmedStringSchema.optional(),
  lugar_evento: nullableTrimmedStringSchema.optional(),
  descripcion: trimmedStringSchema.optional(),
  lesionado: z.boolean().optional(),
  tipo_lesion: nullableTrimmedStringSchema.optional(),
  parte_cuerpo: nullableTrimmedStringSchema.optional(),
  dias_incapacidad: nullableIntegerSchema.optional(),
  requiere_investigacion: z.boolean().optional(),
  severidad: sstAccidenteSeveridadSchema.optional(),
  estado: sstAccidenteEstadoSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstAccionesAccidenteQuerySchema = paginationSchema.extend({
  estado: sstAccionAccidenteEstadoSchema.optional(),
  activo: optionalBooleanSchema
});

export const sstAccidenteIdParamSchema = z.object({
  id: numericIdSchema
});

export const createSstAccionAccidenteSchema = z.object({
  descripcion: trimmedStringSchema,
  responsable: nullableTrimmedStringSchema.optional().default(null),
  fecha_compromiso: nullableDateSchema.optional().default(null),
  fecha_cierre: nullableDateSchema.optional().default(null),
  estado: sstAccionAccidenteEstadoSchema.optional().default('ABIERTA'),
  activo: z.boolean().optional().default(true)
}).refine(
  (data) => !data.fecha_cierre || !data.fecha_compromiso || data.fecha_compromiso <= data.fecha_cierre,
  {
    message: 'fecha_cierre must be greater than or equal to fecha_compromiso',
    path: ['fecha_cierre']
  }
);

export const updateSstAccionAccidenteSchema = z.object({
  descripcion: trimmedStringSchema.optional(),
  responsable: nullableTrimmedStringSchema.optional(),
  fecha_compromiso: nullableDateSchema.optional(),
  fecha_cierre: nullableDateSchema.optional(),
  estado: sstAccionAccidenteEstadoSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update').refine(
  (data) => !data.fecha_cierre || !data.fecha_compromiso || data.fecha_compromiso <= data.fecha_cierre,
  {
    message: 'fecha_cierre must be greater than or equal to fecha_compromiso',
    path: ['fecha_cierre']
  }
);

export const listSstAccidentesDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstAccidentesAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional()
});

export const sstInspeccionTipoSchema = z.enum([
  'LOCATIVA',
  'COCINA',
  'EPP',
  'EXTINTORES',
  'BOTIQUINES',
  'VEHICULOS',
  'ALMACENAMIENTO',
  'RIESGO_BIOLOGICO',
  'RIESGO_QUIMICO',
  'OTRO'
]);
export const sstInspeccionEstadoSchema = z.enum([
  'PROGRAMADA',
  'REALIZADA',
  'CANCELADA',
  'VENCIDA'
]);
export const sstInspeccionHallazgoTipoSchema = z.enum([
  'CONDICION_INSEGURA',
  'ACTO_INSEGURO',
  'NO_CONFORMIDAD',
  'OBSERVACION',
  'OPORTUNIDAD_MEJORA'
]);
export const sstInspeccionHallazgoNivelSchema = z.enum(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']);
export const sstAccionInspeccionEstadoSchema = z.enum([
  'ABIERTA',
  'EN_PROCESO',
  'CERRADA',
  'VENCIDA'
]);

export const listSstInspeccionesQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_inspeccion: sstInspeccionTipoSchema.optional(),
  estado: sstInspeccionEstadoSchema.optional(),
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional(),
  fecha_programada_desde: nullableDateSchema.optional(),
  fecha_programada_hasta: nullableDateSchema.optional(),
  fecha_realizada_desde: nullableDateSchema.optional(),
  fecha_realizada_hasta: nullableDateSchema.optional()
}).refine(
  (data) => {
    if (!data.fecha_programada_desde || !data.fecha_programada_hasta) {
      return true;
    }

    return data.fecha_programada_desde <= data.fecha_programada_hasta;
  },
  {
    message: 'fecha_programada_hasta must be greater than or equal to fecha_programada_desde',
    path: ['fecha_programada_hasta']
  }
).refine(
  (data) => {
    if (!data.fecha_realizada_desde || !data.fecha_realizada_hasta) {
      return true;
    }

    return data.fecha_realizada_desde <= data.fecha_realizada_hasta;
  },
  {
    message: 'fecha_realizada_hasta must be greater than or equal to fecha_realizada_desde',
    path: ['fecha_realizada_hasta']
  }
);

export const createSstInspeccionSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  nombre_inspeccion: trimmedStringSchema,
  tipo_inspeccion: sstInspeccionTipoSchema,
  fecha_programada: nullableDateSchema.optional().default(null),
  fecha_realizada: nullableDateSchema.optional().default(null),
  responsable: nullableTrimmedStringSchema.optional().default(null),
  estado: sstInspeccionEstadoSchema.optional().default('PROGRAMADA'),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSstInspeccionSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  nombre_inspeccion: trimmedStringSchema.optional(),
  tipo_inspeccion: sstInspeccionTipoSchema.optional(),
  fecha_programada: nullableDateSchema.optional(),
  fecha_realizada: nullableDateSchema.optional(),
  responsable: nullableTrimmedStringSchema.optional(),
  estado: sstInspeccionEstadoSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstInspeccionHallazgosQuerySchema = paginationSchema.extend({
  tipo_hallazgo: sstInspeccionHallazgoTipoSchema.optional(),
  nivel_riesgo: sstInspeccionHallazgoNivelSchema.optional(),
  requiere_accion: optionalBooleanSchema,
  activo: optionalBooleanSchema
});

export const createSstInspeccionHallazgoSchema = z.object({
  inspeccion_id: numericIdSchema,
  tipo_hallazgo: sstInspeccionHallazgoTipoSchema.optional().default('CONDICION_INSEGURA'),
  descripcion: trimmedStringSchema,
  nivel_riesgo: sstInspeccionHallazgoNivelSchema.optional().default('BAJO'),
  requiere_accion: z.boolean().optional().default(true),
  activo: z.boolean().optional().default(true)
});

export const updateSstInspeccionHallazgoSchema = z.object({
  inspeccion_id: numericIdSchema.optional(),
  tipo_hallazgo: sstInspeccionHallazgoTipoSchema.optional(),
  descripcion: trimmedStringSchema.optional(),
  nivel_riesgo: sstInspeccionHallazgoNivelSchema.optional(),
  requiere_accion: z.boolean().optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstAccionesInspeccionQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  hallazgo_id: nullableNumericIdSchema.optional(),
  estado: sstAccionInspeccionEstadoSchema.optional(),
  activo: optionalBooleanSchema
});

export const createSstAccionInspeccionSchema = z.object({
  hallazgo_id: numericIdSchema,
  descripcion: trimmedStringSchema,
  responsable: nullableTrimmedStringSchema.optional().default(null),
  fecha_compromiso: nullableDateSchema.optional().default(null),
  fecha_cierre: nullableDateSchema.optional().default(null),
  estado: sstAccionInspeccionEstadoSchema.optional().default('ABIERTA'),
  activo: z.boolean().optional().default(true)
}).refine(
  (data) => !data.fecha_cierre || !data.fecha_compromiso || data.fecha_compromiso <= data.fecha_cierre,
  {
    message: 'fecha_cierre must be greater than or equal to fecha_compromiso',
    path: ['fecha_cierre']
  }
);

export const updateSstAccionInspeccionSchema = z.object({
  hallazgo_id: numericIdSchema.optional(),
  descripcion: trimmedStringSchema.optional(),
  responsable: nullableTrimmedStringSchema.optional(),
  fecha_compromiso: nullableDateSchema.optional(),
  fecha_cierre: nullableDateSchema.optional(),
  estado: sstAccionInspeccionEstadoSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update').refine(
  (data) => !data.fecha_cierre || !data.fecha_compromiso || data.fecha_compromiso <= data.fecha_cierre,
  {
    message: 'fecha_cierre must be greater than or equal to fecha_compromiso',
    path: ['fecha_cierre']
  }
);

export const closeSstAccionInspeccionSchema = z.object({
  fecha_cierre: nullableDateSchema.optional()
});

export const listSstInspeccionesDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstInspeccionesAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const sstRiesgoTipoPeligroSchema = z.enum([
  'BIOLOGICO',
  'QUIMICO',
  'FISICO',
  'ERGONOMICO',
  'PSICOSOCIAL',
  'MECANICO',
  'LOCATIVO',
  'PUBLICO',
  'ELECTRICO',
  'OTRO'
]);
export const sstRiesgoClasificacionSchema = z.enum(['BAJO', 'MEDIO', 'ALTO', 'CRITICO']);
const sstRiesgoEscalaSchema = z.coerce.number().int().min(1).max(5);

export const listSstMatrizRiesgosQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_peligro: sstRiesgoTipoPeligroSchema.optional(),
  clasificacion_riesgo: sstRiesgoClasificacionSchema.optional(),
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createSstMatrizRiesgoSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  proceso: trimmedStringSchema,
  actividad: trimmedStringSchema,
  tarea: nullableTrimmedStringSchema.optional().default(null),
  tipo_peligro: sstRiesgoTipoPeligroSchema,
  descripcion_peligro: trimmedStringSchema,
  consecuencia: nullableTrimmedStringSchema.optional().default(null),
  probabilidad: sstRiesgoEscalaSchema,
  impacto: sstRiesgoEscalaSchema,
  controles_existentes: nullableTrimmedStringSchema.optional().default(null),
  controles_recomendados: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSstMatrizRiesgoSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  proceso: trimmedStringSchema.optional(),
  actividad: trimmedStringSchema.optional(),
  tarea: nullableTrimmedStringSchema.optional(),
  tipo_peligro: sstRiesgoTipoPeligroSchema.optional(),
  descripcion_peligro: trimmedStringSchema.optional(),
  consecuencia: nullableTrimmedStringSchema.optional(),
  probabilidad: sstRiesgoEscalaSchema.optional(),
  impacto: sstRiesgoEscalaSchema.optional(),
  controles_existentes: nullableTrimmedStringSchema.optional(),
  controles_recomendados: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstMatrizRiesgosDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstMatrizRiesgosAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstDashboardGeneralQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstDashboardGeneralAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional()
});

export const listSstPlanAnualQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  anio: nullableIntegerSchema.optional(),
  estado: sstPlanAnualEstadoSchema.optional(),
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createSstPlanAnualSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  anio: z.coerce.number().int(),
  nombre_plan: trimmedStringSchema,
  objetivo: nullableTrimmedStringSchema.optional().default(null),
  presupuesto: nullableNonNegativeDecimalSchema.optional().default(null),
  estado: sstPlanAnualEstadoSchema.optional().default('ABIERTO'),
  activo: z.boolean().optional().default(true)
});

export const updateSstPlanAnualSchema = z.object({
  empresa_id: numericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  anio: z.coerce.number().int().optional(),
  nombre_plan: trimmedStringSchema.optional(),
  objetivo: nullableTrimmedStringSchema.optional(),
  presupuesto: nullableNonNegativeDecimalSchema.optional(),
  estado: sstPlanAnualEstadoSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstPlanAnualActividadesQuerySchema = paginationSchema.extend({
  estado: sstPlanAnualActividadEstadoSchema.optional(),
  estado_alerta: sstPlanAnualActividadEstadoAlertaSchema.optional(),
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createSstPlanAnualActividadSchema = z.object({
  plan_id: numericIdSchema,
  actividad: trimmedStringSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  responsable: trimmedStringSchema,
  fecha_programada: z.string().date(),
  fecha_ejecucion: nullableDateSchema.optional().default(null),
  presupuesto: nullableNonNegativeDecimalSchema.optional().default(null),
  porcentaje_avance: z.coerce.number().int().min(0).max(100).optional().default(0),
  estado: sstPlanAnualActividadEstadoSchema.optional(),
  documento_persona_id: nullableNumericIdSchema.optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
}).refine(
  (data) => data.estado !== 'EJECUTADA' || Boolean(data.fecha_ejecucion),
  {
    message: 'fecha_ejecucion is required when estado is EJECUTADA',
    path: ['fecha_ejecucion']
  }
);

export const updateSstPlanAnualActividadSchema = z.object({
  plan_id: numericIdSchema.optional(),
  actividad: trimmedStringSchema.optional(),
  descripcion: nullableTrimmedStringSchema.optional(),
  responsable: trimmedStringSchema.optional(),
  fecha_programada: z.string().date().optional(),
  fecha_ejecucion: nullableDateSchema.optional(),
  presupuesto: nullableNonNegativeDecimalSchema.optional(),
  porcentaje_avance: z.coerce.number().int().min(0).max(100).optional(),
  estado: sstPlanAnualActividadEstadoSchema.optional(),
  documento_persona_id: nullableNumericIdSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const listSstPlanAnualDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  anio: nullableIntegerSchema.optional()
});

export const listSstPlanAnualAlertasQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  anio: nullableIntegerSchema.optional()
});

export type SstTipoEvento = z.infer<typeof sstTipoEventoSchema>;
export type SstEstado = z.infer<typeof sstEstadoSchema>;
export type ListSstEventosQuery = z.infer<typeof listSstEventosQuerySchema>;
export type CreateSstEventoInput = z.infer<typeof createSstEventoSchema>;
export type UpdateSstEventoInput = z.infer<typeof updateSstEventoSchema>;
export type ListSstPlanesQuery = z.infer<typeof listSstPlanesQuerySchema>;
export type CreateSstPlanAccionInput = z.infer<typeof createSstPlanAccionSchema>;
export type UpdateSstPlanAccionInput = z.infer<typeof updateSstPlanAccionSchema>;
export type CloseSstPlanAccionInput = z.infer<typeof closeSstPlanAccionSchema>;
export type ListSstIndicadoresQuery = z.infer<typeof listSstIndicadoresQuerySchema>;
export type CalculateSstIndicadoresInput = z.infer<typeof calculateSstIndicadoresSchema>;
export type ListSstCapacitacionesQuery = z.infer<typeof listSstCapacitacionesQuerySchema>;
export type CreateSstCapacitacionInput = z.infer<typeof createSstCapacitacionSchema>;
export type UpdateSstCapacitacionInput = z.infer<typeof updateSstCapacitacionSchema>;
export type ListSstCapacitacionesPersonaQuery = z.infer<typeof listSstCapacitacionesPersonaQuerySchema>;
export type CreateSstCapacitacionPersonaInput = z.infer<typeof createSstCapacitacionPersonaSchema>;
export type UpdateSstCapacitacionPersonaInput = z.infer<typeof updateSstCapacitacionPersonaSchema>;
export type ListSstDashboardQuery = z.infer<typeof listSstDashboardQuerySchema>;
export type ListSstAlertasQuery = z.infer<typeof listSstAlertasQuerySchema>;
export type SstDotacionEppTipoItem = z.infer<typeof sstDotacionEppTipoItemSchema>;
export type SstDotacionEppEstadoEntrega = z.infer<typeof sstDotacionEppEstadoEntregaSchema>;
export type SstDotacionEppEstadoReposicion = z.infer<typeof sstDotacionEppEstadoReposicionSchema>;
export type ListSstDotacionEppQuery = z.infer<typeof listSstDotacionEppQuerySchema>;
export type CreateSstDotacionEppInput = z.infer<typeof createSstDotacionEppSchema>;
export type UpdateSstDotacionEppInput = z.infer<typeof updateSstDotacionEppSchema>;
export type ListSstDotacionEppEntregasQuery = z.infer<typeof listSstDotacionEppEntregasQuerySchema>;
export type CreateSstDotacionEppEntregaInput = z.infer<typeof createSstDotacionEppEntregaSchema>;
export type UpdateSstDotacionEppEntregaInput = z.infer<typeof updateSstDotacionEppEntregaSchema>;
export type ListSstDotacionEppDashboardQuery = z.infer<typeof listSstDotacionEppDashboardQuerySchema>;
export type ListSstDotacionEppAlertasQuery = z.infer<typeof listSstDotacionEppAlertasQuerySchema>;
export type SstExamenOcupacionalTipoExamen = z.infer<typeof sstExamenOcupacionalTipoExamenSchema>;
export type SstExamenOcupacionalConceptoMedico = z.infer<typeof sstExamenOcupacionalConceptoMedicoSchema>;
export type ListSstExamenesOcupacionalesQuery = z.infer<typeof listSstExamenesOcupacionalesQuerySchema>;
export type CreateSstExamenOcupacionalInput = z.infer<typeof createSstExamenOcupacionalSchema>;
export type UpdateSstExamenOcupacionalInput = z.infer<typeof updateSstExamenOcupacionalSchema>;
export type ListSstExamenesPersonaQuery = z.infer<typeof listSstExamenesPersonaQuerySchema>;
export type CreateSstExamenPersonaInput = z.infer<typeof createSstExamenPersonaSchema>;
export type UpdateSstExamenPersonaInput = z.infer<typeof updateSstExamenPersonaSchema>;
export type ListSstExamenesDashboardQuery = z.infer<typeof listSstExamenesDashboardQuerySchema>;
export type ListSstExamenesAlertasQuery = z.infer<typeof listSstExamenesAlertasQuerySchema>;
export type SstAccidenteTipoEvento = z.infer<typeof sstAccidenteTipoEventoSchema>;
export type SstAccidenteSeveridad = z.infer<typeof sstAccidenteSeveridadSchema>;
export type SstAccidenteEstado = z.infer<typeof sstAccidenteEstadoSchema>;
export type SstAccionAccidenteEstado = z.infer<typeof sstAccionAccidenteEstadoSchema>;
export type ListSstAccidentesQuery = z.infer<typeof listSstAccidentesQuerySchema>;
export type CreateSstAccidenteInput = z.infer<typeof createSstAccidenteSchema>;
export type UpdateSstAccidenteInput = z.infer<typeof updateSstAccidenteSchema>;
export type ListSstAccionesAccidenteQuery = z.infer<typeof listSstAccionesAccidenteQuerySchema>;
export type CreateSstAccionAccidenteInput = z.infer<typeof createSstAccionAccidenteSchema>;
export type UpdateSstAccionAccidenteInput = z.infer<typeof updateSstAccionAccidenteSchema>;
export type ListSstAccidentesDashboardQuery = z.infer<typeof listSstAccidentesDashboardQuerySchema>;
export type ListSstAccidentesAlertasQuery = z.infer<typeof listSstAccidentesAlertasQuerySchema>;
export type SstInspeccionTipo = z.infer<typeof sstInspeccionTipoSchema>;
export type SstInspeccionEstado = z.infer<typeof sstInspeccionEstadoSchema>;
export type SstInspeccionHallazgoTipo = z.infer<typeof sstInspeccionHallazgoTipoSchema>;
export type SstInspeccionHallazgoNivel = z.infer<typeof sstInspeccionHallazgoNivelSchema>;
export type SstAccionInspeccionEstado = z.infer<typeof sstAccionInspeccionEstadoSchema>;
export type ListSstInspeccionesQuery = z.infer<typeof listSstInspeccionesQuerySchema>;
export type CreateSstInspeccionInput = z.infer<typeof createSstInspeccionSchema>;
export type UpdateSstInspeccionInput = z.infer<typeof updateSstInspeccionSchema>;
export type ListSstInspeccionHallazgosQuery = z.infer<typeof listSstInspeccionHallazgosQuerySchema>;
export type CreateSstInspeccionHallazgoInput = z.infer<typeof createSstInspeccionHallazgoSchema>;
export type UpdateSstInspeccionHallazgoInput = z.infer<typeof updateSstInspeccionHallazgoSchema>;
export type ListSstAccionesInspeccionQuery = z.infer<typeof listSstAccionesInspeccionQuerySchema>;
export type CreateSstAccionInspeccionInput = z.infer<typeof createSstAccionInspeccionSchema>;
export type UpdateSstAccionInspeccionInput = z.infer<typeof updateSstAccionInspeccionSchema>;
export type CloseSstAccionInspeccionInput = z.infer<typeof closeSstAccionInspeccionSchema>;
export type ListSstInspeccionesDashboardQuery = z.infer<typeof listSstInspeccionesDashboardQuerySchema>;
export type ListSstInspeccionesAlertasQuery = z.infer<typeof listSstInspeccionesAlertasQuerySchema>;
export type SstRiesgoTipoPeligro = z.infer<typeof sstRiesgoTipoPeligroSchema>;
export type SstRiesgoClasificacion = z.infer<typeof sstRiesgoClasificacionSchema>;
export type ListSstMatrizRiesgosQuery = z.infer<typeof listSstMatrizRiesgosQuerySchema>;
export type CreateSstMatrizRiesgoInput = z.infer<typeof createSstMatrizRiesgoSchema>;
export type UpdateSstMatrizRiesgoInput = z.infer<typeof updateSstMatrizRiesgoSchema>;
export type ListSstMatrizRiesgosDashboardQuery = z.infer<typeof listSstMatrizRiesgosDashboardQuerySchema>;
export type ListSstMatrizRiesgosAlertasQuery = z.infer<typeof listSstMatrizRiesgosAlertasQuerySchema>;
export type ListSstDashboardGeneralQuery = z.infer<typeof listSstDashboardGeneralQuerySchema>;
export type ListSstDashboardGeneralAlertasQuery = z.infer<typeof listSstDashboardGeneralAlertasQuerySchema>;
export type SstPlanAnualEstado = z.infer<typeof sstPlanAnualEstadoSchema>;
export type SstPlanAnualActividadEstado = z.infer<typeof sstPlanAnualActividadEstadoSchema>;
export type SstPlanAnualActividadEstadoAlerta = z.infer<typeof sstPlanAnualActividadEstadoAlertaSchema>;
export type ListSstPlanAnualQuery = z.infer<typeof listSstPlanAnualQuerySchema>;
export type CreateSstPlanAnualInput = z.infer<typeof createSstPlanAnualSchema>;
export type UpdateSstPlanAnualInput = z.infer<typeof updateSstPlanAnualSchema>;
export type ListSstPlanAnualActividadesQuery = z.infer<typeof listSstPlanAnualActividadesQuerySchema>;
export type CreateSstPlanAnualActividadInput = z.infer<typeof createSstPlanAnualActividadSchema>;
export type UpdateSstPlanAnualActividadInput = z.infer<typeof updateSstPlanAnualActividadSchema>;
export type ListSstPlanAnualDashboardQuery = z.infer<typeof listSstPlanAnualDashboardQuerySchema>;
export type ListSstPlanAnualAlertasQuery = z.infer<typeof listSstPlanAnualAlertasQuerySchema>;
