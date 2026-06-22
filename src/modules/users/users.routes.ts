import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  activateUser,
  createUserHandler,
  deactivateUser,
  getUserById,
  getUsers,
  updateUserHandler
} from './users.controller';

const usersRouter = Router();

usersRouter.use(authMiddleware);

usersRouter.get('/', getUsers);
usersRouter.get('/:id', getUserById);
usersRouter.post('/', requirePermissions('users.create'), createUserHandler);
usersRouter.patch('/:id', requirePermissions('users.update'), updateUserHandler);
usersRouter.patch('/:id/activate', requirePermissions('users.activate'), activateUser);
usersRouter.patch('/:id/deactivate', requirePermissions('users.deactivate'), deactivateUser);

export { usersRouter };
