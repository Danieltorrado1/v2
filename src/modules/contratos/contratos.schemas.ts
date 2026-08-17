import { z } from 'zod';

import {
  CONTRATO_DOCUMENTO_REVISION_ESTADOS,
  CONTRATO_ESTADOS,
  CONTRATO_EVENTOS
} from './contratos.domain';

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().trim().nullable());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}, z.string().date().nullable());

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

const positiveIntegerSchema = z.coerce.number().int().positive();

const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
};

const contratoEstadoSchema = z.enum(CONTRATO_ESTADOS);
const contratoEventoTipoSchema = z.enum(CONTRATO_EVENTOS);
const documentoRevisionEstadoSchema = z.enum(CONTRATO_DOCUMENTO_REVISION_ESTADOS);
export const contratoDocumentoWorkflowEstadoSchema = z.enum(['EN_REVISION', 'APROBADO']);

export const contratoIdParamSchema = z.object({
  id: positiveIntegerSchema
}).strict();

export const contratoEventoParamSchema = z.object({
  id: positiveIntegerSchema,
  eventoId: positiveIntegerSchema
}).strict();

export const contratoDocumentoParamSchema = z.object({
  id: positiveIntegerSchema,
  documentoId: positiveIntegerSchema
}).strict();

export const contratoExcepcionParamSchema = z.object({
  id: positiveIntegerSchema,
  excepcionId: positiveIntegerSchema
}).strict();

export const contratoListQuerySchema = z.object({
  search: z.string().trim().optional(),
  empresa_id: z.coerce.number().int().positive().optional(),
  estado_contractual: contratoEstadoSchema.optional(),
  activo: optionalBooleanQuerySchema,
  ...paginationSchema
}).strict();

export const contratoEstadoPatchSchema = z.object({
  estado_contractual: contratoEstadoSchema,
  observacion: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const contratoEventoListQuerySchema = z.object({
  ...paginationSchema,
  tipo_evento: contratoEventoTipoSchema.optional()
}).strict();

export const contratoEventContractChangesSchema = z.object({
  fecha_final_estimada: nullableDateSchema.optional(),
  fecha_final_real: nullableDateSchema.optional(),
  observaciones: nullableTrimmedStringSchema.optional(),
  estado_contractual: contratoEstadoSchema.optional()
}).strict();

export const createContratoEventoSchema = z.object({
  tipo_evento: contratoEventoTipoSchema,
  fecha_evento: z.string().date(),
  fecha_efecto_desde: nullableDateSchema.optional().default(null),
  fecha_efecto_hasta: nullableDateSchema.optional().default(null),
  descripcion: nullableTrimmedStringSchema.optional().default(null),
  motivo: nullableTrimmedStringSchema.optional().default(null),
  documento_soporte_id: positiveIntegerSchema.optional(),
  cambios_contrato: contratoEventContractChangesSchema.optional().default({})
}).strict();

export const anularContratoEventoSchema = z.object({
  motivo: trimmedStringSchema.max(500)
}).strict();

export const contratoDocumentoUploadSchema = z.object({
  requisito_id: positiveIntegerSchema.optional(),
  tipo_documento_id: z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String),
  categoria: z.enum([
    'CREACION_EMPRESA_JURIDICA',
    'INICIO_CONTRATO',
    'EJECUCION',
    'CIERRE'
  ]).optional().default('EJECUCION'),
  fecha_expedicion: nullableDateSchema.optional().default(null),
  fecha_vencimiento: nullableDateSchema.optional().default(null),
  vigencia_dias_configurada: z.coerce.number().int().positive().nullable().optional().default(null),
  observaciones: nullableTrimmedStringSchema.optional().default(null)
}).strict().refine((data) => {
  if (data.fecha_expedicion && data.fecha_vencimiento) {
    return data.fecha_expedicion <= data.fecha_vencimiento;
  }

  return true;
}, {
  message: 'fecha_vencimiento must be greater than or equal to fecha_expedicion',
  path: ['fecha_vencimiento']
});

export const contratoDocumentoRevisionSchema = z.object({
  estado: contratoDocumentoWorkflowEstadoSchema.optional().default('APROBADO'),
  observacion: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const contratoDocumentoDevolverSchema = z.object({
  motivo: trimmedStringSchema.max(500),
  observacion: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const contratoDocumentoAnularSchema = z.object({
  motivo: trimmedStringSchema.max(500)
}).strict();

export const createContratoExcepcionSchema = z.object({
  requisito_id: positiveIntegerSchema.optional(),
  documento_id: positiveIntegerSchema.optional(),
  soporte_documento_id: positiveIntegerSchema.optional(),
  motivo: trimmedStringSchema.max(1000),
  fecha_limite_regularizacion: z.string().date(),
  observaciones: nullableTrimmedStringSchema.optional().default(null)
}).strict().refine((data) => data.requisito_id !== undefined || data.documento_id !== undefined, {
  message: 'Se requiere requisito_id o documento_id',
  path: ['requisito_id']
});

export const regularizarContratoExcepcionSchema = z.object({
  observaciones: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const revocarContratoExcepcionSchema = z.object({
  motivo: trimmedStringSchema.max(500),
  observaciones: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export type ContratoIdParams = z.infer<typeof contratoIdParamSchema>;
export type ContratoEventoParams = z.infer<typeof contratoEventoParamSchema>;
export type ContratoDocumentoParams = z.infer<typeof contratoDocumentoParamSchema>;
export type ContratoExcepcionParams = z.infer<typeof contratoExcepcionParamSchema>;
export type ContratoListQuery = z.infer<typeof contratoListQuerySchema>;
export type ContratoEstadoPatchInput = z.infer<typeof contratoEstadoPatchSchema>;
export type ContratoEventoListQuery = z.infer<typeof contratoEventoListQuerySchema>;
export type CreateContratoEventoInput = z.infer<typeof createContratoEventoSchema>;
export type AnularContratoEventoInput = z.infer<typeof anularContratoEventoSchema>;
export type ContratoDocumentoUploadInput = z.infer<typeof contratoDocumentoUploadSchema>;
export type ContratoDocumentoRevisionInput = z.infer<typeof contratoDocumentoRevisionSchema>;
export type ContratoDocumentoDevolverInput = z.infer<typeof contratoDocumentoDevolverSchema>;
export type ContratoDocumentoAnularInput = z.infer<typeof contratoDocumentoAnularSchema>;
export type CreateContratoExcepcionInput = z.infer<typeof createContratoExcepcionSchema>;
export type RegularizarContratoExcepcionInput = z.infer<typeof regularizarContratoExcepcionSchema>;
export type RevocarContratoExcepcionInput = z.infer<typeof revocarContratoExcepcionSchema>;
export type ContratoDocumentoRevisionEstado = z.infer<typeof documentoRevisionEstadoSchema>;
export type ContratoDocumentoWorkflowEstado = z.infer<typeof contratoDocumentoWorkflowEstadoSchema>;
