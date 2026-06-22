import { Router } from 'express';

import { getHealthStatus } from './health.controller';

const healthRouter = Router();

healthRouter.get('/', getHealthStatus);

export { healthRouter };
