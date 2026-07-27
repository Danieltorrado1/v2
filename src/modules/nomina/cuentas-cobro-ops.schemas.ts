import { z } from 'zod';

import { opsMetodoPagoSchema } from '../vinculaciones/vinculaciones.schemas';

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const positiveNumericIdSchema = z
  .union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)])
  .transform((value) => Number(value));

const nullablePositiveNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, positiveNumericIdSchema.nullable());

const positiveMoneySchema = z.coerce.number().min(0);
const positiveQuantitySchema = z.coerce.number().gt(0);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const cuentaCobroOpsEstadoSchema = z.enum([
  'BORRADOR',
  'GENERADA',
  'REVISADA',
  'APROBADA',
  'PAGADA',
  'ANULADA'
]);

export const cuentaCobroOpsIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const cuentaCobroOpsDetalleSchema = z.object({
  concepto: z.string().trim().min(1),
  cantidad: positiveQuantitySchema,
  valor_unitario: positiveMoneySchema,
  observacion: nullableTrimmedStringSchema.optional().default(null),
  orden: z.coerce.number().int().min(0).optional()
});

export const listCuentasCobroOpsQuerySchema = paginationSchema.extend({
  activo: z.coerce.boolean().optional(),
  contrato_id: nullablePositiveNumericIdSchema.optional(),
  empresa_id: nullablePositiveNumericIdSchema.optional(),
  estado: cuentaCobroOpsEstadoSchema.optional(),
  metodo_pago: opsMetodoPagoSchema.optional(),
  periodo_id: nullablePositiveNumericIdSchema.optional(),
  persona_id: nullablePositiveNumericIdSchema.optional(),
  search: nullableTrimmedStringSchema.optional(),
  vinculacion_id: nullablePositiveNumericIdSchema.optional()
});

export const createCuentaCobroOpsSchema = z.object({
  empresa_id: positiveNumericIdSchema,
  contrato_id: positiveNumericIdSchema,
  vinculacion_id: positiveNumericIdSchema,
  periodo_id: positiveNumericIdSchema,
  numero_cuenta: nullablePositiveNumericIdSchema.optional().default(null),
  fecha_generacion: z.string().date().optional(),
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  valor_bruto: positiveMoneySchema.optional(),
  descuentos: positiveMoneySchema.optional().default(0),
  estado: cuentaCobroOpsEstadoSchema.optional().default('BORRADOR'),
  observaciones: nullableTrimmedStringSchema.optional().default(null),
  documento_id: nullablePositiveNumericIdSchema.optional().default(null),
  detalles: z.array(cuentaCobroOpsDetalleSchema).optional().default([])
}).superRefine((data, ctx) => {
  if (data.fecha_fin < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['fecha_fin'],
      message: 'fecha_fin must be greater than or equal to fecha_inicio'
    });
  }

  if ((data.valor_bruto === undefined || data.valor_bruto === null) && data.detalles.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valor_bruto'],
      message: 'valor_bruto is required when detalles are not provided'
    });
  }
});

export const updateCuentaCobroOpsSchema = z.object({
  empresa_id: nullablePositiveNumericIdSchema.optional(),
  contrato_id: nullablePositiveNumericIdSchema.optional(),
  vinculacion_id: nullablePositiveNumericIdSchema.optional(),
  periodo_id: nullablePositiveNumericIdSchema.optional(),
  numero_cuenta: nullablePositiveNumericIdSchema.optional(),
  fecha_generacion: z.string().date().optional(),
  fecha_inicio: z.string().date().optional(),
  fecha_fin: z.string().date().optional(),
  valor_bruto: positiveMoneySchema.optional(),
  descuentos: positiveMoneySchema.optional(),
  observaciones: nullableTrimmedStringSchema.optional(),
  documento_id: nullablePositiveNumericIdSchema.optional(),
  detalles: z.array(cuentaCobroOpsDetalleSchema).optional(),
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
      path: ['fecha_fin'],
      message: 'fecha_fin must be greater than or equal to fecha_inicio'
    });
  }
});

export const changeCuentaCobroOpsEstadoSchema = z.object({
  estado: cuentaCobroOpsEstadoSchema,
  observaciones: nullableTrimmedStringSchema.optional().default(null)
});

export const generarCuentaCobroOpsSchema = z.object({
  periodo_id: positiveNumericIdSchema,
  vinculacion_id: nullablePositiveNumericIdSchema.optional().default(null)
});

export const anularCuentaCobroOpsSchema = z.object({
  observaciones: nullableTrimmedStringSchema.optional().default(null)
});

export type CuentaCobroOpsEstado = z.infer<typeof cuentaCobroOpsEstadoSchema>;
export type CuentaCobroOpsDetalleInput = z.infer<typeof cuentaCobroOpsDetalleSchema>;
export type ListCuentasCobroOpsQuery = z.infer<typeof listCuentasCobroOpsQuerySchema>;
export type CreateCuentaCobroOpsInput = z.infer<typeof createCuentaCobroOpsSchema>;
export type UpdateCuentaCobroOpsInput = z.infer<typeof updateCuentaCobroOpsSchema>;
export type ChangeCuentaCobroOpsEstadoInput = z.infer<typeof changeCuentaCobroOpsEstadoSchema>;
export type GenerarCuentaCobroOpsInput = z.infer<typeof generarCuentaCobroOpsSchema>;
export type AnularCuentaCobroOpsInput = z.infer<typeof anularCuentaCobroOpsSchema>;
