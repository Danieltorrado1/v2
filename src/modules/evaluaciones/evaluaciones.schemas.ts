import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const numericIdSchema = z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String);
const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String).nullable());

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

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const evaluacionEstadoPersonaSchema = z.enum(['PENDIENTE', 'EN_PROCESO', 'FINALIZADA']);
export const evaluacionClasificacionSchema = z.enum(['DEFICIENTE', 'ACEPTABLE', 'BUENO', 'EXCELENTE']);

export const evaluacionParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const listEvaluacionesQuerySchema = paginationSchema.extend({
  activo: optionalBooleanSchema,
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  search: nullableTrimmedStringSchema.optional()
});

const evaluacionBaseSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  nombre_evaluacion: trimmedStringSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  activo: z.boolean().optional().default(true)
});

export const createEvaluacionSchema = evaluacionBaseSchema
  .refine((data) => data.fecha_fin >= data.fecha_inicio, {
    message: 'fecha_fin must be greater than or equal to fecha_inicio',
    path: ['fecha_fin']
  });

export const updateEvaluacionSchema = evaluacionBaseSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  })
  .refine((data) => {
    if (data.fecha_inicio && data.fecha_fin) {
      return data.fecha_fin >= data.fecha_inicio;
    }

    return true;
  }, {
    message: 'fecha_fin must be greater than or equal to fecha_inicio',
    path: ['fecha_fin']
  });

export const createCompetenciaSchema = z.object({
  evaluacion_id: numericIdSchema,
  nombre_competencia: trimmedStringSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  peso: z.coerce.number().positive().max(999.99).default(1),
  activo: z.boolean().optional().default(true)
});

export const updateCompetenciaSchema = createCompetenciaSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export const listEvaluacionesPersonaQuerySchema = paginationSchema.extend({
  activo: optionalBooleanSchema,
  evaluacion_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  search: nullableTrimmedStringSchema.optional(),
  estado: evaluacionEstadoPersonaSchema.optional()
});

export const createEvaluacionPersonaSchema = z.object({
  evaluacion_id: numericIdSchema,
  persona_id: numericIdSchema,
  vinculacion_id: nullableNumericIdSchema.optional().default(null),
  calificacion_total: z.coerce.number().min(0).max(5).nullable().optional().default(null),
  fortalezas: nullableTrimmedStringSchema.optional().default(null),
  oportunidades_mejora: nullableTrimmedStringSchema.optional().default(null),
  plan_accion: nullableTrimmedStringSchema.optional().default(null),
  estado: evaluacionEstadoPersonaSchema.optional().default('PENDIENTE'),
  activo: z.boolean().optional().default(true)
});

export const updateEvaluacionPersonaSchema = createEvaluacionPersonaSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required'
  });

export const createRespuestaSchema = z.object({
  evaluacion_persona_id: numericIdSchema,
  competencia_id: numericIdSchema,
  calificacion: z.coerce.number().min(1).max(5),
  observacion: nullableTrimmedStringSchema.optional().default(null)
});

export const dashboardQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  evaluacion_id: nullableNumericIdSchema.optional()
});

export const dashboardGeneralQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export const dashboardGeneralAlertasQuerySchema = paginationSchema.extend({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export const dashboardGeneralRankingQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export type CreateCompetenciaInput = z.infer<typeof createCompetenciaSchema>;
export type CreateEvaluacionInput = z.infer<typeof createEvaluacionSchema>;
export type CreateEvaluacionPersonaInput = z.infer<typeof createEvaluacionPersonaSchema>;
export type CreateRespuestaInput = z.infer<typeof createRespuestaSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardGeneralAlertasQuery = z.infer<typeof dashboardGeneralAlertasQuerySchema>;
export type DashboardGeneralQuery = z.infer<typeof dashboardGeneralQuerySchema>;
export type DashboardGeneralRankingQuery = z.infer<typeof dashboardGeneralRankingQuerySchema>;
export type EvaluacionClasificacion = z.infer<typeof evaluacionClasificacionSchema>;
export type EvaluacionEstadoPersona = z.infer<typeof evaluacionEstadoPersonaSchema>;
export type ListEvaluacionesPersonaQuery = z.infer<typeof listEvaluacionesPersonaQuerySchema>;
export type ListEvaluacionesQuery = z.infer<typeof listEvaluacionesQuerySchema>;
export type UpdateCompetenciaInput = z.infer<typeof updateCompetenciaSchema>;
export type UpdateEvaluacionInput = z.infer<typeof updateEvaluacionSchema>;
export type UpdateEvaluacionPersonaInput = z.infer<typeof updateEvaluacionPersonaSchema>;
