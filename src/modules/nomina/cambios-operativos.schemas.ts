import { z } from 'zod';

const id = z.union([z.string().regex(/^\d+$/), z.coerce.number().int().positive()]).transform(String);
const nullableId = id.nullable().optional();
const contexto = z.object({
  municipio_id: nullableId, municipio: z.string().trim().nullable().optional(),
  institucion_id: nullableId, institucion: z.string().trim().nullable().optional(),
  sede_id: nullableId, sede: z.string().trim().nullable().optional(),
  modalidad_id: nullableId, modalidad: z.string().trim().nullable().optional(),
  cargo_operativo_id: nullableId, cargo_operativo: z.string().trim().nullable().optional(),
  ubicacion_laboral_id: nullableId, ubicacion_laboral: z.string().trim().nullable().optional(),
  cobertura_asignacion_id: nullableId, categoria_id: nullableId,
  categoria: z.string().trim().nullable().optional(), condicion_economica_id: nullableId,
  tarifa_config_id: nullableId
}).passthrough();

export const listCambiosOperativosSchema = z.object({
  periodo_id: id,
  vinculacion_id: id.optional(),
  activo: z.enum(['true', 'false']).transform((value) => value === 'true').optional()
});
export const cambioOperativoParamsSchema = z.object({ id });
export const resolverTramosParamsSchema = z.object({ periodo_id: id, vinculacion_id: id });
export const contextoFechaParamsSchema = resolverTramosParamsSchema.extend({ fecha: z.string().date() });
export const createCambioOperativoSchema = z.object({
  periodo_id: id, nomina_empleado_id: id, vinculacion_id: id,
  fecha_inicio_efectiva: z.string().date(), fecha_fin_efectiva: z.string().date().nullable().optional(),
  regla_fecha_efectiva: z.enum(['MISMO_DIA', 'DIA_SIGUIENTE']).default('MISMO_DIA'),
  tipo: z.enum(['CAMBIO_DE_MODALIDAD', 'CAMBIO_DE_SEDE', 'CAMBIO_COMBINADO']),
  contexto_anterior: contexto, contexto_nuevo: contexto,
  motivo: z.string().trim().min(3).max(1000)
});
export const updateCambioOperativoSchema = createCambioOperativoSchema.omit({ periodo_id: true, nomina_empleado_id: true, vinculacion_id: true }).partial().refine((v) => Object.keys(v).length > 0);
export type CreateCambioOperativoInput = z.infer<typeof createCambioOperativoSchema>;
export type UpdateCambioOperativoInput = z.infer<typeof updateCambioOperativoSchema>;
