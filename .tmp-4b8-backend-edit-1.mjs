import { readFileSync, writeFileSync } from 'node:fs';

function replaceOne(path, search, replacement) {
  const source = readFileSync(path, 'utf8');
  if (!source.includes(search)) {
    throw new Error(`Pattern not found in ${path}: ${search.slice(0, 80)}`);
  }
  writeFileSync(path, source.replace(search, replacement));
}

function write(path, content) {
  writeFileSync(path, content);
}

replaceOne(
  'src/modules/nomina/nomina.schemas.ts',
  "export const nominaPeriodoActionSchema = z.object({\r\n  force: z.coerce.boolean().optional().default(false)\r\n});",
  "export const nominaPeriodoActionSchema = z.object({\r\n  force: z.coerce.boolean().optional().default(false)\r\n});\r\n\r\nexport const nominaEmpleadoReaperturaSchema = z\r\n  .object({\r\n    motivo: trimmedStringSchema\r\n  })\r\n  .strict();"
);

replaceOne(
  'src/modules/nomina/nomina.schemas.ts',
  "  observacion: nullableTrimmedStringSchema.optional().default(null),\r\n  revisado: z.coerce.boolean().optional().default(false),",
  "  observacion: nullableTrimmedStringSchema.optional().default(null),\r\n  reemplazar_asistencia_confirmado: z.coerce.boolean().optional().default(false),\r\n  revisado: z.coerce.boolean().optional().default(false),"
);

replaceOne(
  'src/modules/nomina/nomina.schemas.ts',
  "  observacion: nullableTrimmedStringSchema.optional(),\r\n  revisado: z.coerce.boolean().optional(),",
  "  observacion: nullableTrimmedStringSchema.optional(),\r\n  reemplazar_asistencia_confirmado: z.coerce.boolean().optional(),\r\n  revisado: z.coerce.boolean().optional(),"
);

replaceOne(
  'src/modules/nomina/nomina.schemas.ts',
  "export type ListNominaPeriodosQuery = z.infer<typeof listNominaPeriodosQuerySchema>;\r\nexport type NominaPeriodoActionInput = z.infer<typeof nominaPeriodoActionSchema>;",
  "export type ListNominaPeriodosQuery = z.infer<typeof listNominaPeriodosQuerySchema>;\r\nexport type NominaPeriodoActionInput = z.infer<typeof nominaPeriodoActionSchema>;\r\nexport type NominaEmpleadoReaperturaInput = z.infer<typeof nominaEmpleadoReaperturaSchema>;"
);

write(
  'src/modules/nomina/revision-operativa.service.ts',
  `import { dbPool } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import {
  assertNominaEmpleadoEditable,
  loadNominaEmpleadoOperativoContextByIdOrThrow,
  normalizeNominaEmpleadoOperativoEstado,
  syncNominaEmpleadoOperativoEstado,
  type NominaEmpleadoOperativoEstado
} from './nomina.operativa';

export type RevisionOperativaEstado = 'PENDIENTE' | 'REVISADO' | 'REQUIERE_REVISION';

export interface NominaEmpleadoOperativoState {
  nomina_empleado_id: string;
  periodo_id: string;
  persona_id: string;
  vinculacion_id: string;
  estado: NominaEmpleadoOperativoEstado;
  revision_estado: RevisionOperativaEstado;
  revisado: boolean;
  revisado_at: string | null;
  invalidado_at: string | null;
  motivo_invalidacion: string | null;
}

const mapOperativeState = (
  input: {
    nomina_empleado_id: string;
    periodo_id: string;
    persona_id: string;
    vinculacion_id: string;
    estado: string | null;
    revision_estado?: RevisionOperativaEstado | null;
    revisado?: boolean | null;
    revisado_at?: Date | string | null;
    invalidado_at?: Date | string | null;
    motivo_invalidacion?: string | null;
  }
): NominaEmpleadoOperativoState => ({
  nomina_empleado_id: input.nomina_empleado_id,
  periodo_id: input.periodo_id,
  persona_id: input.persona_id,
  vinculacion_id: input.vinculacion_id,
  estado: normalizeNominaEmpleadoOperativoEstado(input.estado),
  revision_estado: input.revision_estado ?? 'PENDIENTE',
  revisado: input.revisado === true || normalizeNominaEmpleadoOperativoEstado(input.estado) !== 'PENDIENTE',
  revisado_at:
    input.revisado_at instanceof Date
      ? input.revisado_at.toISOString()
      : input.revisado_at
        ? String(input.revisado_at)
        : null,
  invalidado_at:
    input.invalidado_at instanceof Date
      ? input.invalidado_at.toISOString()
      : input.invalidado_at
        ? String(input.invalidado_at)
        : null,
  motivo_invalidacion: input.motivo_invalidacion ?? null
});

export async function listRevisionOperativa(periodoId: string, _tenant?: TenantAccessContext) {
  const result = await dbPool.query(`
    SELECT ne.id::text AS nomina_empleado_id, ne.periodo_id::text, v.persona_id::text,
      v.id::text AS vinculacion_id, COALESCE(ro.estado_revision,'PENDIENTE') AS estado_revision,
      ro.revisado_por::text, ro.revisado_at, ro.invalidado_at, ro.motivo_invalidacion,
      ne.estado AS nomina_estado, ne.revisado AS nomina_revisado
    FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id
    LEFT JOIN nomina_revision_operativa ro ON ro.periodo_id=ne.periodo_id AND ro.nomina_empleado_id=ne.id
    WHERE ne.periodo_id=$1::bigint ORDER BY ne.id`, [periodoId]);
  return result.rows;
}

export async function updateRevisionOperativa(periodoId: string, nominaEmpleadoId: string, estado: RevisionOperativaEstado, actorUserId: string, _tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const employee = await loadNominaEmpleadoOperativoContextByIdOrThrow(client, nominaEmpleadoId);
    if (employee.periodo_id !== periodoId) throw new AppError('Trabajador no pertenece al periodo',404,'NOMINA_EMPLEADO_NOT_FOUND');
    if (!['ABIERTO','EN_PROCESO'].includes(employee.periodo_estado)) throw new AppError('El periodo no permite revision operativa',409,'NOMINA_PERIODO_CERRADO');
    assertNominaEmpleadoEditable(employee, 'modificar la revision operativa');
    const current = await client.query('SELECT * FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint',[periodoId,nominaEmpleadoId]);
    const result = await client.query(`INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,revisado_por,revisado_at,invalidado_por,invalidado_at,motivo_invalidacion,version_revision,updated_at)
      VALUES($1::bigint,$2::bigint,$3::bigint,$4::bigint,$5,
        CASE WHEN $5='REVISADO' THEN $6::bigint ELSE NULL END,
        CASE WHEN $5='REVISADO' THEN NOW() ELSE NULL END,
        CASE WHEN $5<>'REVISADO' THEN $6::bigint ELSE NULL END,
        CASE WHEN $5<>'REVISADO' THEN NOW() ELSE NULL END,
        CASE WHEN $5='REQUIERE_REVISION' THEN 'ACTUALIZACION_OPERATIVA' ELSE NULL END,
        COALESCE((SELECT version_revision+1 FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint),0),NOW())
      ON CONFLICT(periodo_id,nomina_empleado_id) DO UPDATE SET estado_revision=EXCLUDED.estado_revision,revisado_por=EXCLUDED.revisado_por,revisado_at=EXCLUDED.revisado_at,invalidado_por=EXCLUDED.invalidado_por,invalidado_at=EXCLUDED.invalidado_at,motivo_invalidacion=EXCLUDED.motivo_invalidacion,version_revision=nomina_revision_operativa.version_revision+1,updated_at=NOW() RETURNING *`,[periodoId,nominaEmpleadoId,employee.persona_id,employee.vinculacion_id,estado,actorUserId]);
    await syncNominaEmpleadoOperativoEstado(client, nominaEmpleadoId, estado === 'REVISADO' ? 'REVISADO' : 'PENDIENTE');
    await registerAuditEntry({client,usuario_id:actorUserId,accion:'NOMINA_REVISION_OPERATIVA_UPDATE',tabla:'nomina_revision_operativa',registro_id:String(result.rows[0].id),descripcion:'Actualizacion checklist revision operativa',before:current.rows[0]??null,after:result.rows[0],ip:auditMeta?.ip??null,user_agent:auditMeta?.user_agent??null});
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function closeNominaEmpleadoOperativo(periodoId: string, nominaEmpleadoId: string, actorUserId: string, _tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta): Promise<NominaEmpleadoOperativoState> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const employee = await loadNominaEmpleadoOperativoContextByIdOrThrow(client, nominaEmpleadoId);
    if (employee.periodo_id !== periodoId) throw new AppError('Trabajador no pertenece al periodo',404,'NOMINA_EMPLEADO_NOT_FOUND');
    if (!['ABIERTO','EN_PROCESO'].includes(employee.periodo_estado)) throw new AppError('El periodo no permite cierre individual',409,'NOMINA_PERIODO_CERRADO');
    assertNominaEmpleadoEditable(employee, 'cerrar la nomina');
    if (normalizeNominaEmpleadoOperativoEstado(employee.estado) !== 'REVISADO' || employee.revision_estado !== 'REVISADO') {
      throw new AppError('La nomina individual solo puede cerrarse cuando el trabajador esta revisado.',409,'NOMINA_EMPLEADO_REQUIERE_REVISION');
    }
    const before = mapOperativeState(employee);
    await syncNominaEmpleadoOperativoEstado(client, nominaEmpleadoId, 'CERRADO');
    const after = mapOperativeState({ ...employee, estado: 'CERRADO', revisado: true, revision_estado: 'REVISADO' });
    await registerAuditEntry({client,usuario_id:actorUserId,accion:'NOMINA_EMPLEADO_CLOSE',tabla:'nomina_empleados',registro_id:nominaEmpleadoId,descripcion:'Cierre individual de nomina operativa',before,after,ip:auditMeta?.ip??null,user_agent:auditMeta?.user_agent??null});
    await client.query('COMMIT');
    return after;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reopenNominaEmpleadoOperativo(periodoId: string, nominaEmpleadoId: string, motivo: string, actorUserId: string, _tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta): Promise<NominaEmpleadoOperativoState> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const employee = await loadNominaEmpleadoOperativoContextByIdOrThrow(client, nominaEmpleadoId);
    if (employee.periodo_id !== periodoId) throw new AppError('Trabajador no pertenece al periodo',404,'NOMINA_EMPLEADO_NOT_FOUND');
    if (!['ABIERTO','EN_PROCESO'].includes(employee.periodo_estado)) throw new AppError('El periodo no permite reapertura individual',409,'NOMINA_PERIODO_CERRADO');
    if (normalizeNominaEmpleadoOperativoEstado(employee.estado) !== 'CERRADO') {
      throw new AppError('La nomina individual no se encuentra cerrada.',409,'NOMINA_EMPLEADO_NO_CERRADO');
    }
    const current = await client.query('SELECT * FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint',[periodoId,nominaEmpleadoId]);
    const before = mapOperativeState(employee);
    await syncNominaEmpleadoOperativoEstado(client, nominaEmpleadoId, 'PENDIENTE');
    await client.query(`INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,revisado_por,revisado_at,invalidado_por,invalidado_at,motivo_invalidacion,version_revision,updated_at)
      VALUES($1::bigint,$2::bigint,$3::bigint,$4::bigint,'PENDIENTE',NULL,NULL,$5::bigint,NOW(),$6,COALESCE((SELECT version_revision+1 FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint),0),NOW())
      ON CONFLICT(periodo_id,nomina_empleado_id) DO UPDATE SET estado_revision='PENDIENTE',revisado_por=NULL,revisado_at=NULL,invalidado_por=$5::bigint,invalidado_at=NOW(),motivo_invalidacion=$6,version_revision=nomina_revision_operativa.version_revision+1,updated_at=NOW()`,[periodoId,nominaEmpleadoId,employee.persona_id,employee.vinculacion_id,actorUserId,motivo]);
    const after = mapOperativeState({ ...employee, estado: 'PENDIENTE', revisado: false, revision_estado: 'PENDIENTE', invalidado_at: new Date().toISOString(), motivo_invalidacion: motivo });
    await registerAuditEntry({client,usuario_id:actorUserId,accion:'NOMINA_EMPLEADO_REOPEN',tabla:'nomina_empleados',registro_id:nominaEmpleadoId,descripcion:`Reapertura individual de nomina operativa: ${motivo}`,before,after,ip:auditMeta?.ip??null,user_agent:auditMeta?.user_agent??null});
    await registerAuditEntry({client,usuario_id:actorUserId,accion:'NOMINA_REVISION_OPERATIVA_UPDATE',tabla:'nomina_revision_operativa',registro_id:String(current.rows[0]?.id ?? nominaEmpleadoId),descripcion:'Reapertura individual reinicia revision operativa',before:current.rows[0]??null,after:{...current.rows[0],estado_revision:'PENDIENTE',motivo_invalidacion:motivo},ip:auditMeta?.ip??null,user_agent:auditMeta?.user_agent??null});
    await client.query('COMMIT');
    return after;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
`
);

write(
  'src/modules/nomina/revision-operativa.controller.ts',
  `import { Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { nominaEmpleadoReaperturaSchema } from './nomina.schemas';
import {
  closeNominaEmpleadoOperativo,
  listRevisionOperativa,
  reopenNominaEmpleadoOperativo,
  updateRevisionOperativa,
  type RevisionOperativaEstado
} from './revision-operativa.service';

const actor = (req: Request) => { if (!req.user?.userId) throw new AppError('Authentication required',401,'UNAUTHORIZED'); return req.user.userId; };
export const listRevisionOperativaHandler = asyncHandler(async (req: Request,res: Response) => { const data=await listRevisionOperativa(String(req.params.periodo_id),req.tenant); return successResponse(res,{data,message:'Revision operativa retrieved successfully'}); });
export const updateRevisionOperativaHandler = asyncHandler(async (req: Request,res: Response) => { const estado=req.body?.estado_revision as RevisionOperativaEstado; if(!['PENDIENTE','REVISADO','REQUIERE_REVISION'].includes(estado)) throw new AppError('Estado de revision invalido',400,'NOMINA_REVISION_ESTADO_INVALIDO'); const data=await updateRevisionOperativa(String(req.params.periodo_id),String(req.params.nomina_empleado_id),estado,actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Revision operativa updated successfully'}); });
export const closeNominaEmpleadoOperativoHandler = asyncHandler(async (req: Request,res: Response) => { const data=await closeNominaEmpleadoOperativo(String(req.params.periodo_id),String(req.params.nomina_empleado_id),actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Payroll employee closed successfully'}); });
export const reopenNominaEmpleadoOperativoHandler = asyncHandler(async (req: Request,res: Response) => { const input=nominaEmpleadoReaperturaSchema.parse(req.body ?? {}); const data=await reopenNominaEmpleadoOperativo(String(req.params.periodo_id),String(req.params.nomina_empleado_id),input.motivo,actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Payroll employee reopened successfully'}); });
`
);

replaceOne(
  'src/modules/nomina/nomina.routes.ts',
  "import { listRevisionOperativaHandler, updateRevisionOperativaHandler } from './revision-operativa.controller';",
  "import { closeNominaEmpleadoOperativoHandler, listRevisionOperativaHandler, reopenNominaEmpleadoOperativoHandler, updateRevisionOperativaHandler } from './revision-operativa.controller';"
);

replaceOne(
  'src/modules/nomina/nomina.routes.ts',
  "nominaRoutes.get('/periodos/:periodo_id/revision-operativa', requirePermissions('nomina.read'), listRevisionOperativaHandler);\r\nnominaRoutes.patch('/periodos/:periodo_id/revision-operativa/:nomina_empleado_id', requirePermissions('nomina.periodos.update'), updateRevisionOperativaHandler);",
  "nominaRoutes.get('/periodos/:periodo_id/revision-operativa', requirePermissions('nomina.read'), listRevisionOperativaHandler);\r\nnominaRoutes.patch('/periodos/:periodo_id/revision-operativa/:nomina_empleado_id', requirePermissions('nomina.periodos.update'), updateRevisionOperativaHandler);\r\nnominaRoutes.post('/periodos/:periodo_id/cierre-operativo/:nomina_empleado_id', requirePermissions('nomina.periodos.close'), closeNominaEmpleadoOperativoHandler);\r\nnominaRoutes.post('/periodos/:periodo_id/reapertura-operativa/:nomina_empleado_id', requirePermissions('nomina.periodos.reopen'), reopenNominaEmpleadoOperativoHandler);"
);
