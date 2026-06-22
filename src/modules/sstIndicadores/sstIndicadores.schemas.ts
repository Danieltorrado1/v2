import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const numericStringSchema = z.string().trim().regex(/^\d+$/);
const numericIdSchema = z.union([z.number().int().positive(), numericStringSchema]).transform((value) =>
  String(value)
);

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, z.union([z.number().int().positive(), numericStringSchema]).transform((value) => String(value)).nullable());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

const optionalBooleanSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true') {
      return true;
    }

    if (normalized === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const indicadoresClasificacionSchema = z.enum(['CRITICO', 'MEDIO', 'BUENO', 'EXCELENTE']);
export const indicadoresAlertaTipoSchema = z.enum([
  'INDICADOR_CRITICO',
  'INDICADOR_BAJO_CUMPLIMIENTO'
]);

export const listIndicadoresPeriodosQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  activo: optionalBooleanSchema,
  search: nullableTrimmedStringSchema.optional()
});

export const createIndicadoresPeriodoSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  nombre_periodo: trimmedStringSchema,
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  activo: z.boolean().optional().default(true)
}).refine((data) => data.fecha_inicio <= data.fecha_fin, {
  message: 'fecha_fin must be greater than or equal to fecha_inicio',
  path: ['fecha_fin']
});

export const getIndicadoresDashboardQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  periodo_id: nullableNumericIdSchema.optional()
});

export const getIndicadoresHistoricoQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  periodo_id: nullableNumericIdSchema.optional()
});

export const getIndicadoresAlertasQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  periodo_id: nullableNumericIdSchema.optional()
});

export type ListIndicadoresPeriodosQuery = z.infer<typeof listIndicadoresPeriodosQuerySchema>;
export type CreateIndicadoresPeriodoInput = z.infer<typeof createIndicadoresPeriodoSchema>;
export type GetIndicadoresDashboardQuery = z.infer<typeof getIndicadoresDashboardQuerySchema>;
export type GetIndicadoresHistoricoQuery = z.infer<typeof getIndicadoresHistoricoQuerySchema>;
export type GetIndicadoresAlertasQuery = z.infer<typeof getIndicadoresAlertasQuerySchema>;
export type IndicadoresClasificacion = z.infer<typeof indicadoresClasificacionSchema>;
export type IndicadoresAlertaTipo = z.infer<typeof indicadoresAlertaTipoSchema>;
