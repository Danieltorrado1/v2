import { Response } from 'express';

export interface SuccessResponseOptions<T> {
  data: T;
  message?: string;
  statusCode?: number;
}

export interface ErrorResponseOptions {
  details?: unknown;
  errorCode?: string;
  message: string;
  statusCode?: number;
}

export const successResponse = <T>(
  res: Response,
  options: SuccessResponseOptions<T>
): Response => {
  const { data, message = 'Success', statusCode = 200 } = options;

  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

export const errorResponse = (
  res: Response,
  options: ErrorResponseOptions
): Response => {
  const {
    details,
    errorCode = 'REQUEST_ERROR',
    message,
    statusCode = 400
  } = options;

  return res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      details,
      message
    }
  });
};
