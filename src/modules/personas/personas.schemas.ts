import { z } from 'zod';

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const requiredTrimmedString = z.string().trim().min(1);

const nullableEmailSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.email().nullable());

const numericIdStringOrNumberSchema = z.union([
  z.number().int(),
  z.string().trim().regex(/^\d+$/)
]);

const numericStringOrNumberSchema = z.union([
  z.number(),
  z.string().trim().regex(/^-?\d+(\.\d+)?$/)
]);

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, numericIdStringOrNumberSchema.transform((value) => Number(value)).nullable());

const nullableNumericSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.union([z.number(), z.string().trim().regex(/^-?\d+(\.\d+)?$/)]).transform((value) => Number(value)).nullable());

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      return true;
    }

    if (normalizedValue === 'false') {
      return false;
    }
  }

  return value;
}, z.boolean().optional());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

export const personaIdParamSchema = z.object({
  id: requiredTrimmedString
});

export const personaDocumentoParamSchema = z.object({
  numero_documento: requiredTrimmedString
});

export const listPersonasQuerySchema = z.object({
  search: nullableTrimmedString.optional(),
  numero_documento: nullableTrimmedString.optional(),
  municipio_residencia_id: nullableNumericIdSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const createPersonaSchema = z.object({
  tipo_documento_id: numericIdStringOrNumberSchema.transform((value) => Number(value)),
  numero_documento: requiredTrimmedString,
  primer_nombre: requiredTrimmedString,
  segundo_nombre: nullableTrimmedString.optional().default(null),
  primer_apellido: requiredTrimmedString,
  segundo_apellido: nullableTrimmedString.optional().default(null),
  fecha_nacimiento: nullableDateSchema.optional().default(null),
  fecha_expedicion_documento: nullableDateSchema.optional().default(null),
  municipio_nacimiento_id: nullableNumericIdSchema.optional().default(null),
  municipio_expedicion_id: nullableNumericIdSchema.optional().default(null),
  municipio_residencia_id: nullableNumericIdSchema.optional().default(null),
  sexo_id: nullableNumericIdSchema.optional().default(null),
  estado_civil_id: nullableNumericIdSchema.optional().default(null),
  tipo_sangre_id: nullableNumericIdSchema.optional().default(null),
  estatura: nullableNumericSchema.optional().default(null),
  telefono: nullableTrimmedString.optional().default(null),
  correo: nullableEmailSchema.optional().default(null),
  direccion: nullableTrimmedString.optional().default(null),
  barrio: nullableTrimmedString.optional().default(null),
  zona_id: nullableNumericIdSchema.optional().default(null),
  pais_nacimiento: nullableTrimmedString.optional().default('COLOMBIA'),
  nacimiento_extranjero: nullableBooleanSchema.optional().default(false),
  ciudad_nacimiento_extranjero: nullableTrimmedString.optional().default(null)
});

export const updatePersonaSchema = z
  .object({
    tipo_documento_id: numericIdStringOrNumberSchema.transform((value) => Number(value)).optional(),
    numero_documento: requiredTrimmedString.optional(),
    primer_nombre: requiredTrimmedString.optional(),
    segundo_nombre: nullableTrimmedString.optional(),
    primer_apellido: requiredTrimmedString.optional(),
    segundo_apellido: nullableTrimmedString.optional(),
    fecha_nacimiento: nullableDateSchema.optional(),
    fecha_expedicion_documento: nullableDateSchema.optional(),
    municipio_nacimiento_id: nullableNumericIdSchema.optional(),
    municipio_expedicion_id: nullableNumericIdSchema.optional(),
    municipio_residencia_id: nullableNumericIdSchema.optional(),
    sexo_id: nullableNumericIdSchema.optional(),
    estado_civil_id: nullableNumericIdSchema.optional(),
    tipo_sangre_id: nullableNumericIdSchema.optional(),
    estatura: nullableNumericSchema.optional(),
    telefono: nullableTrimmedString.optional(),
    correo: nullableEmailSchema.optional(),
    direccion: nullableTrimmedString.optional(),
    barrio: nullableTrimmedString.optional(),
    zona_id: nullableNumericIdSchema.optional(),
    pais_nacimiento: nullableTrimmedString.optional(),
    nacimiento_extranjero: nullableBooleanSchema.optional(),
    ciudad_nacimiento_extranjero: nullableTrimmedString.optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

export type PersonaIdParams = z.infer<typeof personaIdParamSchema>;
export type PersonaDocumentoParams = z.infer<typeof personaDocumentoParamSchema>;
export type ListPersonasQuery = z.infer<typeof listPersonasQuerySchema>;
export type CreatePersonaInput = z.infer<typeof createPersonaSchema>;
export type UpdatePersonaInput = z.infer<typeof updatePersonaSchema>;
