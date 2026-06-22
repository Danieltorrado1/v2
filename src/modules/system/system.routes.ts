import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  runAlertasJobHandler,
  runCoberturaJobHandler,
  runDocumentosJobHandler,
  runNominaJobHandler,
  runSstJobHandler
} from './system.controller';

const systemRoutes = Router();

systemRoutes.use(authMiddleware);
systemRoutes.use(requirePermissions('system.jobs.run'));

systemRoutes.post('/jobs/alertas/run', runAlertasJobHandler);
systemRoutes.post('/jobs/documentos/run', runDocumentosJobHandler);
systemRoutes.post('/jobs/cobertura/run', runCoberturaJobHandler);
systemRoutes.post('/jobs/nomina/run', runNominaJobHandler);
systemRoutes.post('/jobs/sst/run', runSstJobHandler);

export { systemRoutes };
