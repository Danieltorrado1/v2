import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { dashboardQuerySchema } from './dashboard.schemas';
import {
  getDashboardAlertas,
  getDashboardCobertura,
  getDashboardDocumentos,
  getDashboardNomina,
  getDashboardPersonas,
  getDashboardResumen,
  getDashboardSst
} from './dashboard.service';

const ensureAuthenticated = (req: Request): void => {
  if (!req.user?.userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
};

export const getDashboardResumenHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardResumen(query);

  return successResponse(res, {
    message: 'Dashboard summary retrieved successfully',
    data
  });
});

export const getDashboardPersonasHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardPersonas(query);

  return successResponse(res, {
    message: 'Dashboard personas retrieved successfully',
    data
  });
});

export const getDashboardDocumentosHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardDocumentos(query);

  return successResponse(res, {
    message: 'Dashboard documentos retrieved successfully',
    data
  });
});

export const getDashboardCoberturaHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardCobertura(query);

  return successResponse(res, {
    message: 'Dashboard cobertura retrieved successfully',
    data
  });
});

export const getDashboardNominaHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardNomina(query);

  return successResponse(res, {
    message: 'Dashboard nomina retrieved successfully',
    data
  });
});

export const getDashboardSstHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardSst(query);

  return successResponse(res, {
    message: 'Dashboard SST retrieved successfully',
    data
  });
});

export const getDashboardAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  const query = dashboardQuerySchema.parse(req.query);
  const data = await getDashboardAlertas(query);

  return successResponse(res, {
    message: 'Dashboard alertas retrieved successfully',
    data
  });
});
