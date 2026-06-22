import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const numericStringSchema = z.string().trim().regex(/^\d+$/, 'Debe ser un número entero válido');

const numericIdSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return value;
    }

    return Number(trimmed);
  }

  return value;
}, z.number().int().positive());

const numericValueSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length === 0) {
      return value;
    }

    return Number(trimmed);
  }

  return value;
}, z.number().finite());

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

export const modalidadBaseSchema = z.enum(['CAA', 'CAARES', 'RI']);
export const estadoCoberturaSchema = z.enum([
  'NO_REQUIERE',
  'FALTANTE',
  'COMPLETA',
  'SOBRECOBERTURA'
]);

export const contratoIdParamSchema = z.object({
  contrato_id: trimmedStringSchema
});

export const sedeModalidadIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const coberturaAsignacionIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const coberturaResumenQuerySchema = z.object({
  contrato_id: nullableTrimmedStringSchema.optional(),
  municipio_id: nullableTrimmedStringSchema.optional(),
  institucion_id: nullableTrimmedStringSchema.optional(),
  sede_id: nullableTrimmedStringSchema.optional(),
  categoria_cobertura: nullableTrimmedStringSchema.optional(),
  modalidad_base: modalidadBaseSchema.optional(),
  estado_cobertura: estadoCoberturaSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const createCoberturaAsignacionSchema = z.object({
  focalizacion_final_id: numericIdSchema,
  vinculacion_id: numericIdSchema,
  porcentaje_cobertura: numericValueSchema.pipe(z.number().positive().max(1)).optional().default(1),
  fecha_inicio: z.string().date(),
  fecha_fin: nullableDateSchema.optional().default(null),
  observacion: nullableTrimmedStringSchema.optional().default(null)
});

export const updateCoberturaAsignacionSchema = z
  .object({
    porcentaje_cobertura: numericValueSchema.pipe(z.number().positive().max(1)).optional(),
    fecha_inicio: z.string().date().optional(),
    fecha_fin: nullableDateSchema.optional(),
    observacion: nullableTrimmedStringSchema.optional(),
    activo: z.boolean().optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

export const createCoberturaNovedadSchema = z.object({
  contrato_id: trimmedStringSchema,
  focalizacion_final_id: nullableTrimmedStringSchema.optional().default(null),
  cobertura_asignacion_id: nullableTrimmedStringSchema.optional().default(null),
  tipo_novedad: trimmedStringSchema,
  descripcion: trimmedStringSchema,
  fecha_novedad: z.string().date().optional().default(() => new Date().toISOString().slice(0, 10)),
  payload: z.record(z.string(), z.unknown()).optional().default({})
});

export type ModalidadBase = z.infer<typeof modalidadBaseSchema>;
export type EstadoCobertura = z.infer<typeof estadoCoberturaSchema>;
export type CoberturaResumenQuery = z.infer<typeof coberturaResumenQuerySchema>;
export type CreateCoberturaAsignacionInput = z.infer<typeof createCoberturaAsignacionSchema>;
export type UpdateCoberturaAsignacionInput = z.infer<typeof updateCoberturaAsignacionSchema>;
export type CreateCoberturaNovedadInput = z.infer<typeof createCoberturaNovedadSchema>;
