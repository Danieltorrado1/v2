import type { Request,Response,NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export const requireOperationalChange = (permission='nomina.movimientos.create') =>
  (req:Request,_res:Response,next:NextFunction) => {
    const roles=req.user?.roles??[];
    const allowed=!roles.includes('GESTOR') && (roles.includes('ADMINISTRADOR')
      || (roles.includes('TALENTO_HUMANO') && req.user?.permissions.includes(permission)));
    next(allowed?undefined:new AppError('Sin permiso efectivo para cambiar modalidad',403,'FORBIDDEN'));
  };
