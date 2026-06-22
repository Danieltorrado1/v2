import cron from 'node-cron';

import { dbQuery } from '../config/db';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { calculateSstIndicadores } from '../modules/sst/sst.service';
import { resolveJobExecutionContext } from './job.utils';

const SST_CRON_EXPRESSION = '0 8 * * *';

interface SstPlanSummaryRow {
  planes_vencidos: string;
}

interface SstScopeRow {
  contrato_id: string | null;
  empresa_id: string | null;
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
  indicadores_resultado: Awaited<ReturnType<typeof calculateSstIndicadores>>[];
  planes_vencidos: number;
}> => {
  try {
    const context = await resolveJobExecutionContext('sst', actorUserId, auditMeta);
    const range = getCurrentMonthRange();

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

    const scopeResult = await dbQuery<SstScopeRow>(
      `
        SELECT DISTINCT
          se.empresa_id::text AS empresa_id,
          se.contrato_id::text AS contrato_id
        FROM sst_eventos se
        WHERE se.fecha_evento >= $1
          AND se.fecha_evento <= $2
          AND COALESCE(se.activo, TRUE) = TRUE
      `,
      [range.fecha_desde, range.fecha_hasta]
    );

    const scopes =
      scopeResult.rows.length > 0
        ? scopeResult.rows
        : [{ empresa_id: null, contrato_id: null }];
    const indicadoresResultado: Awaited<ReturnType<typeof calculateSstIndicadores>>[] = [];

    for (const scope of scopes) {
      const indicador = await calculateSstIndicadores(
        {
          empresa_id: scope.empresa_id,
          contrato_id: scope.contrato_id,
          fecha_desde: range.fecha_desde,
          fecha_hasta: range.fecha_hasta
        },
        context.actorUserId,
        context.auditMeta
      );

      indicadoresResultado.push(indicador);
    }

    const response = {
      executed_at: new Date().toISOString(),
      planes_vencidos: Number(planSummaryResult.rows[0]?.planes_vencidos ?? 0),
      indicadores_generados: indicadoresResultado.length,
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
