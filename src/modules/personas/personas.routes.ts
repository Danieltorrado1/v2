import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requireAnyPermissions, requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  createPersonalExportTemplateHandler,
  createPersonaCuentaBancariaHandler,
  exportPersonalMasterHandler,
  getPersonalExportFieldCatalogHandler,
  getPersonaCuentasBancariasHandler,
  getPersonaHistorialCambiosHandler,
  listPersonalExportTemplatesHandler,
  updatePersonaCuentaBancariaHandler
} from './personas.master.controller';
import {
  createPersonaHandler,
  createPersonaIdentificacionHandler,
  deactivatePersonaHandler,
  getPersona,
  getPersonaByDocumento,
  getPersonaIdentificacionesHandler,
  getPersonas,
  updatePersonaHandler
} from './personas.controller';

const personasRoutes = Router();

personasRoutes.use(authMiddleware);
personasRoutes.use(tenantMiddleware);

personasRoutes.get('/', requireAnyPermissions('personas.read', 'persona.ver'), getPersonas);
personasRoutes.get(
  '/documento/:numero_documento',
  requireAnyPermissions('personas.read', 'persona.ver'),
  getPersonaByDocumento
);
personasRoutes.get(
  '/exportaciones/campos',
  requireAnyPermissions('exportaciones.generar', 'personas.read', 'persona.ver'),
  getPersonalExportFieldCatalogHandler
);
personasRoutes.get(
  '/exportaciones/plantillas',
  requireAnyPermissions('exportaciones.generar', 'personas.read', 'persona.ver'),
  listPersonalExportTemplatesHandler
);
personasRoutes.post(
  '/exportaciones/plantillas',
  requireAnyPermissions('exportaciones.generar'),
  createPersonalExportTemplateHandler
);
personasRoutes.post(
  '/exportaciones/generar',
  requireAnyPermissions('exportaciones.generar'),
  exportPersonalMasterHandler
);
personasRoutes.get(
  '/:id/identificaciones',
  requireAnyPermissions('personas.read', 'persona.ver'),
  getPersonaIdentificacionesHandler
);
personasRoutes.post(
  '/:id/identificaciones',
  requireAnyPermissions('personas.update', 'persona.editar', 'persona.editar_identidad'),
  createPersonaIdentificacionHandler
);
personasRoutes.get(
  '/:id/historial-cambios',
  requireAnyPermissions('personas.read', 'persona.ver', 'auditoria.read'),
  getPersonaHistorialCambiosHandler
);
personasRoutes.get(
  '/:id/cuentas-bancarias',
  requireAnyPermissions(
    'bancario.ver',
    'bancario.editar',
    'bancario.verificar',
    'personas.update'
  ),
  getPersonaCuentasBancariasHandler
);
personasRoutes.post(
  '/:id/cuentas-bancarias',
  requireAnyPermissions('bancario.editar', 'bancario.verificar', 'personas.update'),
  createPersonaCuentaBancariaHandler
);
personasRoutes.patch(
  '/:id/cuentas-bancarias/:cuenta_bancaria_id',
  requireAnyPermissions('bancario.editar', 'bancario.verificar', 'personas.update'),
  updatePersonaCuentaBancariaHandler
);
personasRoutes.get('/:id', requireAnyPermissions('personas.read', 'persona.ver'), getPersona);
personasRoutes.post('/', requirePermissions('personas.create'), createPersonaHandler);
personasRoutes.patch(
  '/:id',
  requireAnyPermissions(
    'personas.update',
    'persona.editar',
    'persona.editar_identidad',
    'persona.editar_contacto'
  ),
  updatePersonaHandler
);
personasRoutes.patch(
  '/:id/deactivate',
  requirePermissions('personas.deactivate'),
  deactivatePersonaHandler
);

export { personasRoutes };
