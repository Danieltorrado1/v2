import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createPersonalConfigHandler,
  createSalarioConfigHandler,
  getPersonalConfigActivaHandler,
  getPersonalConfigsHandler,
  getSalarioConfigActivaHandler,
  getSalarioConfigsHandler,
  probarPersonalHandler,
  probarSalarioHandler,
  togglePersonalEstadoHandler,
  toggleSalarioEstadoHandler,
  updatePersonalRangosHandler,
  validarFormulaHandler,
} from './configuracion.controller';

const configuracionRoutes = Router();

configuracionRoutes.use(authMiddleware);

// ── Salary Calculator ─────────────────────────────────────────────────────────
configuracionRoutes.get(
  '/calculadoras/salario',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  getSalarioConfigsHandler,
);
configuracionRoutes.get(
  '/calculadoras/salario/activa',
  getSalarioConfigActivaHandler, // Public within auth — calculators can call this
);
configuracionRoutes.post(
  '/calculadoras/salario',
  requirePermissions('administracion.configuracion_calculadoras.create'),
  createSalarioConfigHandler,
);
configuracionRoutes.patch(
  '/calculadoras/salario/:id/estado',
  requirePermissions('administracion.configuracion_calculadoras.deactivate'),
  toggleSalarioEstadoHandler,
);
configuracionRoutes.post(
  '/calculadoras/salario/probar',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  probarSalarioHandler,
);
configuracionRoutes.post(
  '/calculadoras/formula/validar',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  validarFormulaHandler,
);

// ── Personnel Calculator ──────────────────────────────────────────────────────
configuracionRoutes.get(
  '/calculadoras/personal',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  getPersonalConfigsHandler,
);
configuracionRoutes.get(
  '/calculadoras/personal/activa',
  getPersonalConfigActivaHandler, // Public within auth
);
configuracionRoutes.post(
  '/calculadoras/personal',
  requirePermissions('administracion.configuracion_calculadoras.create'),
  createPersonalConfigHandler,
);
configuracionRoutes.patch(
  '/calculadoras/personal/:id/estado',
  requirePermissions('administracion.configuracion_calculadoras.deactivate'),
  togglePersonalEstadoHandler,
);
configuracionRoutes.put(
  '/calculadoras/personal/:id/rangos',
  requirePermissions('administracion.configuracion_calculadoras.update'),
  updatePersonalRangosHandler,
);
configuracionRoutes.post(
  '/calculadoras/personal/probar',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  probarPersonalHandler,
);

export { configuracionRoutes };
