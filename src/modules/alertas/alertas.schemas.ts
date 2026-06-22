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

export const tipoAlertaSchema = z.enum([
  'DOCUMENTO_VENCIDO',
  'DOCUMENTO_POR_VENCER',
  'CONTRATO_POR_VENCER',
  'VINCULACION_POR_VENCER',
  'COBERTURA_INSUFICIENTE',
  'SOBRECOBERTURA',
  'NOMINA_PENDIENTE',
  'NOMINA_PERIODO_ABIERTO',
  'PLAN_SST_VENCIDO',
  'PLAN_SST_POR_VENCER',
  'SISTEMA'
]);

export const prioridadAlertaSchema = z.enum(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

export const estadoAlertaSchema = z.enum(['ACTIVA', 'LEIDA', 'RESUELTA', 'DESCARTADA']);

export const alertaIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const listAlertasQuerySchema = paginationSchema.extend({
  tipo_alerta: tipoAlertaSchema.optional(),
  prioridad: prioridadAlertaSchema.optional(),
  estado: estadoAlertaSchema.optional(),
  entidad: nullableTrimmedStringSchema.optional(),
  registro_id: nullableTrimmedStringSchema.optional(),
  usuario_id: nullableTrimmedStringSchema.optional(),
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional(),
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

export const generateAlertasSchema = z.object({
  tipos_alerta: z.array(tipoAlertaSchema).min(1).optional(),
  usuario_ids: z.array(trimmedStringSchema).min(1).optional()
}).default({});

export const listNotificacionesQuerySchema = paginationSchema.extend({
  usuario_id: nullableTrimmedStringSchema.optional(),
  leida: z.coerce.boolean().optional(),
  tipo: nullableTrimmedStringSchema.optional(),
  fecha_desde: nullableDateSchema.optional(),
  fecha_hasta: nullableDateSchema.optional()
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

export type TipoAlerta = z.infer<typeof tipoAlertaSchema>;
export type PrioridadAlerta = z.infer<typeof prioridadAlertaSchema>;
export type EstadoAlerta = z.infer<typeof estadoAlertaSchema>;
export type ListAlertasQuery = z.infer<typeof listAlertasQuerySchema>;
export type GenerateAlertasInput = z.infer<typeof generateAlertasSchema>;
export type ListNotificacionesQuery = z.infer<typeof listNotificacionesQuerySchema>;
