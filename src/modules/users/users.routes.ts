import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requireAnyPermissions, requirePermissions } from '../../middlewares/roleMiddleware';
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

usersRouter.get('/', requireAnyPermissions('configuracion.read', 'usuarios.read'), getUsers);
usersRouter.get('/:id', requireAnyPermissions('configuracion.read', 'usuarios.read'), getUserById);
usersRouter.post('/', requirePermissions('users.create'), createUserHandler);
usersRouter.patch('/:id', requireAnyPermissions('users.update', 'usuarios.update'), updateUserHandler);
usersRouter.patch('/:id/activate', requireAnyPermissions('users.activate', 'usuarios.update'), activateUser);
usersRouter.patch('/:id/deactivate', requireAnyPermissions('users.deactivate', 'usuarios.update'), deactivateUser);

export { usersRouter };
