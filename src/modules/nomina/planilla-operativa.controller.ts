import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { periodoIdParamSchema } from './nomina.schemas';
import { loadPlanillaOperativaSnapshot } from './nomina.service';
import { buildPlanillaOperativaXlsx } from './planilla-operativa.xlsx';

const scopeQuery = z.object({ empresa_id: z.string().regex(/^[1-9]\d*$/).optional(),
  contrato_id: z.string().regex(/^[1-9]\d*$/).optional() }).strict();

export const downloadPlanillaOperativaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  if (!req.user?.userId || !req.tenant || String(req.tenant.userId) !== req.user.userId) {
    throw new AppError('Authenticated tenant required', 403, 'TENANT_REQUIRED');
  }
  const { snapshot, signature } = await loadPlanillaOperativaSnapshot(id, req.tenant, scopeQuery.parse(req.query));
  const file = buildPlanillaOperativaXlsx(snapshot, signature);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="planilla-operativa-${id}-${snapshot.periodo.fecha_fin}.xlsx"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).send(file);
});
