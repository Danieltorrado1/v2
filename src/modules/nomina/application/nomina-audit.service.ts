import type { PoolClient } from 'pg';

import { registerAuditEntry, type AuditRequestMeta } from '../../auditoria/auditoria.helper';

export const recordNominaAudit = async (
  client: PoolClient,
  periodoId: string,
  actorUserId: string,
  action: string,
  payload?: Record<string, unknown>,
  auditMeta?: AuditRequestMeta
): Promise<void> => {
  await registerAuditEntry({
    client,
    usuario_id: actorUserId,
    accion: action,
    tabla: 'nomina_periodos',
    registro_id: periodoId,
    descripcion: `Auditoria de nomina ${action}`,
    before: payload?.before ?? null,
    after: payload?.after ?? payload ?? null,
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });
};

/**
 * Strict audit path for the controlled correction runner. It intentionally
 * writes only the two audit tables required by that runner and propagates any
 * database error so the caller can roll back the employee transaction.
 */
export const recordNominaAuditStrict = async (
  client: PoolClient,
  input: {
    actorUserId: string;
    empresaId: string;
    contratoId: string;
    periodoId: string;
    empleadoId: string;
    runId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }
): Promise<void> => {
  const action = 'NOMINA_RECALCULO_CONTROLADO_234';
  const description = `Recálculo controlado de nómina; run_id=${input.runId}`;
  await client.query(
    `INSERT INTO auditoria_eventos (
       usuario_id, empresa_id, contrato_id, modulo, entidad, entidad_id,
       accion, descripcion, datos_anteriores, datos_nuevos, ip_address, user_agent
     ) VALUES ($1::bigint,$2::bigint,$3::bigint,'NOMINA','nomina_empleados',$4::text,
       $5,$6,$7::jsonb,$8::jsonb,NULL,NULL)`,
    [input.actorUserId, input.empresaId, input.contratoId, input.empleadoId, action, description, JSON.stringify(input.before), JSON.stringify(input.after)]
  );
  await client.query(
    `INSERT INTO auditoria (
       usuario_id, accion, tabla_afectada, registro_id, descripcion,
       datos_anteriores, datos_nuevos, ip, user_agent
     ) VALUES ($1::bigint,$2,'nomina_empleados',$3::bigint,$4,$5::jsonb,$6::jsonb,NULL,NULL)`,
    [input.actorUserId, action, input.empleadoId, description, JSON.stringify(input.before), JSON.stringify(input.after)]
  );
};
