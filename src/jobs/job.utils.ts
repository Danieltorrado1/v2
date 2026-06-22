import { dbQuery } from '../config/db';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { AppError } from '../utils/AppError';

interface ActiveUserRow {
  id: string;
}

export interface JobExecutionContext {
  actorUserId: string;
  auditMeta: AuditRequestMeta;
  source: 'manual' | 'scheduler';
}

export const resolveJobExecutionContext = async (
  jobName: string,
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<JobExecutionContext> => {
  if (actorUserId) {
    return {
      actorUserId,
      auditMeta: auditMeta ?? {
        ip: 'manual',
        user_agent: `manual/${jobName}`
      },
      source: 'manual'
    };
  }

  const result = await dbQuery<ActiveUserRow>(
    `
      SELECT u.id::text AS id
      FROM usuarios u
      WHERE COALESCE(u.activo, TRUE) = TRUE
      ORDER BY u.created_at ASC NULLS LAST, u.id ASC
      LIMIT 1
    `
  );

  const fallbackUser = result.rows[0];

  if (!fallbackUser) {
    throw new AppError(
      'At least one active user is required to execute scheduled jobs',
      500,
      'JOB_USER_NOT_AVAILABLE'
    );
  }

  return {
    actorUserId: fallbackUser.id,
    auditMeta: {
      ip: 'scheduler',
      user_agent: `scheduler/${jobName}`
    },
    source: 'scheduler'
  };
};
