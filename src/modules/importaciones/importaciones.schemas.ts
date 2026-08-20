import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const positiveIntegerSchema = z.coerce.number().int().positive();

export const importacionLoteEstadoSchema = z.enum([
  'PENDIENTE_CONFIRMACION',
  'CON_ERRORES',
  'CONFIRMADO',
  'CANCELADO'
]);

export const importPreviewFilterSchema = z.enum([
  'TODOS',
  'LISTOS',
  'REUTILIZADOS',
  'YA_VINCULADOS',
  'ERRORES'
]);

export const importacionLoteIdParamSchema = z.object({
  id: positiveIntegerSchema
});

export const uploadPersonasVinculacionesSchema = z.object({
  contrato_id: positiveIntegerSchema
});

export const listImportacionLotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  estado: importacionLoteEstadoSchema.optional()
});

export const importacionPreviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  filter: importPreviewFilterSchema.optional().default('TODOS')
});

export type ImportacionLoteEstado = z.infer<typeof importacionLoteEstadoSchema>;
export type ImportPreviewFilter = z.infer<typeof importPreviewFilterSchema>;
export type ImportacionLoteIdParams = z.infer<typeof importacionLoteIdParamSchema>;
export type UploadPersonasVinculacionesInput = z.infer<typeof uploadPersonasVinculacionesSchema>;
export type ListImportacionLotesQuery = z.infer<typeof listImportacionLotesQuerySchema>;
export type ImportacionPreviewQuery = z.infer<typeof importacionPreviewQuerySchema>;
