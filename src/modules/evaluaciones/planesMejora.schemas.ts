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

export const planMejoraEstadoSchema = z.enum(['ABIERTO', 'EN_PROCESO', 'CERRADO', 'VENCIDO', 'CANCELADO']);

export const planMejoraParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const listPlanesMejoraQuerySchema = paginationSchema.extend({
  activo: optionalBooleanSchema,
  estado: planMejoraEstadoSchema.optional(),
  evaluacion_persona_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  search: nullableTrimmedStringSchema.optional()
});

const planMejoraBaseSchema = z.object({
  evaluacion_persona_id: numericIdSchema,
  persona_id: numericIdSchema,
  vinculacion_id: nullableNumericIdSchema.optional().default(null),
  objetivo: trimmedStringSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  responsable: nullableTrimmedStringSchema.optional().default(null),
  fecha_inicio: z.string().date(),
  fecha_compromiso: z.string().date(),
  fecha_cierre: z.string().date().nullable().optional().default(null),
  estado: planMejoraEstadoSchema.optional().default('ABIERTO'),
  activo: z.boolean().optional().default(true)
});

export const createPlanMejoraSchema = planMejoraBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_compromiso < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_compromiso must be greater than or equal to fecha_inicio',
      path: ['fecha_compromiso']
    });
  }
});

export const updatePlanMejoraSchema = planMejoraBaseSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }

  if (data.fecha_inicio && data.fecha_compromiso && data.fecha_compromiso < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_compromiso must be greater than or equal to fecha_inicio',
      path: ['fecha_compromiso']
    });
  }
});

export const createSeguimientoSchema = z.object({
  plan_mejora_id: numericIdSchema,
  fecha_seguimiento: z.string().date(),
  comentario: trimmedStringSchema,
  porcentaje_avance: z.coerce.number().int().min(0).max(100).default(0),
  responsable: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateSeguimientoSchema = createSeguimientoSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }
});

export const dashboardPlanesMejoraQuerySchema = z.object({
  evaluacion_persona_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional()
});

export type CreatePlanMejoraInput = z.infer<typeof createPlanMejoraSchema>;
export type CreateSeguimientoInput = z.infer<typeof createSeguimientoSchema>;
export type DashboardPlanesMejoraQuery = z.infer<typeof dashboardPlanesMejoraQuerySchema>;
export type ListPlanesMejoraQuery = z.infer<typeof listPlanesMejoraQuerySchema>;
export type PlanMejoraEstado = z.infer<typeof planMejoraEstadoSchema>;
export type UpdatePlanMejoraInput = z.infer<typeof updatePlanMejoraSchema>;
export type UpdateSeguimientoInput = z.infer<typeof updateSeguimientoSchema>;
