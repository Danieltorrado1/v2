import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requireAnyPermissions, requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { contratosLifecycleRoutes } from '../contratos/contratos.routes';
import {
  createCargoHandler,
  createContratoHandler,
  createEmpresaHandler,
  getArlHandler,
  getCajasCompensacionHandler,
  getCargoByIdHandler,
  getCargosHandler,
  getContratoByIdHandler,
  getContratosHandler,
  getDepartamentosHandler,
  getEmpresasHandler,
  getEmpresaByIdHandler,
  getEpsHandler,
  getEstadosCivilesHandler,
  getFondosPensionHandler,
  getMetodosPagoHandler,
  getMunicipiosHandler,
  getNivelesEstudioHandler,
  getPermissionsHandler,
  getRolesHandler,
  getSexosHandler,
  getTiposDocumentoHandler,
  getTiposJornadaHandler,
  getTiposVinculacionHandler,
  getZonasHandler,
  setCargoEstadoHandler,
  setContratoEstadoHandler,
  setEmpresaEstadoHandler,
  updateCargoHandler,
  updateContratoHandler,
  updateEmpresaHandler
} from './configuracion.admin.controller';
import {
  createContratoPerfilLicitacionHandler,
  createContratoUbicacionLaboralHandler,
  listContratoPerfilesLicitacionHandler,
  listContratoUbicacionesLaboralesHandler,
  updateContratoPerfilLicitacionHandler,
  updateContratoUbicacionLaboralHandler
} from './configuracion.personal.controller';
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

configuracionRoutes.get(
  '/calculadoras/salario',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  getSalarioConfigsHandler,
);
configuracionRoutes.get('/calculadoras/salario/activa', getSalarioConfigActivaHandler);
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

configuracionRoutes.get(
  '/calculadoras/personal',
  requirePermissions('administracion.configuracion_calculadoras.read'),
  getPersonalConfigsHandler,
);
configuracionRoutes.get('/calculadoras/personal/activa', getPersonalConfigActivaHandler);
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

configuracionRoutes.get('/catalogos/tipos-vinculacion', requireAnyPermissions('configuracion.read', 'catalogos.read'), getTiposVinculacionHandler);
configuracionRoutes.get('/catalogos/tipos-jornada', requireAnyPermissions('configuracion.read', 'catalogos.read'), getTiposJornadaHandler);
configuracionRoutes.get('/catalogos/metodos-pago', requireAnyPermissions('configuracion.read', 'catalogos.read'), getMetodosPagoHandler);
configuracionRoutes.get('/catalogos/departamentos', requireAnyPermissions('configuracion.read', 'catalogos.read'), getDepartamentosHandler);
configuracionRoutes.get('/catalogos/municipios', requireAnyPermissions('configuracion.read', 'catalogos.read'), getMunicipiosHandler);
configuracionRoutes.get('/catalogos/zonas', requireAnyPermissions('configuracion.read', 'catalogos.read'), getZonasHandler);
configuracionRoutes.get('/catalogos/eps', requireAnyPermissions('configuracion.read', 'catalogos.read'), getEpsHandler);
configuracionRoutes.get('/catalogos/arl', requireAnyPermissions('configuracion.read', 'catalogos.read'), getArlHandler);
configuracionRoutes.get('/catalogos/fondos-pension', requireAnyPermissions('configuracion.read', 'catalogos.read'), getFondosPensionHandler);
configuracionRoutes.get('/catalogos/cajas-compensacion', requireAnyPermissions('configuracion.read', 'catalogos.read'), getCajasCompensacionHandler);
configuracionRoutes.get('/catalogos/niveles-estudio', requireAnyPermissions('configuracion.read', 'catalogos.read'), getNivelesEstudioHandler);
configuracionRoutes.get('/catalogos/estados-civiles', requireAnyPermissions('configuracion.read', 'catalogos.read'), getEstadosCivilesHandler);
configuracionRoutes.get('/catalogos/sexos', requireAnyPermissions('configuracion.read', 'catalogos.read'), getSexosHandler);
configuracionRoutes.get('/catalogos/tipos-documentos', requireAnyPermissions('configuracion.read', 'catalogos.read'), getTiposDocumentoHandler);

configuracionRoutes.use('/empresas', tenantMiddleware);
configuracionRoutes.get('/empresas', requireAnyPermissions('configuracion.read', 'empresas.read'), getEmpresasHandler);
configuracionRoutes.get('/empresas/:id', requireAnyPermissions('configuracion.read', 'empresas.read'), getEmpresaByIdHandler);
configuracionRoutes.post('/empresas', requirePermissions('empresas.create'), createEmpresaHandler);
configuracionRoutes.patch('/empresas/:id', requirePermissions('empresas.update'), updateEmpresaHandler);
configuracionRoutes.patch('/empresas/:id/estado', requirePermissions('empresas.update'), setEmpresaEstadoHandler);

configuracionRoutes.use('/contratos', tenantMiddleware);
configuracionRoutes.get('/contratos', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read'), getContratosHandler);
configuracionRoutes.get('/contratos/:id', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read'), getContratoByIdHandler);
configuracionRoutes.post('/contratos', requireAnyPermissions('contratos.create', 'contracts.create'), createContratoHandler);
configuracionRoutes.patch('/contratos/:id', requireAnyPermissions('contratos.update', 'contracts.update'), updateContratoHandler);
configuracionRoutes.patch('/contratos/:id/estado', requireAnyPermissions('contratos.update', 'contracts.status.update'), setContratoEstadoHandler);
configuracionRoutes.get(
  '/contratos/:contratoId/ubicaciones-laborales',
  requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read'),
  listContratoUbicacionesLaboralesHandler
);
configuracionRoutes.post(
  '/contratos/:contratoId/ubicaciones-laborales',
  requireAnyPermissions('contratos.update', 'contracts.update'),
  createContratoUbicacionLaboralHandler
);
configuracionRoutes.patch(
  '/contratos/:contratoId/ubicaciones-laborales/:id',
  requireAnyPermissions('contratos.update', 'contracts.update'),
  updateContratoUbicacionLaboralHandler
);
configuracionRoutes.get(
  '/contratos/:contratoId/perfiles-licitacion',
  requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read'),
  listContratoPerfilesLicitacionHandler
);
configuracionRoutes.post(
  '/contratos/:contratoId/perfiles-licitacion',
  requireAnyPermissions('contratos.update', 'contracts.update'),
  createContratoPerfilLicitacionHandler
);
configuracionRoutes.patch(
  '/contratos/:contratoId/perfiles-licitacion/:id',
  requireAnyPermissions('contratos.update', 'contracts.update'),
  updateContratoPerfilLicitacionHandler
);
configuracionRoutes.use('/contratos', contratosLifecycleRoutes);

configuracionRoutes.use('/cargos', tenantMiddleware);
configuracionRoutes.get('/cargos', requireAnyPermissions('configuracion.read', 'cargos.read'), getCargosHandler);
configuracionRoutes.get('/cargos/:id', requireAnyPermissions('configuracion.read', 'cargos.read'), getCargoByIdHandler);
configuracionRoutes.post('/cargos', requirePermissions('cargos.create'), createCargoHandler);
configuracionRoutes.patch('/cargos/:id', requirePermissions('cargos.update'), updateCargoHandler);
configuracionRoutes.patch('/cargos/:id/estado', requirePermissions('cargos.update'), setCargoEstadoHandler);

configuracionRoutes.get('/roles', requireAnyPermissions('configuracion.read', 'roles.read'), getRolesHandler);
configuracionRoutes.get('/permisos', requireAnyPermissions('configuracion.read', 'permisos.read'), getPermissionsHandler);

export { configuracionRoutes };
