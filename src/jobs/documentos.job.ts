import cron from 'node-cron';

import { dbQuery } from '../config/db';
import { generateAlertas } from '../modules/alertas/alertas.service';
import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { resolveJobExecutionContext } from './job.utils';

const DOCUMENTOS_CRON_EXPRESSION = '30 6 * * *';

interface DocumentStatusRow {
  total_documentos: string;
  vencidos: string;
  por_vencer: string;
  sin_vencimiento: string;
}

export const runDocumentosJobNow = async (
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<{
  alerts: Awaited<ReturnType<typeof generateAlertas>>;
  executed_at: string;
  resumen: {
    por_vencer: number;
    sin_vencimiento: number;
    total_documentos: number;
    vencidos: number;
  };
}> => {
  try {
    const context = await resolveJobExecutionContext('documentos', actorUserId, auditMeta);

    const result = await dbQuery<DocumentStatusRow>(
      `
        WITH documentos AS (
          SELECT fecha_vencimiento
          FROM documentos_persona
          WHERE COALESCE(activo, TRUE) = TRUE

          UNION ALL

          SELECT fecha_vencimiento
          FROM documentos_vinculacion
          WHERE COALESCE(activo, TRUE) = TRUE
        )
        SELECT
          COUNT(*)::text AS total_documentos,
          COUNT(*) FILTER (WHERE fecha_vencimiento IS NOT NULL AND fecha_vencimiento < CURRENT_DATE)::text AS vencidos,
          COUNT(*) FILTER (
            WHERE fecha_vencimiento IS NOT NULL
              AND fecha_vencimiento >= CURRENT_DATE
              AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '30 days'
          )::text AS por_vencer,
          COUNT(*) FILTER (WHERE fecha_vencimiento IS NULL)::text AS sin_vencimiento
        FROM documentos
      `
    );

    const row = result.rows[0];
    const alerts = await generateAlertas(
      {
        tipos_alerta: ['DOCUMENTO_VENCIDO', 'DOCUMENTO_POR_VENCER']
      },
      context.actorUserId,
      context.auditMeta
    );

    const summary = {
      total_documentos: Number(row?.total_documentos ?? 0),
      vencidos: Number(row?.vencidos ?? 0),
      por_vencer: Number(row?.por_vencer ?? 0),
      sin_vencimiento: Number(row?.sin_vencimiento ?? 0)
    };

    const response = {
      executed_at: new Date().toISOString(),
      resumen: summary,
      alerts
    };

    console.log('[jobs.documentos] Job executed successfully.', response);
    return response;
  } catch (error) {
    console.error('[jobs.documentos] Job execution failed:', error);
    throw error;
  }
};

export const registerDocumentosJob = (): void => {
  cron.schedule(DOCUMENTOS_CRON_EXPRESSION, () => {
    void runDocumentosJobNow().catch(() => undefined);
  });

  console.log(
    `[jobs.documentos] Registered cron job with schedule "${DOCUMENTOS_CRON_EXPRESSION}".`
  );
};
