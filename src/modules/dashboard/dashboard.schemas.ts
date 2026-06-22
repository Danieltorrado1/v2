import { z } from 'zod';

const nullableTrimmedStringSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().trim().nullable());

const nullableDateSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  return value;
}, z.string().date().nullable());

export const dashboardQuerySchema = z
  .object({
    empresa_id: nullableTrimmedStringSchema.optional(),
    contrato_id: nullableTrimmedStringSchema.optional(),
    fecha_desde: nullableDateSchema.optional(),
    fecha_hasta: nullableDateSchema.optional()
  })
  .refine(
    (data) => {
      if (!data.fecha_desde || !data.fecha_hasta) {
        return true;
      }

      return data.fecha_desde <= data.fecha_hasta;
    },
    {
      message: 'fecha_hasta must be greater than or equal to fecha_desde',
      path: ['fecha_hasta']
    }
  );

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
