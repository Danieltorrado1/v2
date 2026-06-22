import cron from 'node-cron';

import { generateAlertas } from '../modules/alertas/alertas.service';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { resolveJobExecutionContext } from './job.utils';

const ALERTAS_CRON_EXPRESSION = '0 6 * * *';

export const runAlertasJobNow = async (
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<{
  alerts: Awaited<ReturnType<typeof generateAlertas>>;
  executed_at: string;
}> => {
  try {
    const context = await resolveJobExecutionContext('alertas', actorUserId, auditMeta);
    const alerts = await generateAlertas(
      {
        tipos_alerta: [
          'DOCUMENTO_VENCIDO',
          'DOCUMENTO_POR_VENCER',
          'CONTRATO_POR_VENCER',
          'PLAN_SST_VENCIDO',
          'PLAN_SST_POR_VENCER'
        ]
      },
      context.actorUserId,
      context.auditMeta
    );

    const result = {
      executed_at: new Date().toISOString(),
      alerts
    };

    console.log('[jobs.alertas] Job executed successfully.', result);
    return result;
  } catch (error) {
    console.error('[jobs.alertas] Job execution failed:', error);
    throw error;
  }
};

export const registerAlertasJob = (): void => {
  cron.schedule(ALERTAS_CRON_EXPRESSION, () => {
    void runAlertasJobNow().catch(() => undefined);
  });

  console.log(
    `[jobs.alertas] Registered cron job with schedule "${ALERTAS_CRON_EXPRESSION}".`
  );
};
