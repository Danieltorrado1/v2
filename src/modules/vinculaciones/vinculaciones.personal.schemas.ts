import { z } from 'zod';

const nullableTrimmedString = z.preprocess((value) => {
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

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
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
}, z.boolean().nullable());

export const vinculacionPersonalIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const vinculacionAsignacionLaboralParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  asignacionId: z.coerce.number().int().positive()
});

export const vinculacionPresentacionLicitacionParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  presentacionId: z.coerce.number().int().positive()
});

export const updateAsignacionOperativaPersonalSchema = z.object({
  focalizacion_final_id: z.coerce.number().int().positive(),
  fecha_desde: z.string().date().optional(),
  observacion: nullableTrimmedString.optional().default(null)
}).strict();

export const contratoPersonalIdQuerySchema = z.object({
  contrato_id: z.coerce.number().int().positive()
});

export const createAsignacionLaboralSchema = z.object({
  ubicacion_laboral_id: z.coerce.number().int().positive(),
  vigencia_desde: z.string().date(),
  vigencia_hasta: nullableDateSchema.optional().default(null),
  estado: z.enum(['ACTIVA', 'FINALIZADA', 'ANULADA']).optional().default('ACTIVA'),
  origen: z.enum(['MANUAL', 'IMPORTACION', 'AJUSTE']).optional().default('MANUAL'),
  observacion: nullableTrimmedString.optional().default(null)
});

export const updateAsignacionLaboralSchema = z
  .object({
    ubicacion_laboral_id: z.coerce.number().int().positive().optional(),
    vigencia_desde: z.string().date().optional(),
    vigencia_hasta: nullableDateSchema.optional(),
    estado: z.enum(['ACTIVA', 'FINALIZADA', 'ANULADA']).optional(),
    observacion: nullableTrimmedString.optional()
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const createPresentacionLicitacionSchema = z.object({
  perfil_licitacion_id: z.coerce.number().int().positive(),
  vigencia_desde: z.string().date(),
  vigencia_hasta: nullableDateSchema.optional().default(null),
  estado: z.enum(['PRESENTADA', 'RETIRADA', 'REEMPLAZADA', 'ANULADA']).optional().default('PRESENTADA'),
  cumple_requisitos: nullableBooleanSchema.optional().default(null),
  observacion: nullableTrimmedString.optional().default(null)
});

export const updatePresentacionLicitacionSchema = z
  .object({
    perfil_licitacion_id: z.coerce.number().int().positive().optional(),
    vigencia_desde: z.string().date().optional(),
    vigencia_hasta: nullableDateSchema.optional(),
    estado: z.enum(['PRESENTADA', 'RETIRADA', 'REEMPLAZADA', 'ANULADA']).optional(),
    cumple_requisitos: nullableBooleanSchema.optional(),
    observacion: nullableTrimmedString.optional()
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export type CreateAsignacionLaboralInput = z.infer<typeof createAsignacionLaboralSchema>;
export type UpdateAsignacionLaboralInput = z.infer<typeof updateAsignacionLaboralSchema>;
export type CreatePresentacionLicitacionInput = z.infer<typeof createPresentacionLicitacionSchema>;
export type UpdatePresentacionLicitacionInput = z.infer<typeof updatePresentacionLicitacionSchema>;
export type UpdateAsignacionOperativaPersonalInput = z.infer<typeof updateAsignacionOperativaPersonalSchema>;
