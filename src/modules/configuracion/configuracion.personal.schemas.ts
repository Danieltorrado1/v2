import { z } from 'zod';

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

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.coerce.number().int().positive().nullable());

export const configuracionContratoParamSchema = z.object({
  contratoId: z.coerce.number().int().positive()
});

export const configuracionPersonalEntityIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const configuracionPersonalListQuerySchema = z.object({
  activo: z.coerce.boolean().optional()
});

export const createContratoUbicacionLaboralSchema = z.object({
  nombre_ubicacion: z.string().trim().min(1),
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateContratoUbicacionLaboralSchema = z
  .object({
    nombre_ubicacion: z.string().trim().min(1).optional(),
    descripcion: nullableTrimmedStringSchema.optional(),
    activo: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const createContratoPerfilLicitacionSchema = z.object({
  codigo_perfil: z.string().trim().min(1).max(80),
  nombre_perfil: z.string().trim().min(1),
  cantidad_requerida: z.coerce.number().int().min(0),
  vigencia_desde: z.string().date(),
  vigencia_hasta: nullableDateSchema.optional().default(null),
  contrato_cargo_equivalente_id: nullableNumericIdSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const updateContratoPerfilLicitacionSchema = z
  .object({
    codigo_perfil: z.string().trim().min(1).max(80).optional(),
    nombre_perfil: z.string().trim().min(1).optional(),
    cantidad_requerida: z.coerce.number().int().min(0).optional(),
    vigencia_desde: z.string().date().optional(),
    vigencia_hasta: nullableDateSchema.optional(),
    contrato_cargo_equivalente_id: nullableNumericIdSchema.optional(),
    activo: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export type ConfiguracionPersonalListQuery = z.infer<typeof configuracionPersonalListQuerySchema>;
export type CreateContratoUbicacionLaboralInput = z.infer<typeof createContratoUbicacionLaboralSchema>;
export type UpdateContratoUbicacionLaboralInput = z.infer<typeof updateContratoUbicacionLaboralSchema>;
export type CreateContratoPerfilLicitacionInput = z.infer<typeof createContratoPerfilLicitacionSchema>;
export type UpdateContratoPerfilLicitacionInput = z.infer<typeof updateContratoPerfilLicitacionSchema>;
