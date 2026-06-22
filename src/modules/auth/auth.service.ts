import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';

import { env } from '../../config/env';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';
import {
  findUserByEmailForAuth,
  findUserProfileById
} from '../users/users.service';
import { LoginInput } from './auth.schemas';

export interface AuthLoginResult {
  accessToken: string;
  expiresIn: string;
  tokenType: 'Bearer';
  user: {
    active: boolean;
    createdAt: string;
    email: string;
    id: string;
    name: string;
    permissions: string[];
    roles: string[];
    updatedAt: string;
  };
}

const createHttpError = (
  message: string,
  statusCode: number,
  code: string,
  details?: unknown
): Error & { code: string; details?: unknown; statusCode: number } => {
  return Object.assign(new Error(message), {
    code,
    details,
    statusCode
  });
};

export const loginUser = async (
  input: LoginInput,
  auditMeta?: AuditRequestMeta
): Promise<AuthLoginResult> => {
  const user = await findUserByEmailForAuth(input.email);

  if (!user) {
    throw createHttpError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.active) {
    throw createHttpError('User account is inactive', 403, 'USER_INACTIVE');
  }

  if (!user.passwordHash) {
    throw createHttpError('User auth credentials are missing', 500, 'AUTH_CREDENTIALS_MISSING');
  }

  const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);

  if (!isPasswordValid) {
    throw createHttpError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const accessToken = jwt.sign(
    {
      email: user.email,
      permissions: user.permissions,
      roles: user.roles
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
      subject: user.id
    }
  );

  await registerAuditEntry({
    usuario_id: user.id,
    accion: 'LOGIN',
    tabla: 'usuarios',
    registro_id: user.id,
    descripcion: 'Inicio de sesion exitoso',
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return {
    accessToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_EXPIRES_IN,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      active: user.active,
      roles: user.roles,
      permissions: user.permissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  };
};

export const getAuthenticatedUserProfile = async (userId: string) => {
  const user = await findUserProfileById(userId);

  if (!user) {
    throw createHttpError('Authenticated user not found', 404, 'USER_NOT_FOUND');
  }

  if (!user.active) {
    throw createHttpError('User account is inactive', 403, 'USER_INACTIVE');
  }

  return user;
};
