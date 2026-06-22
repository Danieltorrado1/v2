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
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

const auditoriaFilterSchema = z.object({
  accion: nullableTrimmedStringSchema.optional(),
  contrato_id: nullableTrimmedStringSchema.optional(),
  empresa_id: nullableTrimmedStringSchema.optional(),
  entidad: nullableTrimmedStringSchema.optional(),
  modulo: nullableTrimmedStringSchema.optional(),
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional(),
  fecha_inicio: nullableDateSchema.optional(),
  fecha_fin: nullableDateSchema.optional(),
  usuario_id: nullableTrimmedStringSchema.optional(),
  registro_id: nullableTrimmedStringSchema.optional()
});

export const auditoriaIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const auditoriaEntidadParamSchema = z.object({
  tabla: trimmedStringSchema,
  registro_id: trimmedStringSchema
});

export const auditoriaUsuarioParamSchema = z.object({
  usuario_id: trimmedStringSchema
});

export const listAuditoriaQuerySchema = paginationSchema.extend(auditoriaFilterSchema.shape).refine(
  (data) => {
    const inicio = data.fecha_inicio ?? data.fecha_desde ?? null;
    const fin = data.fecha_fin ?? data.fecha_hasta ?? null;

    if (!inicio || !fin) {
      return true;
    }

    return inicio <= fin;
  },
  {
    message: 'fecha_fin must be greater than or equal to fecha_inicio',
    path: ['fecha_fin']
  }
);

export const auditoriaExportQuerySchema = auditoriaFilterSchema.extend({
  format: z.enum(['json', 'csv']).default('json')
}).refine(
  (data) => {
    const inicio = data.fecha_inicio ?? data.fecha_desde ?? null;
    const fin = data.fecha_fin ?? data.fecha_hasta ?? null;

    if (!inicio || !fin) {
      return true;
    }

    return inicio <= fin;
  },
  {
    message: 'fecha_fin must be greater than or equal to fecha_inicio',
    path: ['fecha_fin']
  }
);

export const listHistorialCambiosQuerySchema = paginationSchema;

export type ListAuditoriaQuery = z.infer<typeof listAuditoriaQuerySchema>;
export type ListHistorialCambiosQuery = z.infer<typeof listHistorialCambiosQuerySchema>;
export type AuditoriaExportQuery = z.infer<typeof auditoriaExportQuerySchema>;
