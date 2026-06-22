import cron from 'node-cron';

import { dbQuery } from '../config/db';
import { generateAlertas } from '../modules/alertas/alertas.service';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { resolveJobExecutionContext } from './job.utils';

const NOMINA_CRON_EXPRESSION = '30 7 * * *';

interface NominaSummaryRow {
  liquidaciones_preliminares_pendientes: string;
  periodos_abiertos_vencidos: string;
}

export const runNominaJobNow = async (
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<{
  alertas: Awaited<ReturnType<typeof generateAlertas>>;
  executed_at: string;
  liquidaciones_preliminares_pendientes: number;
  periodos_abiertos_vencidos: number;
}> => {
  try {
    const context = await resolveJobExecutionContext('nomina', actorUserId, auditMeta);

    const summaryResult = await dbQuery<NominaSummaryRow>(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE np.estado = 'ABIERTO'
              AND np.fecha_fin < CURRENT_DATE
          )::text AS periodos_abiertos_vencidos,
          COUNT(*) FILTER (
            WHERE np.estado = 'ABIERTO'
              AND COALESCE(np.estado_liquidacion, 'PRELIMINAR') = 'PRELIMINAR'
          )::text AS liquidaciones_preliminares_pendientes
        FROM nomina_periodos np
      `
    );

    const row = summaryResult.rows[0];
    const alertas = await generateAlertas(
      {
        tipos_alerta: ['NOMINA_PENDIENTE', 'NOMINA_PERIODO_ABIERTO']
      },
      context.actorUserId,
      context.auditMeta
    );

    const response = {
      executed_at: new Date().toISOString(),
      periodos_abiertos_vencidos: Number(row?.periodos_abiertos_vencidos ?? 0),
      liquidaciones_preliminares_pendientes: Number(
        row?.liquidaciones_preliminares_pendientes ?? 0
      ),
      alertas
    };

    console.log('[jobs.nomina] Job executed successfully.', response);
    return response;
  } catch (error) {
    console.error('[jobs.nomina] Job execution failed:', error);
    throw error;
  }
};

export const registerNominaJob = (): void => {
  cron.schedule(NOMINA_CRON_EXPRESSION, () => {
    void runNominaJobNow().catch(() => undefined);
  });

  console.log(
    `[jobs.nomina] Registered cron job with schedule "${NOMINA_CRON_EXPRESSION}".`
  );
};
