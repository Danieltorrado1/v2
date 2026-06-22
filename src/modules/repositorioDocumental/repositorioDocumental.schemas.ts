import { z } from 'zod';

const numericIdSchema = z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform((value) =>
  Number(value)
);

const optionalNumericIdSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, numericIdSchema.optional());

const optionalBooleanSchema = z.preprocess((value) => {
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

const optionalDateSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) {
    return undefined;
  }

  return value;
}, z.string().date().optional());

const optionalSearchSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().trim().min(1).optional());

export const repositorioOrigenSchema = z.enum(['persona', 'vinculacion', 'generado']);

export const estadoDocumentalSchema = z.enum([
  'vigente',
  'vencido',
  'reemplazado',
  'sin_vencimiento'
]);

export const repositorioDocumentoParamsSchema = z.object({
  id: numericIdSchema,
  origen: repositorioOrigenSchema
});

const repositorioDocumentosBaseSchema = z.object({
  empresa_id: optionalNumericIdSchema,
  contrato_id: optionalNumericIdSchema,
  persona_id: optionalNumericIdSchema,
  vinculacion_id: optionalNumericIdSchema,
  tipo_documento_id: optionalNumericIdSchema,
  origen: repositorioOrigenSchema.optional(),
  estado_documental: estadoDocumentalSchema.optional(),
  es_vigente: optionalBooleanSchema,
  incluir_generados: optionalBooleanSchema,
  fecha_desde: optionalDateSchema,
  fecha_hasta: optionalDateSchema,
  search: optionalSearchSchema,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

const withDateRangeValidation = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine(
    (data) => {
      if (
        typeof data !== 'object' ||
        data === null ||
        !('fecha_desde' in data) ||
        !('fecha_hasta' in data)
      ) {
        return true;
      }

      const fechaDesde = data.fecha_desde;
      const fechaHasta = data.fecha_hasta;

      if (!fechaDesde || !fechaHasta) {
        return true;
      }

      return fechaDesde <= fechaHasta;
    },
    {
      message: 'fecha_hasta debe ser mayor o igual a fecha_desde',
      path: ['fecha_hasta']
    }
  );

export const repositorioDocumentosQuerySchema = withDateRangeValidation(
  repositorioDocumentosBaseSchema
);

export const repositorioDocumentosExportQuerySchema = withDateRangeValidation(
  repositorioDocumentosBaseSchema.omit({
    limit: true,
    page: true
  })
);

export const repositorioDocumentosIndicadoresQuerySchema = withDateRangeValidation(
  repositorioDocumentosBaseSchema.omit({
  limit: true,
  page: true
  })
);

export type RepositorioDocumentoParams = z.infer<typeof repositorioDocumentoParamsSchema>;
export type RepositorioDocumentosQuery = z.infer<typeof repositorioDocumentosQuerySchema>;
export type RepositorioDocumentosExportQuery = z.infer<typeof repositorioDocumentosExportQuerySchema>;
export type RepositorioDocumentosIndicadoresQuery = z.infer<typeof repositorioDocumentosIndicadoresQuerySchema>;
