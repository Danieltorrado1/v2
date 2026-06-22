import { Request, Response } from 'express';

import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createUserSchema,
  updateUserSchema,
  userIdParamSchema
} from './users.schemas';
import {
  createUser,
  findUserProfileById,
  listUsers,
  setUserActiveState,
  updateUser
} from './users.service';

export const getUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await listUsers();

  return successResponse(res, {
    message: 'Users retrieved successfully',
    data: users
  });
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await findUserProfileById(id);

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
  const user = await createUser(input);

  return successResponse(res, {
    message: 'User created successfully',
    statusCode: 201,
    data: user
  });
});

export const updateUserHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const input = updateUserSchema.parse(req.body);
  const user = await updateUser(id, input);

  return successResponse(res, {
    message: 'User updated successfully',
    data: user
  });
});

export const activateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await setUserActiveState(id, true);

  return successResponse(res, {
    message: 'User activated successfully',
    data: user
  });
});

export const deactivateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = userIdParamSchema.parse(req.params);
  const user = await setUserActiveState(id, false);

  return successResponse(res, {
    message: 'User deactivated successfully',
    data: user
  });
});
