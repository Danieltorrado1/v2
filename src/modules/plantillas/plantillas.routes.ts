import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createPlantillaHandler,
  generarPlantillaDocumentoVinculacionHandler,
  generarPlantillaPdfVinculacionHandler,
  generarPlantillaVinculacionHandler,
  getPlantillaHandler,
  getPlantillasGeneradasByVinculacionHandler,
  getPlantillasHandler,
  previewPlantillaVinculacionHandler,
  updatePlantillaHandler
} from './plantillas.controller';

const plantillasRoutes = Router();

plantillasRoutes.use(authMiddleware);
plantillasRoutes.use(tenantMiddleware);

plantillasRoutes.get('/', requirePermissions('plantillas.read'), getPlantillasHandler);
plantillasRoutes.get(
  '/generados/vinculacion/:vinculacion_id',
  requirePermissions('plantillas.read'),
  getPlantillasGeneradasByVinculacionHandler
);
plantillasRoutes.get('/:id', requirePermissions('plantillas.read'), getPlantillaHandler);
plantillasRoutes.post('/', requirePermissions('plantillas.create'), createPlantillaHandler);
plantillasRoutes.patch('/:id', requirePermissions('plantillas.update'), updatePlantillaHandler);
plantillasRoutes.post(
  '/:id/preview/vinculacion/:vinculacion_id',
  requirePermissions('plantillas.read'),
  previewPlantillaVinculacionHandler
);
plantillasRoutes.post(
  '/:id/generar/vinculacion/:vinculacion_id',
  requirePermissions('plantillas.generate'),
  generarPlantillaVinculacionHandler
);
plantillasRoutes.post(
  '/:id/generar/vinculacion/:vinculacion_id/documento',
  requirePermissions('plantillas.generate'),
  generarPlantillaDocumentoVinculacionHandler
);
plantillasRoutes.post(
  '/:id/generar/vinculacion/:vinculacion_id/pdf',
  requirePermissions('plantillas.generate'),
  generarPlantillaPdfVinculacionHandler
);

export { plantillasRoutes };
