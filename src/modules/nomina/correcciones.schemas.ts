import { z } from 'zod';

import {
  NOMINA_CORRECCION_ESTADOS,
  NOMINA_CORRECCION_REFERENCE_FIELD_BY_TIPO,
  NOMINA_CORRECCION_TIPOS,
  isNominaCorreccionDifferenceConsistent
} from './correcciones.constants';

const trimmedStringSchema = z.string().trim().min(1);

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const positiveNumericIdSchema = z
  .union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)])
  .transform((value) => Number(value));

const nullablePositiveNumericIdSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return value;
}, positiveNumericIdSchema.nullable());

const nonNegativeMoneySchema = z.coerce.number().min(0);

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const nominaCorreccionEstadoSchema = z.enum(NOMINA_CORRECCION_ESTADOS);
export const nominaCorreccionTipoSchema = z.enum(NOMINA_CORRECCION_TIPOS);

export const nominaCorreccionIdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

const correccionReferenceSchema = z.object({
  movimiento_id: nullablePositiveNumericIdSchema.optional().default(null),
  novedad_id: nullablePositiveNumericIdSchema.optional().default(null),
  liquidacion_id: nullablePositiveNumericIdSchema.optional().default(null),
  desprendible_origen_id: nullablePositiveNumericIdSchema.optional().default(null)
}).strict();

const correccionBaseSchema = z
  .object({
    periodo_id: positiveNumericIdSchema,
    nomina_empleado_id: positiveNumericIdSchema,
    vinculacion_id: positiveNumericIdSchema,
    tipo_correccion: nominaCorreccionTipoSchema,
    concepto: trimmedStringSchema,
    motivo: trimmedStringSchema,
    valor_anterior: nonNegativeMoneySchema,
    valor_nuevo: nonNegativeMoneySchema,
    diferencia: z.coerce.number().optional(),
    observacion_revision: nullableTrimmedStringSchema.optional().default(null)
  })
  .merge(correccionReferenceSchema)
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.diferencia !== undefined &&
      !isNominaCorreccionDifferenceConsistent(data.valor_anterior, data.valor_nuevo, data.diferencia)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['diferencia'],
        message: 'diferencia must match valor_nuevo - valor_anterior'
      });
    }

    const requiredField = NOMINA_CORRECCION_REFERENCE_FIELD_BY_TIPO[data.tipo_correccion];

    if (requiredField && data[requiredField] === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [requiredField],
        message: `${requiredField} is required for tipo_correccion ${data.tipo_correccion}`
      });
    }
  });

export const listNominaCorreccionesQuerySchema = paginationSchema.extend({
  periodo_id: nullablePositiveNumericIdSchema.optional(),
  nomina_empleado_id: nullablePositiveNumericIdSchema.optional(),
  vinculacion_id: nullablePositiveNumericIdSchema.optional(),
  estado: nominaCorreccionEstadoSchema.optional(),
  tipo_correccion: nominaCorreccionTipoSchema.optional(),
  activo: z.coerce.boolean().optional(),
  search: nullableTrimmedStringSchema.optional()
});

export const createNominaCorreccionSchema = correccionBaseSchema;

const updateNominaCorreccionBaseSchema = z.object({
  tipo_correccion: nominaCorreccionTipoSchema.optional(),
  concepto: trimmedStringSchema.optional(),
  motivo: trimmedStringSchema.optional(),
  valor_anterior: nonNegativeMoneySchema.optional(),
  valor_nuevo: nonNegativeMoneySchema.optional(),
  diferencia: z.coerce.number().optional(),
  observacion_revision: nullableTrimmedStringSchema.optional(),
  movimiento_id: nullablePositiveNumericIdSchema.optional(),
  novedad_id: nullablePositiveNumericIdSchema.optional(),
  liquidacion_id: nullablePositiveNumericIdSchema.optional(),
  desprendible_origen_id: nullablePositiveNumericIdSchema.optional()
}).strict();

export const updateNominaCorreccionSchema = updateNominaCorreccionBaseSchema.superRefine((data, ctx) => {
  if (Object.keys(data).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field is required'
    });
  }

  const hasBothValues =
    data.valor_anterior !== undefined && data.valor_nuevo !== undefined && data.diferencia !== undefined;

  if (
    hasBothValues &&
    !isNominaCorreccionDifferenceConsistent(
      data.valor_anterior as number,
      data.valor_nuevo as number,
      data.diferencia as number
    )
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['diferencia'],
      message: 'diferencia must match valor_nuevo - valor_anterior'
    });
  }

  if (data.tipo_correccion) {
    const requiredField = NOMINA_CORRECCION_REFERENCE_FIELD_BY_TIPO[data.tipo_correccion];

    if (requiredField && data[requiredField] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [requiredField],
        message: `${requiredField} is required when tipo_correccion changes to ${data.tipo_correccion}`
      });
    }
  }
});

export const solicitarNominaCorreccionSchema = z.object({
  observacion_revision: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const revisarNominaCorreccionSchema = z.object({
  observacion_revision: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const aprobarNominaCorreccionSchema = z.object({
  observacion_revision: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const rechazarNominaCorreccionSchema = z.object({
  observacion_revision: z.string().trim().min(1)
}).strict();

export const aplicarNominaCorreccionSchema = z.object({
  observacion_revision: nullableTrimmedStringSchema.optional().default(null)
}).strict();

export const anularNominaCorreccionSchema = z.object({
  observacion_revision: z.string().trim().min(1)
}).strict();

export const deactivateNominaCorreccionSchema = z.object({}).strict();

export type NominaCorreccionEstado = z.infer<typeof nominaCorreccionEstadoSchema>;
export type NominaCorreccionTipo = z.infer<typeof nominaCorreccionTipoSchema>;
export type ListNominaCorreccionesQuery = z.infer<typeof listNominaCorreccionesQuerySchema>;
export type CreateNominaCorreccionInput = z.infer<typeof createNominaCorreccionSchema>;
export type UpdateNominaCorreccionInput = z.infer<typeof updateNominaCorreccionSchema>;
export type SolicitarNominaCorreccionInput = z.infer<typeof solicitarNominaCorreccionSchema>;
export type RevisarNominaCorreccionInput = z.infer<typeof revisarNominaCorreccionSchema>;
export type AprobarNominaCorreccionInput = z.infer<typeof aprobarNominaCorreccionSchema>;
export type RechazarNominaCorreccionInput = z.infer<typeof rechazarNominaCorreccionSchema>;
export type AplicarNominaCorreccionInput = z.infer<typeof aplicarNominaCorreccionSchema>;
export type AnularNominaCorreccionInput = z.infer<typeof anularNominaCorreccionSchema>;
