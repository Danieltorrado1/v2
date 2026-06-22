import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createPersonaHandler,
  deactivatePersonaHandler,
  getPersona,
  getPersonaByDocumento,
  getPersonas,
  updatePersonaHandler
} from './personas.controller';

const personasRoutes = Router();

personasRoutes.use(authMiddleware);

personasRoutes.get('/', requirePermissions('personas.read'), getPersonas);
personasRoutes.get(
  '/documento/:numero_documento',
  requirePermissions('personas.read'),
  getPersonaByDocumento
);
personasRoutes.get('/:id', requirePermissions('personas.read'), getPersona);
personasRoutes.post('/', requirePermissions('personas.create'), createPersonaHandler);
personasRoutes.patch('/:id', requirePermissions('personas.update'), updatePersonaHandler);
personasRoutes.patch(
  '/:id/deactivate',
  requirePermissions('personas.deactivate'),
  deactivatePersonaHandler
);

export { personasRoutes };
