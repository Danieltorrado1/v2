import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';
import { uploadHistoricalFocalizacionFile } from '../modules/cobertura/cobertura.focalizacion.service';

const counts = async () => (await dbPool.query(`SELECT
  (SELECT COUNT(*)::int FROM focalizacion_cargas WHERE contrato_id=24) cargas,
  (SELECT COUNT(*)::int FROM focalizacion_preliminar WHERE contrato_id=24) preliminares,
  (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE contrato_id=24) vigencias,
  (SELECT COUNT(*)::int FROM focalizacion_final WHERE contrato_id=24) finales`)).rows[0];

const main = async () => {
  const buffer = await readFile(path.resolve('reports/focalizacion-smoke-agosto-2026.xlsx'));
  const before = await counts();
  const result = await uploadHistoricalFocalizacionFile(buffer, 'focalizacion-smoke-agosto-2026.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '2', 24);
  const after = await counts();
  if (JSON.stringify(before) !== JSON.stringify(after) || result.lote.id !== 2) {
    throw new Error(`IDEMPOTENCY_FAILED:${JSON.stringify({ before, after, lote_id: result.lote.id })}`);
  }
  const report = { before, after, returned_lote_id: result.lote.id, unchanged: true };
  await writeFile(path.resolve('reports/focalizacion-smoke-idempotency.json'), JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  await dbPool.end();
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
