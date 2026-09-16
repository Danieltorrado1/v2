import { z } from 'zod';
const date = z.iso.date().refine(value => !value.startsWith('0000'), 'Fecha invalida');
const agendaModule = z.enum(['PERSONAL','COBERTURA','NOMINA','DOCUMENTOS','SST','REMISIONES','CONTRATOS','ADMINISTRACION']);
const agendaEntity = z.enum(['PERSONA','VINCULACION','INSTITUCION','SEDE','CONTRATO','PERIODO','DOCUMENTO','CASO_SST','REMISION']);
export const taskIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const assignableUsersSchema = z.object({ empresa_id:z.coerce.number().int().positive().optional(), search:z.string().trim().max(120).optional(), limit:z.coerce.number().int().min(1).max(100).default(50) });
export const listTasksSchema = z.object({ page:z.coerce.number().int().min(1).default(1), limit:z.coerce.number().int().min(1).max(100).default(25), responsable_id:z.coerce.number().int().positive().optional(), creador_id:z.coerce.number().int().positive().optional(), estado:z.enum(['PENDIENTE','EN_PROCESO','TERMINADA','REPROGRAMADA','CANCELADA']).optional(), prioridad:z.enum(['A','B','C']).optional(), tipo:z.enum(['TALENTO_HUMANO','COBERTURA','NOMINA','DOCUMENTOS','SST','REMISIONES','CONTRATOS','ADMINISTRATIVA','OTRA']).optional(), desde:date.optional(), hasta:date.optional(), vencidas:z.coerce.boolean().optional(), municipio_id:z.coerce.number().int().positive().optional(), institucion_id:z.coerce.number().int().positive().optional(), sede_id:z.coerce.number().int().positive().optional(), modulo_relacionado:agendaModule.optional(), q:z.string().trim().max(120).optional() });
export const createTaskSchema = z.object({ titulo:z.string().trim().min(1).max(240), descripcion:z.string().trim().max(5000).optional().nullable(), tipo:z.enum(['TALENTO_HUMANO','COBERTURA','NOMINA','DOCUMENTOS','SST','REMISIONES','CONTRATOS','ADMINISTRATIVA','OTRA']), prioridad:z.enum(['A','B','C']).default('C'), fecha_prevista:date, hora_inicio:z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(), hora_finalizacion:z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(), duracion_estimada_minutos:z.number().int().positive().optional().nullable(), fecha_limite:date.optional().nullable(), responsable_id:z.number().int().positive(), origen:z.enum(['MANUAL','MODULO','SISTEMA']).default('MANUAL'), modulo_relacionado:agendaModule.optional().nullable(), tipo_entidad_relacionada:agendaEntity.optional().nullable(), entidad_relacionada_id:z.number().int().positive().optional().nullable(), municipio_id:z.number().int().positive().optional().nullable(), institucion_id:z.number().int().positive().optional().nullable(), sede_id:z.number().int().positive().optional().nullable(), persona_id:z.number().int().positive().optional().nullable(), vinculacion_id:z.number().int().positive().optional().nullable(), requiere_seguimiento:z.boolean().default(false), fecha_proxima_seguimiento:date.optional().nullable(), participantes:z.array(z.number().int().positive()).max(100).default([]) });
export const updateTaskSchema = createTaskSchema.partial().omit({ participantes:true });
export const assignSchema = z.object({ responsable_id:z.number().int().positive(), motivo:z.string().trim().max(1000).optional() });
export const participantsSchema = z.object({ participantes:z.array(z.number().int().positive()).max(100) });
export const transitionSchema = z.object({ version:z.number().int().positive().optional(), comentario:z.string().trim().max(2000).optional() });
export const rescheduleSchema = z.object({ fecha_prevista:date, fecha_limite:date.optional().nullable(), motivo:z.string().trim().min(3).max(1000), version:z.number().int().positive().optional() });
export const cancelSchema = z.object({ motivo:z.string().trim().min(3).max(1000), version:z.number().int().positive().optional() });
// Automatic history types are written only by their dedicated operations.
export const manualFollowupTypes = ['COMENTARIO', 'EVIDENCIA'] as const;
export const followupSchema = z.object({
  comentario: z.string().trim().min(1).max(5000),
  tipo: z.enum(manualFollowupTypes).default('COMENTARIO'),
  evidencia_documento_id: z.number().int().positive().optional().nullable(),
  fecha_proxima_seguimiento: z.iso.date().refine(value => !value.startsWith('0000'), 'Fecha invalida').optional().nullable(),
  requiere_seguimiento: z.boolean().optional(),
}).strict();
const topDate = z.iso.date().refine(value => !value.startsWith('0000'), 'Fecha invalida');
const topSlots = z.array(z.number().int().positive().nullable()).max(3).refine(ids => new Set(ids.filter(id => id !== null)).size === ids.filter(id => id !== null).length, 'Tarea duplicada en Top 3');
export const topQuerySchema = z.object({ fecha: topDate }).strict();
export const topSchema = z.object({ fecha: topDate, tarea_ids: topSlots, esperado: topSlots }).strict();
export const closeDaySchema = z.object({ fecha:date, resumen_dia:z.string().max(5000).optional(), resumen:z.string().max(5000).optional(), terminadas:z.array(z.number().int().positive()).optional(), pendientes:z.array(z.number().int().positive()).optional(), reprogramadas:z.array(z.number().int().positive()).optional(), observaciones:z.string().max(5000).optional() }).refine(input => { const ids = [...(input.terminadas ?? []), ...(input.pendientes ?? []), ...(input.reprogramadas ?? [])]; return new Set(ids).size === ids.length; }, 'Una tarea solo puede clasificarse una vez');
export const followupListSchema = z.object({
  empresa_id:z.coerce.number().int().positive().optional(),
  page:z.coerce.number().int().min(1).default(1), limit:z.coerce.number().int().min(1).max(100).default(25),
  desde:z.iso.date().optional(), hasta:z.iso.date().optional(), responsable_id:z.coerce.number().int().positive().optional(),
  tipo:z.enum(['COMENTARIO','EVIDENCIA','CAMBIO_ESTADO','REPROGRAMACION','REASIGNACION','CIERRE','REAPERTURA']).optional(),
  tipo_tarea:z.enum(['TALENTO_HUMANO','COBERTURA','NOMINA','DOCUMENTOS','SST','REMISIONES','CONTRATOS','ADMINISTRATIVA','OTRA']).optional(),
  modulo_relacionado:agendaModule.optional(), q:z.string().trim().max(120).optional(),
  filtro:z.enum(['hoy','vencidos','proximos','sin_fecha','realizados']).optional()
}).refine(input=>!input.desde||!input.hasta||input.desde<=input.hasta,{message:'Rango de fechas invalido',path:['hasta']});
export type AgendaListQuery = z.infer<typeof listTasksSchema>;
