import { dbPool } from '../../config/db';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { registerAuditEntry, type AuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';

export type RevisionOperativaEstado = 'PENDIENTE' | 'REVISADO' | 'REQUIERE_REVISION';

export async function listRevisionOperativa(periodoId: string, _tenant?: TenantAccessContext) {
  const result = await dbPool.query(`
    SELECT ne.id::text AS nomina_empleado_id, ne.periodo_id::text, v.persona_id::text,
      v.id::text AS vinculacion_id, COALESCE(ro.estado_revision,'PENDIENTE') AS estado_revision,
      ro.revisado_por::text, ro.revisado_at, ro.invalidado_at, ro.motivo_invalidacion
    FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id
    LEFT JOIN nomina_revision_operativa ro ON ro.periodo_id=ne.periodo_id AND ro.nomina_empleado_id=ne.id
    WHERE ne.periodo_id=$1::bigint ORDER BY ne.id`, [periodoId]);
  return result.rows;
}

export async function updateRevisionOperativa(periodoId: string, nominaEmpleadoId: string, estado: RevisionOperativaEstado, actorUserId: string, _tenant?: TenantAccessContext, auditMeta?: AuditRequestMeta) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const periodo = await client.query<{ estado: string }>('SELECT estado FROM nomina_periodos WHERE id=$1::bigint', [periodoId]);
    if (!periodo.rows[0]) throw new AppError('Periodo no encontrado',404,'NOMINA_PERIODO_NOT_FOUND');
    if (!['ABIERTO','EN_PROCESO'].includes(periodo.rows[0].estado)) throw new AppError('El periodo no permite revisión operativa',409,'NOMINA_PERIODO_CERRADO');
    const employee = await client.query<{persona_id:string; vinculacion_id:string}>('SELECT v.persona_id::text,v.id::text AS vinculacion_id FROM nomina_empleados ne JOIN vinculaciones v ON v.id=ne.vinculacion_id WHERE ne.id=$1::bigint AND ne.periodo_id=$2::bigint',[nominaEmpleadoId,periodoId]);
    if (!employee.rows[0]) throw new AppError('Trabajador no pertenece al periodo',404,'NOMINA_EMPLEADO_NOT_FOUND');
    const current = await client.query('SELECT * FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint',[periodoId,nominaEmpleadoId]);
    const result = await client.query(`INSERT INTO nomina_revision_operativa(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,revisado_por,revisado_at,invalidado_por,invalidado_at,motivo_invalidacion,version_revision,updated_at)
      VALUES($1::bigint,$2::bigint,$3::bigint,$4::bigint,$5,$6::bigint,CASE WHEN $5='REVISADO' THEN NOW() ELSE NULL END,NULL,NULL,NULL,COALESCE((SELECT version_revision+1 FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint),0),NOW())
      ON CONFLICT(periodo_id,nomina_empleado_id) DO UPDATE SET estado_revision=EXCLUDED.estado_revision,revisado_por=EXCLUDED.revisado_por,revisado_at=EXCLUDED.revisado_at,invalidado_por=NULL,invalidado_at=NULL,motivo_invalidacion=NULL,version_revision=nomina_revision_operativa.version_revision+1,updated_at=NOW() RETURNING *`,[periodoId,nominaEmpleadoId,employee.rows[0].persona_id,employee.rows[0].vinculacion_id,estado,actorUserId]);
    await registerAuditEntry({client,usuario_id:actorUserId,accion:'NOMINA_REVISION_OPERATIVA_UPDATE',tabla:'nomina_revision_operativa',registro_id:String(result.rows[0].id),descripcion:'Actualizacion checklist revision operativa',before:current.rows[0]??null,after:result.rows[0],ip:auditMeta?.ip??null,user_agent:auditMeta?.user_agent??null});
    await client.query('COMMIT'); return result.rows[0];
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
