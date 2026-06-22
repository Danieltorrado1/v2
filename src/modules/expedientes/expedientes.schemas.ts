import { z } from 'zod';

export const expedientePersonaParamSchema = z.object({
  persona_id: z.coerce.number().int().positive()
});

export const expedienteAlertaTipoSchema = z.enum([
  'DOCUMENTO_FALTANTE',
  'DOCUMENTO_VENCIDO',
  'DOCUMENTO_POR_VENCER',
  'EXPEDIENTE_INCOMPLETO'
]);

export const expedienteAlertaSeveridadSchema = z.enum(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);
export const expedienteAlertaEstadoSchema = z.enum(['ACTIVA', 'RESUELTA', 'IGNORADA']);

export const expedienteAlertasQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  tipo_alerta: expedienteAlertaTipoSchema.optional(),
  severidad: expedienteAlertaSeveridadSchema.optional(),
  estado: expedienteAlertaEstadoSchema.optional()
});

export const expedienteTimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200)
});

export type ExpedienteAlertasQuery = z.infer<typeof expedienteAlertasQuerySchema>;
export type ExpedienteTimelineQuery = z.infer<typeof expedienteTimelineQuerySchema>;
