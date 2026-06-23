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

export const nominaLiquidacionFinalEstadoSchema = z.enum([
  'BORRADOR',
  'LIQUIDADA',
  'PAGADA',
  'ANULADA'
]);

export const liquidacionFinalIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const liquidacionFinalBaseSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  persona_id: numericIdSchema,
  vinculacion_id: numericIdSchema,
  fecha_inicio_vinculacion: z.string().date(),
  fecha_retiro: z.string().date(),
  motivo_retiro: nullableTrimmedStringSchema.optional().default(null),
  dias_trabajados: z.coerce.number().min(0).max(1080).default(0),
  dias_pendientes_pago: z.coerce.number().min(0).default(0),
  dias_vacaciones_pendientes: z.coerce.number().min(0).default(0),
  salario_base: z.coerce.number().min(0).default(0),
  auxilio_transporte: z.coerce.number().min(0).default(0),
  otros_devengos: z.coerce.number().min(0).default(0),
  deducciones: z.coerce.number().min(0).default(0),
  indemnizacion: z.coerce.number().min(0).default(0),
  estado: nominaLiquidacionFinalEstadoSchema.optional().default('BORRADOR'),
  fecha_pago: z.string().date().nullable().optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const createLiquidacionFinalSchema = liquidacionFinalBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_retiro < data.fecha_inicio_vinculacion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_retiro must be greater than or equal to fecha_inicio_vinculacion',
      path: ['fecha_retiro']
    });
  }
});

export const updateLiquidacionFinalSchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  fecha_inicio_vinculacion: z.string().date().optional(),
  fecha_retiro: z.string().date().optional(),
  motivo_retiro: nullableTrimmedStringSchema.optional(),
  dias_trabajados: z.coerce.number().min(0).max(1080).optional(),
  dias_pendientes_pago: z.coerce.number().min(0).optional(),
  dias_vacaciones_pendientes: z.coerce.number().min(0).optional(),
  salario_base: z.coerce.number().min(0).optional(),
  auxilio_transporte: z.coerce.number().min(0).optional(),
  otros_devengos: z.coerce.number().min(0).optional(),
  deducciones: z.coerce.number().min(0).optional(),
  indemnizacion: z.coerce.number().min(0).optional(),
  estado: nominaLiquidacionFinalEstadoSchema.optional(),
  fecha_pago: z.string().date().nullable().optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }

  if (data.fecha_inicio_vinculacion && data.fecha_retiro && data.fecha_retiro < data.fecha_inicio_vinculacion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_retiro must be greater than or equal to fecha_inicio_vinculacion',
      path: ['fecha_retiro']
    });
  }
});

export const pagarLiquidacionFinalSchema = z.object({
  fecha_pago: z.string().date().nullable().optional(),
  cerrar_vinculacion: z.boolean().optional().default(false)
});

export const listLiquidacionesFinalesQuerySchema = paginationSchema.extend({
  activo: z.coerce.boolean().optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  estado: nominaLiquidacionFinalEstadoSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional()
});

export const liquidacionesFinalesDashboardQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export const liquidacionesFinalesAlertasQuerySchema = paginationSchema.extend({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export type CreateLiquidacionFinalInput = z.infer<typeof createLiquidacionFinalSchema>;
export type ListLiquidacionesFinalesQuery = z.infer<typeof listLiquidacionesFinalesQuerySchema>;
export type LiquidacionesFinalesAlertasQuery = z.infer<typeof liquidacionesFinalesAlertasQuerySchema>;
export type LiquidacionesFinalesDashboardQuery = z.infer<typeof liquidacionesFinalesDashboardQuerySchema>;
export type NominaLiquidacionFinalEstado = z.infer<typeof nominaLiquidacionFinalEstadoSchema>;
export type PagarLiquidacionFinalInput = z.infer<typeof pagarLiquidacionFinalSchema>;
export type UpdateLiquidacionFinalInput = z.infer<typeof updateLiquidacionFinalSchema>;
