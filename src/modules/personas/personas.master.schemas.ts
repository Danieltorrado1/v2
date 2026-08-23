import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const positiveIntegerSchema = z.coerce.number().int().positive();

const nullablePositiveIntegerSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, positiveIntegerSchema.nullable());

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

export const cuentaBancariaEstadoSchema = z.enum([
  'PENDIENTE',
  'VERIFICADA',
  'RECHAZADA',
  'INACTIVA'
]);

export const cuentaBancariaTipoCuentaSchema = z.enum([
  'AHORROS',
  'CORRIENTE',
  'OTRA'
]);

export const personaHistorialQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const createPersonaCuentaBancariaSchema = z.object({
  entidad_bancaria: trimmedStringSchema,
  tipo_cuenta: cuentaBancariaTipoCuentaSchema,
  numero_cuenta: trimmedStringSchema,
  titular: trimmedStringSchema.default('PERSONA'),
  nombre_titular: nullableTrimmedString.optional().default(null),
  documento_titular: nullableTrimmedString.optional().default(null),
  estado: cuentaBancariaEstadoSchema.optional().default('PENDIENTE'),
  fecha_verificacion: nullableDateSchema.optional().default(null),
  observaciones: nullableTrimmedString.optional().default(null),
  soporte_documento_persona_id: nullablePositiveIntegerSchema.optional().default(null),
  vigencia_desde: nullableDateSchema.optional().default(null),
  motivo_cambio: trimmedStringSchema,
  marcar_como_vigente: nullableBooleanSchema.optional().default(true)
});

export const updatePersonaCuentaBancariaSchema = z
  .object({
    entidad_bancaria: trimmedStringSchema.optional(),
    tipo_cuenta: cuentaBancariaTipoCuentaSchema.optional(),
    numero_cuenta: trimmedStringSchema.optional(),
    titular: trimmedStringSchema.optional(),
    nombre_titular: nullableTrimmedString.optional(),
    documento_titular: nullableTrimmedString.optional(),
    estado: cuentaBancariaEstadoSchema.optional(),
    fecha_verificacion: nullableDateSchema.optional(),
    observaciones: nullableTrimmedString.optional(),
    soporte_documento_persona_id: nullablePositiveIntegerSchema.optional(),
    vigencia_desde: nullableDateSchema.optional(),
    vigencia_hasta: nullableDateSchema.optional(),
    es_vigente: nullableBooleanSchema.optional(),
    motivo_cambio: trimmedStringSchema
  })
  .refine(
    (data) => Object.keys(data).filter((key) => key !== 'motivo_cambio').length > 0,
    'At least one field must be provided for update'
  );

export const personaCuentaBancariaIdParamSchema = z.object({
  cuenta_bancaria_id: positiveIntegerSchema,
  id: z.coerce.number().int().positive()
});

export const personalExportScopeSchema = z.enum(['TODOS', 'FILTRADOS', 'SELECCIONADOS']);
export const personalExportFormatSchema = z.enum(['csv']);

export const personalExportTemplatePayloadSchema = z.object({
  nombre: trimmedStringSchema,
  campos: z.array(trimmedStringSchema).min(1),
  orden: z.array(trimmedStringSchema).min(1),
  formato: personalExportFormatSchema.default('csv')
});

export const personalExportGenerateSchema = z.object({
  scope: personalExportScopeSchema,
  formato: personalExportFormatSchema.default('csv'),
  contrato_id: positiveIntegerSchema,
  fecha: z.string().date().optional(),
  contrato_cargo_id: nullablePositiveIntegerSchema.optional(),
  municipio_id: nullablePositiveIntegerSchema.optional(),
  institucion_id: nullablePositiveIntegerSchema.optional(),
  sede_id: nullablePositiveIntegerSchema.optional(),
  modalidad_id: nullablePositiveIntegerSchema.optional(),
  ubicacion_laboral_id: nullablePositiveIntegerSchema.optional(),
  cobertura: z.enum(['SI', 'NO', 'RETIRADA']).optional(),
  licitacion: z.enum(['PRESENTADA', 'NO_PRESENTADA']).optional(),
  estado_vinculacion: z.enum(['ACTIVA', 'RETIRADA', 'SUSPENDIDA']).optional(),
  search: nullableTrimmedString.optional(),
  fields: z.array(trimmedStringSchema).min(1),
  selected_vinculacion_ids: z.array(positiveIntegerSchema).optional().default([])
});

export type CuentaBancariaEstado = z.infer<typeof cuentaBancariaEstadoSchema>;
export type CuentaBancariaTipoCuenta = z.infer<typeof cuentaBancariaTipoCuentaSchema>;
export type PersonaHistorialQuery = z.infer<typeof personaHistorialQuerySchema>;
export type CreatePersonaCuentaBancariaInput = z.infer<typeof createPersonaCuentaBancariaSchema>;
export type UpdatePersonaCuentaBancariaInput = z.infer<typeof updatePersonaCuentaBancariaSchema>;
export type PersonaCuentaBancariaIdParams = z.infer<typeof personaCuentaBancariaIdParamSchema>;
export type PersonalExportTemplatePayload = z.infer<typeof personalExportTemplatePayloadSchema>;
export type PersonalExportGenerateInput = z.infer<typeof personalExportGenerateSchema>;
