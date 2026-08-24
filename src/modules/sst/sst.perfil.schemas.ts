import { z } from 'zod';

export const sstPerfilOrigenSchema = z.enum([
  'FORMULARIO_DIGITAL',
  'FORMULARIO_FISICO',
  'IMPORTACION',
  'EDICION_MANUAL',
  'PORTAL_COLABORADOR'
]);

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const nullableIntegerSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, z.union([z.number().int(), z.string().trim().regex(/^-?\d+$/)]).transform((value) => Number(value)).nullable());

const nullableBooleanSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (['true', '1', 'si', 'yes'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no'].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean().nullable());

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
}, z.union([z.number().int(), z.string().trim().regex(/^\d+$/)]).transform((value) => Number(value)).nullable());

export const personaSstPerfilUpdateSchema = z
  .object({
    vinculacion_id: nullableNumericIdSchema.optional(),
    fecha_caracterizacion: nullableDateSchema.optional(),
    origen: sstPerfilOrigenSchema.optional(),
    nacionalidad: nullableTrimmedString.optional(),
    estrato_socioeconomico: nullableTrimmedString.optional(),
    tipo_vivienda: nullableTrimmedString.optional(),
    grupo_etnico: nullableTrimmedString.optional(),
    nivel_escolaridad: nullableTrimmedString.optional(),
    profesion_ocupacion: nullableTrimmedString.optional(),
    personas_dependen_economicamente: nullableIntegerSchema.optional(),
    cabeza_familia: nullableBooleanSchema.optional(),
    total_hijos: nullableIntegerSchema.optional(),
    hijos_viven_con_usted: nullableIntegerSchema.optional(),
    hijos_menores_edad: nullableIntegerSchema.optional(),
    hijos_mayores_edad: nullableIntegerSchema.optional(),
    tipo_sangre_rh: nullableTrimmedString.optional(),
    tiene_discapacidad: nullableBooleanSchema.optional(),
    tipo_discapacidad: nullableTrimmedString.optional(),
    redes_apoyo_social: nullableTrimmedString.optional(),
    presenta_alergias: nullableTrimmedString.optional(),
    medicamentos_permanentes: nullableTrimmedString.optional(),
    enfermedad: nullableTrimmedString.optional(),
    autorizacion_tratamiento_datos: nullableBooleanSchema.optional(),
    observaciones: nullableTrimmedString.optional(),
    motivo_cambio: z.string().trim().min(1)
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'motivo_cambio'), {
    message: 'At least one SST profile field must be provided'
  });

export type PersonaSstPerfilUpdateInput = z.infer<typeof personaSstPerfilUpdateSchema>;
