import type { AuthenticatedUser } from '../middlewares/authMiddleware';
import type { TenantAccessContext } from '../middlewares/tenantMiddleware';

export {};

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantAccessContext;
      user?: AuthenticatedUser;
    }
  }
}
