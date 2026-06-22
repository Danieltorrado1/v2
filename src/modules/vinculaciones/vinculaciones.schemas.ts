import { z } from 'zod';

export const vinculacionEstadoSchema = z.enum(['ACTIVA', 'RETIRADA', 'SUSPENDIDA']);
export const metodoPagoSchema = z.enum([
  'ASISTENCIA',
  'CATEGORIA',
  'OPS_CUENTA_COBRO',
  'OPS_VALOR_FIJO',
  'OPS_POR_PRODUCTO'
]);

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const nullableMetodoPagoSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, metodoPagoSchema.nullable());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

const numericIdSchema = z.union([z.number().int(), z.string().trim().regex(/^\d+$/)]);

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, numericIdSchema.transform((value) => Number(value)).nullable());

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

export const vinculacionIdParamSchema = z.object({
  id: z.coerce.number().int()
});

export const vinculacionPersonaParamSchema = z.object({
  persona_id: z.coerce.number().int()
});

export const listVinculacionesQuerySchema = z.object({
  persona_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_vinculacion_id: nullableNumericIdSchema.optional(),
  contrato_cargo_id: nullableNumericIdSchema.optional(),
  estado_vinculacion: vinculacionEstadoSchema.optional(),
  fecha_inicio_desde: nullableDateSchema.optional(),
  fecha_inicio_hasta: nullableDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const createVinculacionSchema = z.object({
  persona_id: numericIdSchema.transform((value) => Number(value)),
  empresa_id: numericIdSchema.transform((value) => Number(value)),
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  tipo_vinculacion_id: numericIdSchema.transform((value) => Number(value)),
  contrato_cargo_id: numericIdSchema.transform((value) => Number(value)),
  fecha_inicio: z.string().date(),
  fecha_fin: nullableDateSchema.optional().default(null),
  estado_vinculacion: vinculacionEstadoSchema.optional().default('ACTIVA'),
  cuenta_como_experiencia: nullableBooleanSchema.optional().default(true),
  metodo_pago: nullableMetodoPagoSchema.optional().default(null)
});

export const updateVinculacionSchema = z
  .object({
    persona_id: numericIdSchema.transform((value) => Number(value)).optional(),
    empresa_id: numericIdSchema.transform((value) => Number(value)).optional(),
    contrato_id: numericIdSchema.transform((value) => Number(value)).optional(),
    tipo_vinculacion_id: numericIdSchema.transform((value) => Number(value)).optional(),
    contrato_cargo_id: numericIdSchema.transform((value) => Number(value)).optional(),
    fecha_inicio: z.string().date().optional(),
    fecha_fin: nullableDateSchema.optional(),
    estado_vinculacion: vinculacionEstadoSchema.optional(),
    cuenta_como_experiencia: nullableBooleanSchema.optional(),
    metodo_pago: nullableMetodoPagoSchema.optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

export const retirarVinculacionSchema = z.object({
  fecha_retiro: z.string().date(),
  motivo_retiro: nullableTrimmedString.optional().default(null),
  observaciones: nullableTrimmedString.optional().default(null)
});

export const suspenderVinculacionSchema = z.object({
  fecha_suspension: z.string().date(),
  motivo_suspension: nullableTrimmedString.optional().default(null),
  observaciones: nullableTrimmedString.optional().default(null)
});

export const reactivarVinculacionSchema = z.object({
  fecha_reactivacion: z.string().date().optional(),
  observaciones: nullableTrimmedString.optional().default(null)
});

export type VinculacionEstado = z.infer<typeof vinculacionEstadoSchema>;
export type VinculacionIdParams = z.infer<typeof vinculacionIdParamSchema>;
export type VinculacionPersonaParams = z.infer<typeof vinculacionPersonaParamSchema>;
export type ListVinculacionesQuery = z.infer<typeof listVinculacionesQuerySchema>;
export type CreateVinculacionInput = z.infer<typeof createVinculacionSchema>;
export type UpdateVinculacionInput = z.infer<typeof updateVinculacionSchema>;
export type RetirarVinculacionInput = z.infer<typeof retirarVinculacionSchema>;
export type SuspenderVinculacionInput = z.infer<typeof suspenderVinculacionSchema>;
export type ReactivarVinculacionInput = z.infer<typeof reactivarVinculacionSchema>;
