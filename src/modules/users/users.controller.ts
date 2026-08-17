import { Request, Response } from 'express';

import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createAdminUserSchema,
  createUserSchema,
  updateAdminUserPasswordSchema,
  updateAdminUserSchema,
  updateAdminUserStateSchema,
  updateUserSchema,
  userIdParamSchema
} from './users.schemas';
import {
  createAdminUser,
  createUser,
  deleteAdminUser,
  findAdminUserById,
  findUserProfileById,
  listAdminUsers,
  listUsers,
  updateAdminUser,
  updateAdminUserPassword,
  updateAdminUserState,
  setUserActiveState,
  updateUser
} from './users.service';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';

const getActor = (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw Object.assign(new Error('Authentication required'), {
      code: 'UNAUTHORIZED',
      statusCode: 401
    });
  }

  const auditMeta = getAuditRequestMeta(req);
  return { userId, ip: auditMeta.ip ?? null, userAgent: auditMeta.user_agent ?? null };
};

export const getUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await listUsers();

  return successResponse(res, {
    message: 'Users retrieved successfully',
    data: users
  });
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await findUserProfileById(String(id));

  if (!user) {
    throw Object.assign(new Error('User not found'), {
      code: 'USER_NOT_FOUND',
      statusCode: 404
    });
  }

  return successResponse(res, {
    message: 'User retrieved successfully',
    data: user
  });
});

export const createUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createUserSchema.parse(req.body);
  const user = await createUser(input, getActor(req));

  return successResponse(res, {
    message: 'User created successfully',
    statusCode: 201,
    data: user
  });
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const input = updateUserSchema.parse(req.body);
  const user = await updateUser(String(id), input, getActor(req));

  return successResponse(res, {
    message: 'User updated successfully',
    data: user
  });
});

export const activateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await setUserActiveState(String(id), true, getActor(req));

  return successResponse(res, {
    message: 'User activated successfully',
    data: user
  });
});

export const deactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await setUserActiveState(String(id), false, getActor(req));

  return successResponse(res, {
    message: 'User deactivated successfully',
    data: user
  });
});

export const getAdminUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await listAdminUsers();

  return successResponse(res, {
    message: 'Admin users retrieved successfully',
    data: users
  });
});

export const getAdminUserById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await findAdminUserById(id);

  if (!user) {
    throw Object.assign(new Error('User not found'), {
      code: 'USER_NOT_FOUND',
      statusCode: 404
    });
  }

  return successResponse(res, {
    message: 'Admin user retrieved successfully',
    data: user
  });
});

export const createAdminUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createAdminUserSchema.parse(req.body);
  const user = await createAdminUser(input);

  return successResponse(res, {
    message: 'Admin user created successfully',
    statusCode: 201,
    data: user
  });
});

export const updateAdminUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const input = updateAdminUserSchema.parse(req.body);
  const user = await updateAdminUser(id, input);

  return successResponse(res, {
    message: 'Admin user updated successfully',
    data: user
  });
});

export const updateAdminUserPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const input = updateAdminUserPasswordSchema.parse(req.body);
  const user = await updateAdminUserPassword(id, input.password);

  return successResponse(res, {
    message: 'Admin user password updated successfully',
    data: user
  });
});

export const updateAdminUserStateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const input = updateAdminUserStateSchema.parse(req.body);
  const user = await updateAdminUserState(id, input.active);

  return successResponse(res, {
    message: `Admin user ${input.active ? 'activated' : 'deactivated'} successfully`,
    data: user
  });
});

export const deleteAdminUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await deleteAdminUser(id);

  return successResponse(res, {
    message: 'Admin user deactivated successfully',
    data: user
  });
});
