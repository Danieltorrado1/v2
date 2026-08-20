const cron = require('node-cron') as { schedule: (expression: string, task: () => void) => unknown };

import { dbQuery } from '../config/db';
import { generateAlertas } from '../modules/alertas/alertas.service';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { recalculateCobertura } from '../modules/cobertura/cobertura.service';
import { resolveJobExecutionContext } from './job.utils';

const COBERTURA_CRON_EXPRESSION = '0 7 * * *';

interface ActiveContratoRow {
  id: string;
}

interface CoberturaSummaryRow {
  faltantes_total: string;
  sobrecobertura_total: string;
}

export const runCoberturaJobNow = async (
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<{
  alertas: Awaited<ReturnType<typeof generateAlertas>>;
  contratos_procesados: number;
  executed_at: string;
  faltantes_total: number;
  recalculate_results: Awaited<ReturnType<typeof recalculateCobertura>>[];
  sobrecobertura_total: number;
}> => {
  try {
    const context = await resolveJobExecutionContext('cobertura', actorUserId, auditMeta);

    const contratosResult = await dbQuery<ActiveContratoRow>(
      `
        SELECT c.id::text AS id
        FROM contratos c
        WHERE COALESCE(c.aplica_cobertura, FALSE) = TRUE
          AND COALESCE(c.activo, TRUE) = TRUE
        ORDER BY c.created_at ASC NULLS LAST, c.id ASC
      `
    );

    const recalculateResults: Awaited<ReturnType<typeof recalculateCobertura>>[] = [];

    for (const contrato of contratosResult.rows) {
      const recalculated = await recalculateCobertura(contrato.id, context.actorUserId);
      recalculateResults.push(recalculated);
    }

    const coverageSummaryResult = await dbQuery<CoberturaSummaryRow>(
      `
        WITH asignadas AS (
          SELECT
            ca.focalizacion_final_id::text AS focalizacion_final_id,
            SUM(COALESCE(ca.porcentaje_cobertura, 0)) AS cobertura_asignada
          FROM cobertura_asignaciones ca
          WHERE COALESCE(ca.activo, TRUE) = TRUE
          GROUP BY ca.focalizacion_final_id::text
        )
        SELECT
          COUNT(*) FILTER (
            WHERE COALESCE(a.cobertura_asignada, 0) < required.manipuladores_requeridos
          )::text AS faltantes_total,
          COUNT(*) FILTER (
            WHERE COALESCE(a.cobertura_asignada, 0) > required.manipuladores_requeridos
          )::text AS sobrecobertura_total
        FROM focalizacion_final ff
        INNER JOIN contratos c ON c.id = ff.contrato_id
        LEFT JOIN asignadas a ON a.focalizacion_final_id = ff.id::text
        CROSS JOIN LATERAL (
          SELECT
            ff.cobertura_requerida AS manipuladores_requeridos
        ) required
        WHERE COALESCE(ff.activo, TRUE) = TRUE
          AND COALESCE(c.aplica_cobertura, FALSE) = TRUE
          AND COALESCE(c.activo, TRUE) = TRUE
          AND COALESCE(ff.cobertura_estado, 'OK') <> 'SIN_REGLA_COBERTURA'
          AND ff.cobertura_requerida IS NOT NULL
      `
    );

    const summaryRow = coverageSummaryResult.rows[0];
    const alertas = await generateAlertas(
      {
        tipos_alerta: ['COBERTURA_INSUFICIENTE', 'SOBRECOBERTURA']
      },
      context.actorUserId,
      context.auditMeta
    );

    const response = {
      executed_at: new Date().toISOString(),
      contratos_procesados: contratosResult.rows.length,
      recalculate_results: recalculateResults,
      faltantes_total: Number(summaryRow?.faltantes_total ?? 0),
      sobrecobertura_total: Number(summaryRow?.sobrecobertura_total ?? 0),
      alertas
    };

    console.log('[jobs.cobertura] Job executed successfully.', response);
    return response;
  } catch (error) {
    console.error('[jobs.cobertura] Job execution failed:', error);
    throw error;
  }
};

export const registerCoberturaJob = (): void => {
  cron.schedule(COBERTURA_CRON_EXPRESSION, () => {
    void runCoberturaJobNow().catch(() => undefined);
  });

  console.log(
    `[jobs.cobertura] Registered cron job with schedule "${COBERTURA_CRON_EXPRESSION}".`
  );
};
