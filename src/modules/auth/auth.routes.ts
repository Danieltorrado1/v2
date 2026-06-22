import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { login, me } from './auth.controller';

const authRouter = Router();

authRouter.post('/login', login);
authRouter.get('/me', authMiddleware, me);

export { authRouter };
