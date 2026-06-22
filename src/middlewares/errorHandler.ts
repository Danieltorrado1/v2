import { NextFunction, Request, Response } from 'express';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { ZodError } from 'zod';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/AppError';
import { errorResponse } from '../utils/apiResponse';

type HttpError = Error & {
  code?: string;
  details?: unknown;
  statusCode?: number;
  constraint?: string;
};

export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (error instanceof ZodError) {
    return errorResponse(res, {
      statusCode: 400,
      message: 'Validation error',
      errorCode: 'VALIDATION_ERROR',
      details: error.flatten()
    });
  }

  if (error instanceof TokenExpiredError) {
    return errorResponse(res, {
      statusCode: 401,
      message: 'Token expired',
      errorCode: 'TOKEN_EXPIRED'
    });
  }

  if (error instanceof JsonWebTokenError) {
    return errorResponse(res, {
      statusCode: 401,
      message: 'Invalid token',
      errorCode: 'INVALID_TOKEN'
    });
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error('Application error', {
        code: error.code,
        details: error.details,
        message: error.message
      });
    }

    return errorResponse(res, {
      statusCode: error.statusCode,
      message: error.message,
      errorCode: error.code,
      details: env.NODE_ENV === 'production' ? undefined : error.details
    });
  }

  const dbError = error as HttpError | undefined;

  if (dbError?.code === '23514') {
    const isMetodoPagoConstraint =
      dbError.constraint === 'chk_vinculaciones_metodo_pago' ||
      (dbError.details &&
        typeof dbError.details === 'object' &&
        'constraint' in dbError.details &&
        (dbError.details as { constraint?: string }).constraint === 'chk_vinculaciones_metodo_pago');

    return errorResponse(res, {
      statusCode: 400,
      message: isMetodoPagoConstraint
        ? 'metodo_pago debe ser uno de los valores permitidos: ASISTENCIA, CATEGORIA, OPS_CUENTA_COBRO, OPS_VALOR_FIJO o OPS_POR_PRODUCTO'
        : 'Constraint validation failed',
      errorCode: 'CHECK_CONSTRAINT_VIOLATION',
      details: env.NODE_ENV === 'production' ? undefined : dbError.details
    });
  }

  const httpError = error instanceof Error ? (error as HttpError) : undefined;
  const statusCode = httpError?.statusCode ?? 500;
  const exposeMessage = statusCode < 500;

  if (statusCode >= 500) {
    logger.error('Unhandled error', error);
  }

  return errorResponse(res, {
    statusCode,
    message: exposeMessage ? httpError?.message ?? 'Request error' : 'Internal server error',
    errorCode: httpError?.code ?? 'INTERNAL_SERVER_ERROR',
    details:
      env.NODE_ENV !== 'production'
        ? httpError?.details ?? httpError?.stack
        : undefined
  });
};
