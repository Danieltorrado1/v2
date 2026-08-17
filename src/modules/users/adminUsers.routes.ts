import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requireRoles } from '../../middlewares/roleMiddleware';
import {
  createAdminUserHandler,
  deleteAdminUserHandler,
  getAdminUserById,
  getAdminUsers,
  updateAdminUserHandler,
  updateAdminUserPasswordHandler,
  updateAdminUserStateHandler
} from './users.controller';

const adminUsersRouter = Router();

adminUsersRouter.use(authMiddleware);
adminUsersRouter.use(requireRoles('ADMINISTRADOR'));

adminUsersRouter.get('/', getAdminUsers);
adminUsersRouter.get('/:id', getAdminUserById);
adminUsersRouter.post('/', createAdminUserHandler);
adminUsersRouter.patch('/:id', updateAdminUserHandler);
adminUsersRouter.patch('/:id/password', updateAdminUserPasswordHandler);
adminUsersRouter.patch('/:id/estado', updateAdminUserStateHandler);
adminUsersRouter.delete('/:id', deleteAdminUserHandler);

export { adminUsersRouter };
