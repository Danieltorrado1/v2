import { z } from 'zod';

const trimmedStringSchema = z.string().trim().min(1);
const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const numericIdSchema = z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String);
const nullableNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform(String).nullable());

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const nominaVacacionEstadoSchema = z.enum(['ABIERTO', 'CERRADO', 'ANULADO']);
export const nominaVacacionSolicitudTipoSchema = z.enum(['DISFRUTADA', 'PAGADA', 'COMPENSADA']);
export const nominaVacacionSolicitudEstadoSchema = z.enum([
  'SOLICITADA',
  'APROBADA',
  'RECHAZADA',
  'DISFRUTADA',
  'PAGADA',
  'ANULADA'
]);
export const nominaVacacionAlertaSchema = z.enum([
  'VACACIONES_PENDIENTES_ALTAS',
  'SOLICITUD_VACACIONES_PENDIENTE'
]);

export const vacacionIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const solicitudIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const vacacionBaseSchema = z.object({
  empresa_id: numericIdSchema,
  contrato_id: nullableNumericIdSchema.optional().default(null),
  persona_id: numericIdSchema,
  vinculacion_id: numericIdSchema,
  fecha_inicio_causacion: z.string().date(),
  fecha_fin_causacion: z.string().date(),
  dias_causados: z.coerce.number().min(0).default(0),
  dias_disfrutados: z.coerce.number().min(0).default(0),
  dias_pagados: z.coerce.number().min(0).default(0),
  estado: nominaVacacionEstadoSchema.optional().default('ABIERTO'),
  activo: z.boolean().optional().default(true)
});

export const createVacacionSchema = vacacionBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_fin_causacion < data.fecha_inicio_causacion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin_causacion must be greater than or equal to fecha_inicio_causacion',
      path: ['fecha_fin_causacion']
    });
  }
});

export const updateVacacionSchema = vacacionBaseSchema.partial().superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }

  if (data.fecha_inicio_causacion && data.fecha_fin_causacion && data.fecha_fin_causacion < data.fecha_inicio_causacion) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin_causacion must be greater than or equal to fecha_inicio_causacion',
      path: ['fecha_fin_causacion']
    });
  }
});

const solicitudBaseSchema = z.object({
  vacacion_id: numericIdSchema,
  persona_id: numericIdSchema,
  vinculacion_id: numericIdSchema,
  fecha_inicio: z.string().date(),
  fecha_fin: z.string().date(),
  dias_solicitados: z.coerce.number().positive(),
  dias_habiles: z.coerce.number().min(0).nullable().optional().default(null),
  dias_calendario: z.coerce.number().min(0).nullable().optional().default(null),
  tipo_vacacion: nominaVacacionSolicitudTipoSchema.optional().default('DISFRUTADA'),
  estado: nominaVacacionSolicitudEstadoSchema.optional().default('SOLICITADA'),
  aprobado_por: nullableTrimmedStringSchema.optional().default(null),
  fecha_aprobacion: z.preprocess((value) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    }

    return value;
  }, z.string().date().nullable().optional().default(null)),
  observacion: nullableTrimmedStringSchema.optional().default(null),
  activo: z.boolean().optional().default(true)
});

export const createSolicitudSchema = solicitudBaseSchema.superRefine((data, ctx) => {
  if (data.fecha_fin < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const updateSolicitudSchema = z.object({
  vacacion_id: nullableNumericIdSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional(),
  fecha_inicio: z.string().date().optional(),
  fecha_fin: z.string().date().optional(),
  dias_solicitados: z.coerce.number().positive().optional(),
  dias_habiles: z.coerce.number().min(0).nullable().optional(),
  dias_calendario: z.coerce.number().min(0).nullable().optional(),
  tipo_vacacion: nominaVacacionSolicitudTipoSchema.optional(),
  observacion: nullableTrimmedStringSchema.optional(),
  activo: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }

  if (data.fecha_inicio && data.fecha_fin && data.fecha_fin < data.fecha_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fecha_fin must be greater than or equal to fecha_inicio',
      path: ['fecha_fin']
    });
  }
});

export const solicitudActionSchema = z.object({
  observacion: nullableTrimmedStringSchema.optional().default(null)
});

export const listVacacionesQuerySchema = paginationSchema.extend({
  activo: z.coerce.boolean().optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  estado: nominaVacacionEstadoSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  search: nullableTrimmedStringSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional()
});

export const listSolicitudesQuerySchema = paginationSchema.extend({
  activo: z.coerce.boolean().optional(),
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional(),
  estado: nominaVacacionSolicitudEstadoSchema.optional(),
  persona_id: nullableNumericIdSchema.optional(),
  search: nullableTrimmedStringSchema.optional(),
  tipo_vacacion: nominaVacacionSolicitudTipoSchema.optional(),
  vacacion_id: nullableNumericIdSchema.optional(),
  vinculacion_id: nullableNumericIdSchema.optional()
});

export const vacacionesDashboardQuerySchema = z.object({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export const vacacionesAlertasQuerySchema = paginationSchema.extend({
  contrato_id: nullableNumericIdSchema.optional(),
  empresa_id: nullableNumericIdSchema.optional()
});

export type CreateVacacionInput = z.infer<typeof createVacacionSchema>;
export type CreateSolicitudInput = z.infer<typeof createSolicitudSchema>;
export type ListSolicitudesQuery = z.infer<typeof listSolicitudesQuerySchema>;
export type ListVacacionesQuery = z.infer<typeof listVacacionesQuerySchema>;
export type NominaVacacionAlerta = z.infer<typeof nominaVacacionAlertaSchema>;
export type NominaVacacionEstado = z.infer<typeof nominaVacacionEstadoSchema>;
export type NominaVacacionSolicitudEstado = z.infer<typeof nominaVacacionSolicitudEstadoSchema>;
export type NominaVacacionSolicitudTipo = z.infer<typeof nominaVacacionSolicitudTipoSchema>;
export type SolicitudActionInput = z.infer<typeof solicitudActionSchema>;
export type UpdateSolicitudInput = z.infer<typeof updateSolicitudSchema>;
export type UpdateVacacionInput = z.infer<typeof updateVacacionSchema>;
export type VacacionesAlertasQuery = z.infer<typeof vacacionesAlertasQuerySchema>;
export type VacacionesDashboardQuery = z.infer<typeof vacacionesDashboardQuerySchema>;
