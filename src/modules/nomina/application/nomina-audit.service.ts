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
