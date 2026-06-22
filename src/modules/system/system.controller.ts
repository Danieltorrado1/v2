import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { runSystemJob } from './system.service';

const executeJobHandler = (jobName: 'alertas' | 'documentos' | 'cobertura' | 'nomina' | 'sst') =>
  asyncHandler(async (req: Request, res: Response) => {
    const actorUserId = req.user?.userId;

    if (!actorUserId) {
      throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
    }

    const result = await runSystemJob(jobName, actorUserId, getAuditRequestMeta(req));

    return successResponse(res, {
      message: `Job ${jobName} executed successfully`,
      data: result
    });
  });

export const runAlertasJobHandler = executeJobHandler('alertas');
export const runDocumentosJobHandler = executeJobHandler('documentos');
export const runCoberturaJobHandler = executeJobHandler('cobertura');
export const runNominaJobHandler = executeJobHandler('nomina');
export const runSstJobHandler = executeJobHandler('sst');
