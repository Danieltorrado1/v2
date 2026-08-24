import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  listSstPendingCaptureQuerySchema,
  listSstPreparationPlanQuerySchema,
  listSstReviewCasesQuerySchema,
  resolveSstReviewCaseSchema,
  sstReviewCaseParamSchema
} from './sst.preparacion.schemas';
import {
  getSstPreparationSummary,
  listSstPendingCapture,
  listSstPreparationPlan,
  listSstReviewCases,
  resolveSstReviewCase
} from './sst.preparacion.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
};

export const getSstPreparationSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  return successResponse(res, {
    message: 'SST preparation summary retrieved successfully',
    data: await getSstPreparationSummary(req.tenant)
  });
});

export const listSstReviewCasesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listSstReviewCasesQuerySchema.parse(req.query);
  return successResponse(res, {
    message: 'SST review cases retrieved successfully',
    data: await listSstReviewCases(query, req.tenant)
  });
});

export const resolveSstReviewCaseHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstReviewCaseParamSchema.parse(req.params);
  const input = resolveSstReviewCaseSchema.parse(req.body);
  return successResponse(res, {
    message: 'SST review case resolved successfully',
    data: await resolveSstReviewCase(id, input, getActorUserId(req), req.tenant)
  });
});

export const listSstPendingCaptureHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listSstPendingCaptureQuerySchema.parse(req.query);
  return successResponse(res, {
    message: 'SST pending capture list retrieved successfully',
    data: await listSstPendingCapture(query, req.tenant)
  });
});

export const listSstPreparationPlanHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listSstPreparationPlanQuerySchema.parse(req.query);
  return successResponse(res, {
    message: 'SST preparation plan retrieved successfully',
    data: await listSstPreparationPlan(query, req.tenant)
  });
});
