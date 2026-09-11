import multer from 'multer';
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requireAnyPermissions } from '../../middlewares/roleMiddleware';
import { requireModule } from '../saas/saas.middleware';
import {
  confirmImportHandler,
  createInstitutionHandler,
  createSedeHandler,
  exportSimatHandler,
  getInstitutionHandler,
  getSedeHandler,
  getSimatHandler,
  listImportsHandler,
  listSimatHandler,
  statsHandler,
  updateInstitutionHandler,
  updateSedeHandler,
  validateImportHandler,
} from './operacion.controller';
import { getInstitucionesHandler } from './operacion.instituciones.controller';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.use(
  authMiddleware,
  tenantMiddleware,
  requireModule('OPERACION'),
);

const read = requireAnyPermissions(
  'operacion.instituciones.read',
  'operacion.simat.read',
  'operacion.read',
  'vinculaciones.read',
);

/*
 * Nuevo listado operativo:
 * filtros + búsqueda + paginación + sede/modalidad/cupos.
 */
router.get('/instituciones', read, getInstitucionesHandler);

/*
 * Expediente / CRUD institucional existente.
 */
router.get('/instituciones/:id', read, getInstitutionHandler);
router.get('/instituciones/:id/sedes', read, getInstitutionHandler);

router.post(
  '/instituciones/:id/sedes',
  requireAnyPermissions(
    'operacion.instituciones.write',
    'operacion.read',
  ),
  createSedeHandler,
);

router.get(
  '/sedes/:id',
  read,
  getSedeHandler,
);

router.patch(
  '/sedes/:id',
  requireAnyPermissions(
    'operacion.instituciones.write',
    'operacion.read',
  ),
  updateSedeHandler,
);

router.post(
  '/instituciones',
  requireAnyPermissions(
    'operacion.instituciones.write',
    'operacion.read',
  ),
  createInstitutionHandler,
);

router.patch(
  '/instituciones/:id',
  requireAnyPermissions(
    'operacion.instituciones.write',
    'operacion.read',
  ),
  updateInstitutionHandler,
);

/*
 * Estadísticas.
 */
router.get(
  '/estadisticas',
  requireAnyPermissions(
    'operacion.estadisticas.read',
    'operacion.read',
  ),
  statsHandler,
);

/*
 * SIMAT.
 */
router.get(
  '/simat',
  requireAnyPermissions(
    'operacion.simat.read',
    'operacion.read',
  ),
  listSimatHandler,
);

router.get(
  '/simat/export',
  requireAnyPermissions('operacion.simat.export'),
  exportSimatHandler,
);

router.get(
  '/simat/importaciones',
  requireAnyPermissions(
    'operacion.simat.read',
    'operacion.read',
  ),
  listImportsHandler,
);

router.get(
  '/simat/:id',
  requireAnyPermissions(
    'operacion.simat.read',
    'operacion.read',
  ),
  getSimatHandler,
);

router.post(
  '/simat/import/validate',
  requireAnyPermissions(
    'operacion.simat.import',
    'operacion.read',
  ),
  upload.single('file'),
  validateImportHandler,
);

router.post(
  '/simat/import',
  requireAnyPermissions(
    'operacion.simat.import',
    'operacion.read',
  ),
  upload.single('file'),
  confirmImportHandler,
);

export { router as operacionRoutes };