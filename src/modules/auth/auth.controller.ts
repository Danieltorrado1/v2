import { Request, Response } from 'express';

import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { loginSchema } from './auth.schemas';
import { getAuthenticatedUserProfile, loginUser } from './auth.service';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const result = await loginUser(input, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Login successful',
    data: result
  });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw Object.assign(new Error('Authentication required'), {
      code: 'UNAUTHORIZED',
      statusCode: 401
    });
  }

  const user = await getAuthenticatedUserProfile(userId);

  return successResponse(res, {
    message: 'Authenticated user retrieved successfully',
    data: user
  });
});
