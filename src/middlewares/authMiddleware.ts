import { NextFunction, Request, Response } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { QueryResultRow } from 'pg';

import { dbQuery } from '../config/db';
import { env } from '../config/env';

export interface AuthenticatedUser {
  email?: string;
  permissions: string[];
  roles: string[];
  tokenPayload: JwtPayload;
  userId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

type JwtUserPayload = JwtPayload & {
  email?: unknown;
  permissions?: unknown;
  roles?: unknown;
  userId?: unknown;
};

interface AuthUserRow extends QueryResultRow {
  active: boolean;
  email: string;
  id: string;
  permissions: string[] | null;
  roles: string[] | null;
}

const isBearerToken = (authorizationHeader?: string): authorizationHeader is string => {
  return typeof authorizationHeader === 'string' && authorizationHeader.startsWith('Bearer ');
};

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string');
};

export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authorizationHeader = req.headers.authorization;

  if (!isBearerToken(authorizationHeader)) {
    next(
      Object.assign(new Error('Authorization token is required'), {
        code: 'UNAUTHORIZED',
        statusCode: 401
      })
    );
    return;
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();

  if (token.length === 0) {
    next(
      Object.assign(new Error('Authorization token is required'), {
        code: 'UNAUTHORIZED',
        statusCode: 401
      })
    );
    return;
  }

  void (async () => {
    try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === 'string') {
      next(
        Object.assign(new Error('Invalid token payload'), {
          code: 'INVALID_TOKEN',
          statusCode: 401
        })
      );
      return;
    }

    const payload = decoded as JwtUserPayload;
    const userId =
      typeof payload.sub === 'string'
        ? payload.sub
        : typeof payload.userId === 'string'
          ? payload.userId
          : undefined;

    if (!userId) {
      next(
        Object.assign(new Error('Token payload does not include a user identifier'), {
          code: 'INVALID_TOKEN',
          statusCode: 401
        })
      );
      return;
    }

    const result = await dbQuery<AuthUserRow>(
      `
        SELECT
          u.id::text AS id,
          u.correo AS email,
          COALESCE(u.activo, TRUE) AS active,
          COALESCE(
            ARRAY(
              SELECT DISTINCT r.nombre_rol
              FROM usuario_roles ur
              INNER JOIN roles r ON r.id = ur.rol_id
              WHERE ur.usuario_id = u.id
              ORDER BY r.nombre_rol
            ),
            ARRAY[]::text[]
          ) AS roles,
          COALESCE(
            ARRAY(
              SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
              FROM usuario_roles ur
              INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
              INNER JOIN permisos p ON p.id = rp.permiso_id
              WHERE ur.usuario_id = u.id
              ORDER BY CONCAT_WS('.', p.modulo, p.accion)
            ),
            ARRAY[]::text[]
          ) AS permissions
        FROM usuarios u
        WHERE u.id = $1
        LIMIT 1
      `,
      [userId]
    );

    const currentUser = result.rows[0];

    if (!currentUser) {
      next(
        Object.assign(new Error('Authenticated user no longer exists'), {
          code: 'UNAUTHORIZED',
          statusCode: 401
        })
      );
      return;
    }

    if (!currentUser.active) {
      next(
        Object.assign(new Error('User account is inactive'), {
          code: 'USER_INACTIVE',
          statusCode: 403
        })
      );
      return;
    }

    req.user = {
      userId: currentUser.id,
      email: currentUser.email,
      roles: toStringArray(currentUser.roles),
      permissions: toStringArray(currentUser.permissions),
      tokenPayload: payload
    };

    next();
    } catch (error) {
      next(error);
    }
  })();
};
