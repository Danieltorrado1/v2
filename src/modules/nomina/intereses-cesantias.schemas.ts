import { z } from 'zod';

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String).nullable());

const numericIdSchema = z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const nominaInteresesCesantiasEstadoSchema = z.enum([
  'PENDIENTE',
  'LIQUIDADO',
  'PAGADO',
  'ANULADO'
]);

export const interesesCesantiaIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const interesesCesantiaBaseSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  persona_id: numericIdSchema,
  vinculacion_id: numericIdSchema,
  cesantia_id: nullableNumericIdSchema.optional().default(null),
  periodo: z.string().trim().min(1),
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  dias_liquidados: z.coerce.number().min(0).max(360).default(0),
  valor_cesantias: z.coerce.number().min(0).default(0),
  porcentaje_interes: z.coerce.number().min(0).max(100).default(12),
  estado: nominaInteresesCesantiasEstadoSchema.optional().default('PENDIENTE'),
  fecha_pago: z.string().date().nullable().optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const createInteresesCesantiaSchema = interesesCesantiaBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_fin < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const updateInteresesCesantiaSchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  cesantia_id: nullableNumericIdSchema.optional(),
  periodo: z.string().trim().min(1).optional(),
  fecha_inicio: z.string().date().optional(),
  fecha_fin: z.string().date().optional(),
  dias_liquidados: z.coerce.number().min(0).max(360).optional(),
  valor_cesantias: z.coerce.number().min(0).optional(),
  porcentaje_interes: z.coerce.number().min(0).max(100).optional(),
  estado: nominaInteresesCesantiasEstadoSchema.optional(),
  fecha_pago: z.string().date().nullable().optional(),
  activo: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }

  if (data.fecha_inicio && data.fecha_fin && data.fecha_fin < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const listInteresesCesantiasQuerySchema = paginationSchema.extend({
  activo: z.coerce.boolean().optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  estado: nominaInteresesCesantiasEstadoSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional()
});

export const interesesCesantiasDashboardQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export const interesesCesantiasAlertasQuerySchema = paginationSchema.extend({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export type CreateInteresesCesantiaInput = z.infer<typeof createInteresesCesantiaSchema>;
export type InteresesCesantiasAlertasQuery = z.infer<typeof interesesCesantiasAlertasQuerySchema>;
export type InteresesCesantiasDashboardQuery = z.infer<typeof interesesCesantiasDashboardQuerySchema>;
export type ListInteresesCesantiasQuery = z.infer<typeof listInteresesCesantiasQuerySchema>;
export type NominaInteresesCesantiasEstado = z.infer<typeof nominaInteresesCesantiasEstadoSchema>;
export type UpdateInteresesCesantiaInput = z.infer<typeof updateInteresesCesantiaSchema>;
