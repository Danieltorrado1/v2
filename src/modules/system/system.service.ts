import { randomUUID } from 'node:crypto';

import { JobName, runJobNow } from '../../jobs/jobs.index';
import { AuditRequestMeta, registerAuditEntry } from '../auditoria/auditoria.helper';

export const runSystemJob = async (
  jobName: JobName,
  actorUserId: string,
  auditMeta?: AuditRequestMeta
): Promise<Awaited<ReturnType<typeof runJobNow>>> => {
  const result = await runJobNow(jobName, actorUserId, auditMeta);

  await registerAuditEntry({
    usuario_id: actorUserId,
    accion: 'RECALCULAR',
    tabla: 'system_jobs',
    registro_id: randomUUID(),
    descripcion: `Ejecucion manual del job interno ${jobName}`,
    after: {
      job_name: jobName,
      result
    },
    ip: auditMeta?.ip ?? null,
    user_agent: auditMeta?.user_agent ?? null
  });

  return result;
};
