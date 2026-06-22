import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);

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

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(5000).default(100)
});

export const reportFormatSchema = z.enum(['json', 'excel', 'pdf']).default('json');

export const commonReportQuerySchema = paginationSchema.extend({
  format: reportFormatSchema,
  empresa_id: nullableTrimmedStringSchema.optional(),
  contrato_id: nullableTrimmedStringSchema.optional(),
  municipio_id: nullableTrimmedStringSchema.optional(),
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional(),
  estado: nullableTrimmedStringSchema.optional(),
  activo: z.coerce.boolean().optional()
}).refine(
  (data) => {
    if (!data.fecha_desde || !data.fecha_hasta) {
      return true;
    }

    return data.fecha_desde <= data.fecha_hasta;
  },
  {
    message: 'fecha_hasta must be greater than or equal to fecha_desde',
    path: ['fecha_hasta']
  }
);

export const reportesContratoParamSchema = z.object({
  contrato_id: trimmedStringSchema
});

export const reportesVinculacionParamSchema = z.object({
  vinculacion_id: trimmedStringSchema
});

export const reportesPeriodoParamSchema = z.object({
  periodo_id: trimmedStringSchema
});

export type ReportFormat = z.infer<typeof reportFormatSchema>;
export type CommonReportQuery = z.infer<typeof commonReportQuerySchema>;
