import { z } from 'zod';

export const masterImportTypeSchema = z.enum([
  'DATOS_PERSONALES',
  'INFORMACION_BANCARIA',
  'CARACTERIZACION_SST'
]);
export const masterImportStatusSchema = z.enum([
  'PREPARADO',
  'VALIDADO',
  'APLICADO',
  'CANCELADO',
  'ERROR'
]);
export const masterImportFilterSchema = z.enum([
  'TODOS',
  'NUEVAS',
  'ACTUALIZACIONES',
  'SIN_CAMBIOS',
  'ERRORES',
  'DUPLICADOS',
  'APLICABLES'
]);

const positiveIntegerSchema = z.coerce.number().int().positive();

const nullableStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

export const masterImportAnalyzeSchema = z.object({
  tipo: masterImportTypeSchema,
  contrato_id: positiveIntegerSchema
});

export const masterImportLoteParamSchema = z.object({
  id: positiveIntegerSchema
});

export const masterImportValidateSchema = z.object({
  column_mappings: z.record(z.string(), nullableStringSchema)
});

export const masterImportListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  tipo: masterImportTypeSchema.optional(),
  estado: masterImportStatusSchema.optional()
});

export const masterImportPreviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  filter: masterImportFilterSchema.default('TODOS')
});

export type MasterImportTypeInput = z.infer<typeof masterImportTypeSchema>;
export type MasterImportStatusInput = z.infer<typeof masterImportStatusSchema>;
export type MasterImportFilterInput = z.infer<typeof masterImportFilterSchema>;
export type MasterImportAnalyzeInput = z.infer<typeof masterImportAnalyzeSchema>;
export type MasterImportLoteParams = z.infer<typeof masterImportLoteParamSchema>;
export type MasterImportValidateInput = z.infer<typeof masterImportValidateSchema>;
export type MasterImportListQuery = z.infer<typeof masterImportListQuerySchema>;
export type MasterImportPreviewQuery = z.infer<typeof masterImportPreviewQuerySchema>;
