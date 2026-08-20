import { z } from 'zod';

const numericIdSchema = z.coerce.number().int().positive();

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.coerce.number().int().positive().nullable());

export const requisitoDocumentalScopeSchema = z.enum(['PERSONA', 'VINCULACION']);

export const contratoRequisitoIdParamsSchema = z.object({
  id: numericIdSchema,
  requisitoId: numericIdSchema
});

export const contratoRequisitoListQuerySchema = z.object({
  activo: z
    .preprocess((value) => {
      if (value === '' || value === undefined || value === null) {
        return undefined;
      }

      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
      }

      return value;
    }, z.boolean().optional())
    .optional(),
  contrato_cargo_id: nullableNumericIdSchema.optional(),
  tipo_vinculacion_id: nullableNumericIdSchema.optional()
});

export const createContratoRequisitoDocumentalSchema = z.object({
  tipo_documento_id: numericIdSchema,
  ambito_documental: requisitoDocumentalScopeSchema,
  obligatorio: z.boolean().optional().default(true),
  contrato_cargo_id: nullableNumericIdSchema.optional().default(null),
  tipo_vinculacion_id: nullableNumericIdSchema.optional().default(null),
  requiere_fecha_expedicion: z.boolean().optional().default(false),
  requiere_fecha_vencimiento: z.boolean().optional().default(false),
  vigencia_meses: z
    .preprocess((value) => {
      if (value === '' || value === undefined || value === null) {
        return null;
      }

      return value;
    }, z.coerce.number().int().positive().nullable())
    .optional()
    .default(null),
  activo: z.boolean().optional().default(true)
});

export const updateContratoRequisitoDocumentalSchema = createContratoRequisitoDocumentalSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field must be provided for update');

export const toggleContratoRequisitoDocumentalSchema = z.object({
  activo: z.boolean()
});

export type ContratoRequisitoIdParams = z.infer<typeof contratoRequisitoIdParamsSchema>;
export type ContratoRequisitoListQuery = z.infer<typeof contratoRequisitoListQuerySchema>;
export type CreateContratoRequisitoDocumentalInput = z.infer<
  typeof createContratoRequisitoDocumentalSchema
>;
export type UpdateContratoRequisitoDocumentalInput = z.infer<
  typeof updateContratoRequisitoDocumentalSchema
>;
export type ToggleContratoRequisitoDocumentalInput = z.infer<
  typeof toggleContratoRequisitoDocumentalSchema
>;
