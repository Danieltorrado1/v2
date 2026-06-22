import { Request, Response } from 'express';

import { errorResponse } from '../utils/apiResponse';

export const notFoundHandler = (req: Request, res: Response): Response => {
  return errorResponse(res, {
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    errorCode: 'NOT_FOUND'
  });
};
