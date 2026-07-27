import cron from 'node-cron';

import { dbQuery } from '../config/db';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { resolveJobExecutionContext } from './job.utils';

const SST_CRON_EXPRESSION = '0 8 * * *';

interface SstPlanSummaryRow {
  planes_vencidos: string;
}

const getCurrentMonthRange = (): { fecha_desde: string; fecha_hasta: string } => {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  return {
    fecha_desde: start.toISOString().slice(0, 10),
    fecha_hasta: now.toISOString().slice(0, 10)
  };
};

export const runSstJobNow = async (
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<{
  executed_at: string;
  indicadores_generados: number;
  indicadores_resultado: Array<{ status: 'disabled'; reason: string }>;
  planes_vencidos: number;
}> => {
  try {
    await resolveJobExecutionContext('sst', actorUserId, auditMeta);
    getCurrentMonthRange();

    const planSummaryResult = await dbQuery<SstPlanSummaryRow>(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(activo, TRUE) = TRUE
              AND estado <> 'CERRADO'
              AND fecha_compromiso < CURRENT_DATE
          )::text AS planes_vencidos
        FROM sst_planes_accion
      `
    );

    const indicadoresResultado = [
      {
        status: 'disabled' as const,
        reason:
          'SST automatic indicator calculation was disabled on July 16, 2026 while the module was aligned to sst_indicadores, sst_indicadores_periodos, and sst_indicador_mediciones.'
      }
    ];

    const response = {
      executed_at: new Date().toISOString(),
      planes_vencidos: Number(planSummaryResult.rows[0]?.planes_vencidos ?? 0),
      indicadores_generados: 0,
      indicadores_resultado: indicadoresResultado
    };

    console.log('[jobs.sst] Job executed successfully.', response);
    return response;
  } catch (error) {
    console.error('[jobs.sst] Job execution failed:', error);
    throw error;
  }
};

export const registerSstJob = (): void => {
  cron.schedule(SST_CRON_EXPRESSION, () => {
    void runSstJobNow().catch(() => undefined);
  });

  console.log(`[jobs.sst] Registered cron job with schedule "${SST_CRON_EXPRESSION}".`);
};
