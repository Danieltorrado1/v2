import { z } from 'zod';

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

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const nominaCesantiaEstadoSchema = z.enum([
  'PENDIENTE',
  'LIQUIDADA',
  'CONSIGNADA',
  'PAGADA',
  'ANULADA'
]);

export const cesantiaIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const cesantiaBaseSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  persona_id: numericIdSchema,
  vinculacion_id: numericIdSchema,
  periodo: z.string().trim().min(1),
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  dias_liquidados: z.coerce.number().min(0).max(360).default(0),
  salario_base: z.coerce.number().min(0).default(0),
  auxilio_transporte: z.coerce.number().min(0).default(0),
  fondo_cesantias: nullableTrimmedStringSchema.optional().default(null),
  fecha_consignacion: z.string().date().nullable().optional().default(null),
  estado: nominaCesantiaEstadoSchema.optional().default('PENDIENTE'),
  activo: z.boolean().optional().default(true)
});

export const createCesantiaSchema = cesantiaBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_fin < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const updateCesantiaSchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  periodo: z.string().trim().min(1).optional(),
  fecha_inicio: z.string().date().optional(),
  fecha_fin: z.string().date().optional(),
  dias_liquidados: z.coerce.number().min(0).max(360).optional(),
  salario_base: z.coerce.number().min(0).optional(),
  auxilio_transporte: z.coerce.number().min(0).optional(),
  fondo_cesantias: nullableTrimmedStringSchema.optional(),
  fecha_consignacion: z.string().date().nullable().optional(),
  estado: nominaCesantiaEstadoSchema.optional(),
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

export const consignCesantiaSchema = z.object({
  fondo_cesantias: nullableTrimmedStringSchema.optional(),
  fecha_consignacion: z.string().date().nullable().optional()
});

export const listCesantiasQuerySchema = paginationSchema.extend({
  activo: z.coerce.boolean().optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  estado: nominaCesantiaEstadoSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional()
});

export const cesantiasDashboardQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export const cesantiasAlertasQuerySchema = paginationSchema.extend({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export type CesantiasAlertasQuery = z.infer<typeof cesantiasAlertasQuerySchema>;
export type CesantiasDashboardQuery = z.infer<typeof cesantiasDashboardQuerySchema>;
export type ConsignCesantiaInput = z.infer<typeof consignCesantiaSchema>;
export type CreateCesantiaInput = z.infer<typeof createCesantiaSchema>;
export type ListCesantiasQuery = z.infer<typeof listCesantiasQuerySchema>;
export type NominaCesantiaEstado = z.infer<typeof nominaCesantiaEstadoSchema>;
export type UpdateCesantiaInput = z.infer<typeof updateCesantiaSchema>;
