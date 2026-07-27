import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);

const optionalTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().trim().min(1).optional());

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().trim().min(1).nullable());

const optionalBooleanQuerySchema = z.preprocess((value) => {
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

const optionalNumericIdQuerySchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.coerce.number().int().positive().optional());

const positiveIntegerSchema = z.coerce.number().int().positive();

const paginatedQueryShape = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
};

export const configuracionEntityIdParamSchema = z
  .object({
    id: positiveIntegerSchema
  })
  .strict();

export const configuracionCatalogListQuerySchema = z
  .object({
    activo: optionalBooleanQuerySchema,
    search: optionalTrimmedStringSchema,
    ...paginatedQueryShape
  })
  .strict();

export const configuracionMunicipiosListQuerySchema = z
  .object({
    departamento_id: optionalNumericIdQuerySchema,
    search: optionalTrimmedStringSchema,
    ...paginatedQueryShape
  })
  .strict();

export const configuracionEmpresasListQuerySchema = z
  .object({
    activo: optionalBooleanQuerySchema,
    search: optionalTrimmedStringSchema,
    ...paginatedQueryShape
  })
  .strict();

export const configuracionContratosListQuerySchema = z
  .object({
    activo: optionalBooleanQuerySchema,
    empresa_id: optionalNumericIdQuerySchema,
    search: optionalTrimmedStringSchema,
    ...paginatedQueryShape
  })
  .strict();

export const configuracionCargosListQuerySchema = z
  .object({
    activo: optionalBooleanQuerySchema,
    contrato_id: optionalNumericIdQuerySchema,
    search: optionalTrimmedStringSchema,
    ...paginatedQueryShape
  })
  .strict();

export const configuracionToggleEstadoSchema = z
  .object({
    activo: z.boolean(),
    observacion: nullableTrimmedStringSchema.optional().default(null)
  })
  .strict();

export const createEmpresaSchema = z
  .object({
    tipo_empresa: trimmedStringSchema.max(120),
    nombre_empresa: trimmedStringSchema.max(200),
    nit: trimmedStringSchema.max(40),
    representante_legal: nullableTrimmedStringSchema.optional().default(null),
    documento_representante: nullableTrimmedStringSchema.optional().default(null),
    telefono: nullableTrimmedStringSchema.optional().default(null),
    correo: z.email().trim().toLowerCase().nullable().optional().default(null),
    direccion: nullableTrimmedStringSchema.optional().default(null),
    ciudad: nullableTrimmedStringSchema.optional().default(null),
    departamento: nullableTrimmedStringSchema.optional().default(null)
  })
  .strict();

export const updateEmpresaSchema = z
  .object({
    tipo_empresa: trimmedStringSchema.max(120).optional(),
    nombre_empresa: trimmedStringSchema.max(200).optional(),
    nit: trimmedStringSchema.max(40).optional(),
    representante_legal: nullableTrimmedStringSchema.optional(),
    documento_representante: nullableTrimmedStringSchema.optional(),
    telefono: nullableTrimmedStringSchema.optional(),
    correo: z.email().trim().toLowerCase().nullable().optional(),
    direccion: nullableTrimmedStringSchema.optional(),
    ciudad: nullableTrimmedStringSchema.optional(),
    departamento: nullableTrimmedStringSchema.optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const createContratoSchema = z
  .object({
    empresa_id: positiveIntegerSchema,
    numero_contrato: trimmedStringSchema.max(220),
    numero_licitacion: nullableTrimmedStringSchema.optional().default(null),
    entidad_contratante: trimmedStringSchema.max(220),
    fecha_inicio: z.string().date(),
    fecha_finalizacion: z.string().date(),
    objeto_contractual: nullableTrimmedStringSchema.optional().default(null),
    aplica_cobertura: z.boolean().optional().default(false)
  })
  .strict();

export const updateContratoSchema = z
  .object({
    empresa_id: positiveIntegerSchema.optional(),
    numero_contrato: trimmedStringSchema.max(220).optional(),
    numero_licitacion: nullableTrimmedStringSchema.optional(),
    entidad_contratante: trimmedStringSchema.max(220).optional(),
    fecha_inicio: z.string().date().optional(),
    fecha_finalizacion: z.string().date().optional(),
    objeto_contractual: nullableTrimmedStringSchema.optional(),
    aplica_cobertura: z.boolean().optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export const createContratoCargoSchema = z
  .object({
    contrato_id: positiveIntegerSchema,
    nombre_cargo: trimmedStringSchema.max(220),
    cantidad_requerida: z.coerce.number().int().positive().nullable().optional().default(null),
    aplica_cobertura: z.boolean().optional().default(false)
  })
  .strict();

export const updateContratoCargoSchema = z
  .object({
    contrato_id: positiveIntegerSchema.optional(),
    nombre_cargo: trimmedStringSchema.max(220).optional(),
    cantidad_requerida: z.coerce.number().int().positive().nullable().optional(),
    aplica_cobertura: z.boolean().optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, 'At least one field must be provided for update');

export type ConfiguracionEntityIdParams = z.infer<typeof configuracionEntityIdParamSchema>;
export type ConfiguracionCatalogListQuery = z.infer<typeof configuracionCatalogListQuerySchema>;
export type ConfiguracionMunicipiosListQuery = z.infer<typeof configuracionMunicipiosListQuerySchema>;
export type ConfiguracionEmpresasListQuery = z.infer<typeof configuracionEmpresasListQuerySchema>;
export type ConfiguracionContratosListQuery = z.infer<typeof configuracionContratosListQuerySchema>;
export type ConfiguracionCargosListQuery = z.infer<typeof configuracionCargosListQuerySchema>;
export type ConfiguracionToggleEstadoInput = z.infer<typeof configuracionToggleEstadoSchema>;
export type CreateEmpresaInput = z.infer<typeof createEmpresaSchema>;
export type UpdateEmpresaInput = z.infer<typeof updateEmpresaSchema>;
export type CreateContratoInput = z.infer<typeof createContratoSchema>;
export type UpdateContratoInput = z.infer<typeof updateContratoSchema>;
export type CreateContratoCargoInput = z.infer<typeof createContratoCargoSchema>;
export type UpdateContratoCargoInput = z.infer<typeof updateContratoCargoSchema>;
