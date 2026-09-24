import { z } from 'zod';

const id = z.coerce.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const contextoLaboralQuerySchema = z.object({
  empresa_id: id.optional(), contrato_id: id.optional(), vinculacion_id: id.optional(), persona_id: id.optional(), fecha: date
}).refine((value) => value.vinculacion_id || value.persona_id, { message: 'vinculacion_id o persona_id es requerido' });

export const integracionListQuerySchema = z.object({
  empresa_id: id.optional(), contrato_id: id.optional(), vinculacion_id: id.optional(), persona_id: id.optional(), periodo_id: id.optional(),
  event_type: z.enum(['VINCULACION_CREADA','VINCULACION_ACTUALIZADA','VINCULACION_RETIRADA','ASIGNACION_OPERATIVA_CAMBIADA','CONDICION_PENSION_CAMBIADA','ASISTENCIA_CAMBIADA','NOVEDAD_CREADA','NOVEDAD_ACTUALIZADA','NOVEDAD_DESACTIVADA','TURNO_CREADO','TURNO_ACTUALIZADO','TURNO_DESACTIVADO','LIQUIDACION_RECALCULADA','LIQUIDACION_FINALIZADA']).optional(), status: z.enum(['PENDIENTE','PROCESANDO','PROCESADO','ERROR']).optional(),
  accion_requerida: z.enum(['REQUIERE_SINCRONIZACION','REQUIERE_AJUSTE_AUTORIZADO','SIN_IMPACTO']).optional(),
  desde: date.optional(), hasta: date.optional(), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const integracionIdParamSchema = z.object({ id });
