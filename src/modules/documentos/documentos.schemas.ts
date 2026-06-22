import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);

const numericIdSchema = z.union([z.number().int(), z.string().trim().regex(/^\d+$/)]).transform((value) =>
  Number(value)
);

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

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
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
}, z.boolean().optional());

export const personaIdParamSchema = z.object({
  persona_id: trimmedStringSchema
});

export const personaIdNumericParamSchema = z.object({
  personaId: numericIdSchema
});

export const vinculacionIdParamSchema = z.object({
  vinculacion_id: trimmedStringSchema
});

export const documentoIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const testDocumentoPersonaSchema = z
  .object({
    persona_id: numericIdSchema,
    tipo_documento_id: numericIdSchema,
    fecha_expedicion: z.string().date(),
    fecha_vencimiento: z.string().date(),
    nombre_original: trimmedStringSchema,
    mime_type: trimmedStringSchema,
    tamano_bytes: z.union([z.number().int().nonnegative(), z.string().trim().regex(/^\d+$/)]).transform((value) =>
      Number(value)
    )
  })
  .refine(
    (data) => data.fecha_expedicion <= data.fecha_vencimiento,
    {
      message: 'fecha_vencimiento must be greater than or equal to fecha_expedicion',
      path: ['fecha_vencimiento']
    }
  );

export const uploadDocumentoSchema = z.object({
  tipo_documento_id: trimmedStringSchema,
  fecha_expedicion: nullableDateSchema.optional().default(null),
  fecha_vencimiento: nullableDateSchema.optional().default(null)
}).refine(
  (data) => {
    if (!data.fecha_expedicion || !data.fecha_vencimiento) {
      return true;
    }

    return data.fecha_expedicion <= data.fecha_vencimiento;
  },
  {
    message: 'fecha_vencimiento must be greater than or equal to fecha_expedicion',
    path: ['fecha_vencimiento']
  }
);

export const updateDocumentoSchema = z.object({
  tipo_documento_id: trimmedStringSchema.optional(),
  fecha_expedicion: nullableDateSchema.optional(),
  fecha_vencimiento: nullableDateSchema.optional(),
  activo: nullableBooleanSchema
}).refine(
  (data) => Object.keys(data).length > 0,
  'At least one field must be provided for update'
).refine(
  (data) => {
    if (!data.fecha_expedicion || !data.fecha_vencimiento) {
      return true;
    }

    return data.fecha_expedicion <= data.fecha_vencimiento;
  },
  {
    message: 'fecha_vencimiento must be greater than or equal to fecha_expedicion',
    path: ['fecha_vencimiento']
  }
);

export type PersonaIdParams = z.infer<typeof personaIdParamSchema>;
export type PersonaIdNumericParams = z.infer<typeof personaIdNumericParamSchema>;
export type VinculacionIdParams = z.infer<typeof vinculacionIdParamSchema>;
export type DocumentoIdParams = z.infer<typeof documentoIdParamSchema>;
export type TestDocumentoPersonaInput = z.infer<typeof testDocumentoPersonaSchema>;
export type UploadDocumentoInput = z.infer<typeof uploadDocumentoSchema>;
export type UpdateDocumentoInput = z.infer<typeof updateDocumentoSchema>;
