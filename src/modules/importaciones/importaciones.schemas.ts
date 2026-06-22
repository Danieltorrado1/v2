import { z } from 'zod';

import { vinculacionEstadoSchema } from '../vinculaciones/vinculaciones.schemas';

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const nullableDateStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

const nullableEmailSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.email().nullable());

const nullablePositiveNumberSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.coerce.number().positive().nullable());

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (normalized === 'true' || normalized === 'si' || normalized === 'sí' || normalized === '1') {
      return true;
    }

    if (normalized === 'false' || normalized === 'no' || normalized === '0') {
      return false;
    }
  }

  return value;
}, z.boolean().nullable());

export const importacionLoteEstadoSchema = z.enum([
  'PENDIENTE_CONFIRMACION',
  'CON_ERRORES',
  'CONFIRMADO',
  'CANCELADO'
]);

export const importacionLoteIdParamSchema = z.object({
  id: trimmedStringSchema
});

export const listImportacionLotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  estado: importacionLoteEstadoSchema.optional()
});

export const importPersonaPayloadSchema = z.object({
  tipo_documento_id: trimmedStringSchema,
  numero_documento: trimmedStringSchema,
  primer_nombre: trimmedStringSchema,
  segundo_nombre: nullableTrimmedStringSchema.optional().default(null),
  primer_apellido: trimmedStringSchema,
  segundo_apellido: nullableTrimmedStringSchema.optional().default(null),
  fecha_nacimiento: nullableDateStringSchema.optional().default(null),
  fecha_expedicion_documento: nullableDateStringSchema.optional().default(null),
  municipio_nacimiento_id: nullableTrimmedStringSchema.optional().default(null),
  municipio_expedicion_id: nullableTrimmedStringSchema.optional().default(null),
  municipio_residencia_id: nullableTrimmedStringSchema.optional().default(null),
  sexo_id: nullableTrimmedStringSchema.optional().default(null),
  estado_civil_id: nullableTrimmedStringSchema.optional().default(null),
  tipo_sangre_id: nullableTrimmedStringSchema.optional().default(null),
  estatura: nullablePositiveNumberSchema.optional().default(null),
  telefono: nullableTrimmedStringSchema.optional().default(null),
  correo: nullableEmailSchema.optional().default(null),
  direccion: nullableTrimmedStringSchema.optional().default(null),
  barrio: nullableTrimmedStringSchema.optional().default(null),
  zona_id: nullableTrimmedStringSchema.optional().default(null),
  activo: nullableBooleanSchema.optional().default(true)
});

export const importVinculacionPayloadSchema = z.object({
  empresa_id: trimmedStringSchema,
  contrato_id: trimmedStringSchema,
  contrato_cargo_id: trimmedStringSchema,
  fecha_inicio: z.string().date(),
  fecha_fin: nullableDateStringSchema.optional().default(null),
  estado: vinculacionEstadoSchema.optional().default('ACTIVA'),
  observaciones: nullableTrimmedStringSchema.optional().default(null)
});

export type ImportacionLoteEstado = z.infer<typeof importacionLoteEstadoSchema>;
export type ImportPersonaPayload = z.infer<typeof importPersonaPayloadSchema>;
export type ImportVinculacionPayload = z.infer<typeof importVinculacionPayloadSchema>;
export type ImportacionLoteIdParams = z.infer<typeof importacionLoteIdParamSchema>;
export type ListImportacionLotesQuery = z.infer<typeof listImportacionLotesQuerySchema>;
