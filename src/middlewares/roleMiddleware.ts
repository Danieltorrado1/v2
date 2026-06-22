import { NextFunction, Request, Response } from 'express';

const unauthorizedError = (): Error & { code: string; statusCode: number } => {
  return Object.assign(new Error('Authentication required'), {
    code: 'UNAUTHORIZED',
    statusCode: 401
  });
};

const forbiddenError = (message: string): Error & { code: string; statusCode: number } => {
  return Object.assign(new Error(message), {
    code: 'FORBIDDEN',
    statusCode: 403
  });
};

export const requireRoles =
  (...requiredRoles: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorizedError());
      return;
    }

    if (requiredRoles.length === 0) {
      next();
      return;
    }

    const hasAnyRole = requiredRoles.some((role) => req.user?.roles.includes(role));

    if (!hasAnyRole) {
      next(forbiddenError('Insufficient role privileges'));
      return;
    }

    next();
  };

export const requirePermissions =
  (...requiredPermissions: string[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(unauthorizedError());
      return;
    }

    if (requiredPermissions.length === 0) {
      next();
      return;
    }

    const hasAllPermissions = requiredPermissions.every((permission) =>
      req.user?.permissions.includes(permission)
    );

    if (!hasAllPermissions) {
      next(forbiddenError('Insufficient permissions'));
      return;
    }

    next();
  };
