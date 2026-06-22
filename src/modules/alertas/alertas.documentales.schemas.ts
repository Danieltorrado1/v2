import { z } from 'zod';

const numericIdSchema = z.union([z.number().int().positive(), z.string().trim().regex(/^\d+$/)]).transform((value) =>
  Number(value)
);

const nullableNumericIdSchema = z.union([numericIdSchema, z.null()]).optional();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

export const tipoAlertaDocumentalSchema = z.enum([
  'DOCUMENTO_FALTANTE',
  'DOCUMENTO_VENCIDO',
  'DOCUMENTO_POR_VENCER',
  'EXPEDIENTE_INCOMPLETO'
]);

export const severidadAlertaDocumentalSchema = z.enum(['BAJA', 'MEDIA', 'ALTA', 'CRITICA']);

export const estadoAlertaDocumentalSchema = z.enum(['ACTIVA', 'RESUELTA', 'IGNORADA']);

export const alertaDocumentalIdParamSchema = z.object({
  id: numericIdSchema
});

export const generateAlertasDocumentalesSchema = z.object({
  empresa_id: nullableNumericIdSchema,
  contrato_id: nullableNumericIdSchema,
  vinculacion_id: nullableNumericIdSchema
}).partial();

export const listAlertasDocumentalesQuerySchema = paginationSchema.extend({
  empresa_id: nullableNumericIdSchema,
  contrato_id: nullableNumericIdSchema,
  vinculacion_id: nullableNumericIdSchema,
  persona_id: nullableNumericIdSchema,
  tipo_alerta: tipoAlertaDocumentalSchema.optional(),
  severidad: severidadAlertaDocumentalSchema.optional(),
  estado: estadoAlertaDocumentalSchema.optional()
}).partial();

export type AlertaDocumentalIdParams = z.infer<typeof alertaDocumentalIdParamSchema>;
export type GenerateAlertasDocumentalesInput = z.infer<typeof generateAlertasDocumentalesSchema>;
export type ListAlertasDocumentalesQuery = z.infer<typeof listAlertasDocumentalesQuerySchema>;
export type TipoAlertaDocumental = z.infer<typeof tipoAlertaDocumentalSchema>;
export type SeveridadAlertaDocumental = z.infer<typeof severidadAlertaDocumentalSchema>;
export type EstadoAlertaDocumental = z.infer<typeof estadoAlertaDocumentalSchema>;
