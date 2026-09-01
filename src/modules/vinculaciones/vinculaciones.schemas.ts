import { z } from 'zod';

export const vinculacionEstadoSchema = z.enum(['ACTIVA', 'RETIRADA', 'SUSPENDIDA']);
export const METODOS_PAGO = [
  'COBERTURA',
  'ASISTENCIA',
  'CASO_ESPECIAL',
  'CATEGORIA',
  'OPS_CUENTA_COBRO',
  'OPS_VALOR_FIJO',
  'OPS_POR_PRODUCTO'
] as const;
export const metodoPagoSchema = z.enum(METODOS_PAGO);
export const OPS_METODOS_PAGO = [
  'OPS_CUENTA_COBRO',
  'OPS_VALOR_FIJO',
  'OPS_POR_PRODUCTO'
] as const;
export const opsMetodoPagoSchema = z.enum(OPS_METODOS_PAGO);

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedString = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const nullableMetodoPagoSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, metodoPagoSchema.nullable());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

const numericIdSchema = z.union([z.number().int(), z.string().trim().regex(/^\d+$/)]);

const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  return value;
}, numericIdSchema.transform((value) => Number(value)).nullable());

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

export const vinculacionIdParamSchema = z.object({
  id: z.coerce.number().int()
});

export const vinculacionPersonaParamSchema = z.object({
  persona_id: z.coerce.number().int()
});

export const listVinculacionesQuerySchema = z.object({
  persona_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_vinculacion_id: nullableNumericIdSchema.optional(),
  contrato_cargo_id: nullableNumericIdSchema.optional(),
  municipio_id: nullableNumericIdSchema.optional(),
  institucion_id: nullableNumericIdSchema.optional(),
  sede_id: nullableNumericIdSchema.optional(),
  modalidad_id: nullableNumericIdSchema.optional(),
  modalidad_codigo: nullableTrimmedString.optional(),
  ubicacion_laboral_id: nullableNumericIdSchema.optional(),
  cobertura: z.enum(["SI", "NO", "RETIRADA"]).optional(),
  licitacion: z.enum(["PRESENTADA", "NO_PRESENTADA"]).optional(),
  estado_vinculacion: vinculacionEstadoSchema.optional(),
  metodo_pago: metodoPagoSchema.optional(),
  fecha_inicio_desde: nullableDateSchema.optional(),
  fecha_inicio_hasta: nullableDateSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10)
});

export const listOpsVinculacionesQuerySchema = z.object({
  empresa_id: nullableNumericIdSchema.optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  tipo_vinculacion_id: nullableNumericIdSchema.optional(),
  contrato_cargo_id: nullableNumericIdSchema.optional(),
  estado_vinculacion: vinculacionEstadoSchema.optional(),
  metodo_pago: opsMetodoPagoSchema.optional(),
  search: nullableTrimmedString.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const listContractPersonalQuerySchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  contrato_cargo_id: nullableNumericIdSchema.optional(),
  municipio_id: nullableNumericIdSchema.optional(),
  institucion_id: nullableNumericIdSchema.optional(),
  sede_id: nullableNumericIdSchema.optional(),
  modalidad_id: nullableNumericIdSchema.optional(),
  modalidad_codigo: nullableTrimmedString.optional(),
  ubicacion_laboral_id: nullableNumericIdSchema.optional(),
  cobertura: z.enum(["SI", "NO", "RETIRADA"]).optional(),
  licitacion: z.enum(["PRESENTADA", "NO_PRESENTADA"]).optional(),
  estado_vinculacion: vinculacionEstadoSchema.optional(),
  gestor_usuario_id: nullableNumericIdSchema.optional(),
  sin_gestor: nullableBooleanSchema.optional(),
  search: nullableTrimmedString.optional(),
  fecha: z.string().date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const personalResumenQuerySchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  fecha: z.string().date().optional()
});

export const gestorAssignmentWorkspaceQuerySchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  gestor_usuario_id: nullableNumericIdSchema.optional(),
  municipio_id: nullableNumericIdSchema.optional(),
  search: nullableTrimmedString.optional(),
  fecha: z.string().date().optional()
});

export const gestorAssignmentModeSchema = z.enum(['SELECCION', 'REEMPLAZAR_MUNICIPIO']);
export const gestorMunicipioPersonalScopeSchema = z.enum(['PERSONAL_SELECCIONADO', 'TODO_MUNICIPIO']);

export const listGestorMunicipiosQuerySchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  gestor_usuario_id: nullableNumericIdSchema.optional(),
  fecha: z.string().date().optional()
});

export const saveGestorAssignmentsSchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  gestor_usuario_id: numericIdSchema.transform((value) => Number(value)),
  municipio_id: numericIdSchema.transform((value) => Number(value)),
  departamento_id: nullableNumericIdSchema.optional(),
  fecha: z.string().date().optional(),
  modo: gestorAssignmentModeSchema.optional().default('SELECCION'),
  vinculacion_ids: z
    .array(numericIdSchema.transform((value) => Number(value)))
    .max(5000)
    .default([]),
  observacion: nullableTrimmedString.optional().default(null)
});

export const createGestorMunicipioAssignmentSchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  gestor_usuario_id: numericIdSchema.transform((value) => Number(value)),
  municipio_id: numericIdSchema.transform((value) => Number(value)),
  departamento_id: nullableNumericIdSchema.optional(),
  vigencia_desde: z.string().date().optional(),
  alcance_personal: gestorMunicipioPersonalScopeSchema.optional().default('PERSONAL_SELECCIONADO'),
  observacion: nullableTrimmedString.optional().default(null)
});

export const closeGestorAssignmentSchema = z.object({
  vigencia_hasta: z.string().date(),
  observacion: nullableTrimmedString.optional().default(null)
});

export const gestorAssignmentIdParamSchema = z.object({
  id: z.coerce.number().int()
});

export const gestorPersonalHistoryQuerySchema = z.object({
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  vinculacion_id: numericIdSchema.transform((value) => Number(value)),
  fecha: z.string().date().optional()
});

export const createVinculacionSchema = z.object({
  persona_id: numericIdSchema.transform((value) => Number(value)),
  empresa_id: numericIdSchema.transform((value) => Number(value)),
  contrato_id: numericIdSchema.transform((value) => Number(value)),
  tipo_vinculacion_id: numericIdSchema.transform((value) => Number(value)),
  contrato_cargo_id: numericIdSchema.transform((value) => Number(value)),
  fecha_inicio: z.string().date(),
  fecha_fin: nullableDateSchema.optional().default(null),
  estado_vinculacion: vinculacionEstadoSchema.optional().default('ACTIVA'),
  cuenta_como_experiencia: nullableBooleanSchema.optional().default(true),
  metodo_pago: nullableMetodoPagoSchema.optional().default(null)
});

export const updateVinculacionSchema = z
  .object({
    persona_id: numericIdSchema.transform((value) => Number(value)).optional(),
    empresa_id: numericIdSchema.transform((value) => Number(value)).optional(),
    contrato_id: numericIdSchema.transform((value) => Number(value)).optional(),
    tipo_vinculacion_id: numericIdSchema.transform((value) => Number(value)).optional(),
    contrato_cargo_id: numericIdSchema.transform((value) => Number(value)).optional(),
    fecha_inicio: z.string().date().optional(),
    fecha_fin: nullableDateSchema.optional(),
    estado_vinculacion: vinculacionEstadoSchema.optional(),
    cuenta_como_experiencia: nullableBooleanSchema.optional(),
    metodo_pago: nullableMetodoPagoSchema.optional(),
    motivo_cambio: nullableTrimmedString.optional()
  })
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

export const retirarVinculacionSchema = z.object({
  fecha_retiro: z.string().date(),
  motivo_retiro: nullableTrimmedString.optional().default(null),
  observaciones: nullableTrimmedString.optional().default(null)
});

export const suspenderVinculacionSchema = z.object({
  fecha_suspension: z.string().date(),
  motivo_suspension: nullableTrimmedString.optional().default(null),
  observaciones: nullableTrimmedString.optional().default(null)
});

export const reactivarVinculacionSchema = z.object({
  fecha_reactivacion: z.string().date().optional(),
  observaciones: nullableTrimmedString.optional().default(null)
});

export type VinculacionEstado = z.infer<typeof vinculacionEstadoSchema>;
export type VinculacionIdParams = z.infer<typeof vinculacionIdParamSchema>;
export type VinculacionPersonaParams = z.infer<typeof vinculacionPersonaParamSchema>;
export type ListVinculacionesQuery = z.infer<typeof listVinculacionesQuerySchema>;
export type ListOpsVinculacionesQuery = z.infer<typeof listOpsVinculacionesQuerySchema>;
export type ListContractPersonalQuery = z.infer<typeof listContractPersonalQuerySchema>;
export type PersonalResumenQuery = z.infer<typeof personalResumenQuerySchema>;
export type GestorAssignmentWorkspaceQuery = z.infer<typeof gestorAssignmentWorkspaceQuerySchema>;
export type ListGestorMunicipiosQuery = z.infer<typeof listGestorMunicipiosQuerySchema>;
export type SaveGestorAssignmentsInput = z.infer<typeof saveGestorAssignmentsSchema>;
export type CreateGestorMunicipioAssignmentInput = z.infer<typeof createGestorMunicipioAssignmentSchema>;
export type CloseGestorAssignmentInput = z.infer<typeof closeGestorAssignmentSchema>;
export type GestorAssignmentIdParams = z.infer<typeof gestorAssignmentIdParamSchema>;
export type GestorPersonalHistoryQuery = z.infer<typeof gestorPersonalHistoryQuerySchema>;
export type CreateVinculacionInput = z.infer<typeof createVinculacionSchema>;
export type UpdateVinculacionInput = z.infer<typeof updateVinculacionSchema>;
export type RetirarVinculacionInput = z.infer<typeof retirarVinculacionSchema>;
export type SuspenderVinculacionInput = z.infer<typeof suspenderVinculacionSchema>;
export type ReactivarVinculacionInput = z.infer<typeof reactivarVinculacionSchema>;
export type GestorMunicipioPersonalScope = z.infer<typeof gestorMunicipioPersonalScopeSchema>;
