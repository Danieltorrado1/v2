import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);

const numericIdSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? value : Number(trimmed);
  }

  return value;
}, z.number().int().positive());

export const focalizacionImportUploadSchema = z.object({
  contrato_id: numericIdSchema,
});

export const focalizacionImportIdParamSchema = z.object({
  id: numericIdSchema,
});

export const focalizacionImportListQuerySchema = z.object({
  contrato_id: numericIdSchema,
});

export const focalizacionImportDetailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  filter: trimmedStringSchema.optional().default('TODOS'),
});

const optionalDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

export const focalizacionImportReprocessSchema = z.object({
  fecha_inicio_vigencia: optionalDateSchema.default(null),
  fecha_fin_vigencia: optionalDateSchema.default(null),
  preliminar_ids: z.array(numericIdSchema).max(1000).optional().default([]),
});

export const focalizacionManualAdjustmentSchema = z.object({
  contrato_id: numericIdSchema,
  sede_id: numericIdSchema,
  modalidad_id: numericIdSchema,
  fecha_inicio_vigencia: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  fecha_fin_vigencia: optionalDateSchema.default(null),
  focalizacion_total: z.coerce.number().int().min(0),
  focalizacion_primaria: z.coerce.number().int().min(0).optional().nullable().default(null),
  focalizacion_secundaria: z.coerce.number().int().min(0).optional().nullable().default(null),
  motivo: trimmedStringSchema.max(500),
  observacion: z.string().trim().max(2000).optional().nullable().default(null),
});

export type FocalizacionImportUploadInput = z.infer<typeof focalizacionImportUploadSchema>;
