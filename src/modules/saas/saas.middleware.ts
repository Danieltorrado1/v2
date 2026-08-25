import type { NextFunction, Request, Response } from 'express';
import { dbQuery } from '../../config/db';
import { AppError } from '../../utils/AppError';
import { assertEmpresaModuleEnabled } from './saas.service';

async function resolveEmpresaId(req: Request): Promise<number> {
  const direct = req.params.empresaId ?? req.query.empresa_id ?? req.body?.empresa_id;
  if (direct && Number.isInteger(Number(direct))) return Number(direct);
  const contrato = req.params.contratoId ?? req.params.contrato_id ?? req.query.contrato_id ?? req.body?.contrato_id;
  if (contrato) {
    const row = (await dbQuery<{empresa_id:string}>('SELECT empresa_id::text FROM contratos WHERE id=$1::bigint',[contrato])).rows[0];
    if (row) return Number(row.empresa_id);
  }
  const periodo = req.params.periodoId ?? req.params.periodo_id ?? req.query.periodo_id ?? req.body?.periodo_id;
  if (periodo) {
    const row=(await dbQuery<{empresa_id:string}>('SELECT c.empresa_id::text empresa_id FROM nomina_periodos np INNER JOIN contratos c ON c.id=np.contrato_id WHERE np.id=$1::bigint',[periodo])).rows[0];
    if(row)return Number(row.empresa_id);
  }
  if (req.tenant && !req.tenant.isGlobalAdmin && req.tenant.empresaIds.length === 1) return req.tenant.empresaIds[0]!;
  throw new AppError('Company context is required for module access',400,'EMPRESA_CONTEXT_REQUIRED');
}

export const requireModule = (code: string) => async (req:Request,_res:Response,next:NextFunction) => {
  try { const empresaId=await resolveEmpresaId(req); await assertEmpresaModuleEnabled(empresaId,code,req.tenant); next(); }
  catch(error){next(error);}
};
