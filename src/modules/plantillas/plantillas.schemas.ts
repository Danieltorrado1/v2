import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const numericIdSchema = z.coerce.number().int().positive();

export const tipoPlantillaSchema = z.enum([
  'CONTRATO_LABORAL',
  'OPS',
  'OTROSI',
  'CERTIFICACION',
  'ACTA',
  'AUTORIZACION',
  'OTRO'
]);

export const plantillaIdParamSchema = z.object({
  id: numericIdSchema
});

export const vinculacionIdParamSchema = z.object({
  vinculacion_id: numericIdSchema
});

export const createPlantillaSchema = z.object({
  codigo: trimmedStringSchema,
  nombre: trimmedStringSchema,
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  tipo_plantilla: tipoPlantillaSchema,
  contenido_template: trimmedStringSchema,
  activo: z.boolean().optional().default(true)
});

export const updatePlantillaSchema = z
  .object({
    codigo: trimmedStringSchema.optional(),
    nombre: trimmedStringSchema.optional(),
    descripcion: nullableTrimmedStringSchema.optional(),
    tipo_plantilla: tipoPlantillaSchema.optional(),
    contenido_template: trimmedStringSchema.optional(),
    activo: z.boolean().optional()
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const generarPlantillaDocumentoSchema = z.object({
  tipo_documento_id: numericIdSchema.optional(),
  nombre_archivo: trimmedStringSchema.optional(),
  registrar_documento_vinculacion: z.boolean().optional().default(false)
});

export const previewPlantillaDocumentoSchema = z.object({}).strict();

export type TipoPlantilla = z.infer<typeof tipoPlantillaSchema>;
export type PlantillaIdParams = z.infer<typeof plantillaIdParamSchema>;
export type VinculacionIdParams = z.infer<typeof vinculacionIdParamSchema>;
export type CreatePlantillaInput = z.infer<typeof createPlantillaSchema>;
export type UpdatePlantillaInput = z.infer<typeof updatePlantillaSchema>;
export type GenerarPlantillaDocumentoInput = z.infer<typeof generarPlantillaDocumentoSchema>;
export type PreviewPlantillaDocumentoInput = z.infer<typeof previewPlantillaDocumentoSchema>;
