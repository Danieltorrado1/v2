import { z } from 'zod';

const id = z.coerce.number().int().positive();
const nullableText = z.string().trim().min(1).nullable().optional();

export const listCoberturaExternosSchema = z.object({ periodo_id: id.optional(), empresa_id: id.optional(), contrato_id: id.optional() });
export const upsertCoberturaExternoSchema = z.object({
  empresa_id: id,
  tipo_documento: z.string().trim().min(1).default('CC'),
  numero_documento: z.string().trim().min(1),
  nombre_completo: z.string().trim().min(1),
  banco: nullableText,
  tipo_cuenta: nullableText,
  numero_cuenta: nullableText
});
export const coberturaExternoIdSchema = z.object({ id });
export const coberturaCuentaIdSchema = z.object({ id });
export const generarCoberturaCuentaSchema = z.object({ empresa_id: id, contrato_id: id, periodo_id: id, externo_id: id });
export const uploadCoberturaExternoDocumentoSchema = z.object({ tipo_documento: z.enum(['CEDULA_EXTERNO_COBERTURA', 'CERTIFICACION_BANCARIA_EXTERNO_COBERTURA']) });

export type ListCoberturaExternosQuery = z.infer<typeof listCoberturaExternosSchema>;
export type UpsertCoberturaExternoInput = z.infer<typeof upsertCoberturaExternoSchema>;
export type GenerarCoberturaCuentaInput = z.infer<typeof generarCoberturaCuentaSchema>;
