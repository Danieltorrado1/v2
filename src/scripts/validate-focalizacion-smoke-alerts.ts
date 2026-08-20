import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';
import { generateSystemAlertCandidates } from '../modules/alertas/alertas.generator';

const main = async () => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const candidates = await generateSystemAlertCandidates(client, ['COBERTURA_INSUFICIENTE', 'SOBRECOBERTURA']);
    const contract24 = candidates.filter((candidate) => candidate.entidad === 'contratos' && candidate.registro_id === '24');
    const report = { mode: 'READ_ONLY_CANDIDATE_VALIDATION', persisted: 0, contract24 };
    await client.query('ROLLBACK');
    await writeFile(path.resolve('reports/focalizacion-smoke-alerts.json'), JSON.stringify(report, null, 2), 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    client.release();
    await dbPool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
