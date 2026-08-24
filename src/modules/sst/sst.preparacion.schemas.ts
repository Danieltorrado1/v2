import { z } from 'zod';

export const sstReviewTypeFilterSchema = z.enum(['TODOS', 'DIGITAL', 'AFILIACION']).default('TODOS');
export const sstReviewDecisionSchema = z.enum([
  'USAR_FUENTE_A',
  'USAR_FUENTE_B',
  'INGRESAR_VALOR_MANUAL',
  'MANTENER_MAESTRO',
  'DESCARTAR_CAMBIO'
]);

export const listSstReviewCasesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  tipo: sstReviewTypeFilterSchema.optional().default('TODOS'),
  campo: z.string().trim().min(1).max(120).optional(),
  municipio: z.string().trim().min(1).max(160).optional(),
  estado: z.enum(['TODOS', 'PENDIENTE', 'RESUELTO', 'DESCARTADO']).optional().default('TODOS')
});

export const listSstPreparationPlanQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  estado: z
    .enum(['TODOS', 'APTO_APPLY_AUTOMATICO', 'APTO_APPLY_PARCIAL', 'REQUIERE_REVISION', 'SIN_DATOS_DIGITALES'])
    .optional()
    .default('TODOS')
});

export const sstReviewCaseParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const resolveSstReviewCaseSchema = z
  .object({
    decision: sstReviewDecisionSchema,
    valor_resuelto: z.string().trim().max(500).nullable().optional(),
    observacion: z.string().trim().max(1000).nullable().optional()
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'INGRESAR_VALOR_MANUAL' && !value.valor_resuelto?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Debe registrar un valor manual para esta decision.',
        path: ['valor_resuelto']
      });
    }
  });

export const listSstPendingCaptureQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  municipio: z.string().trim().min(1).max(160).optional()
});

export type ListSstReviewCasesQuery = z.infer<typeof listSstReviewCasesQuerySchema>;
export type ListSstPreparationPlanQuery = z.infer<typeof listSstPreparationPlanQuerySchema>;
export type ResolveSstReviewCaseInput = z.infer<typeof resolveSstReviewCaseSchema>;
export type ListSstPendingCaptureQuery = z.infer<typeof listSstPendingCaptureQuerySchema>;
