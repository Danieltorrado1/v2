import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';
import {
  purgeTechnicalSmokeFocalizacionLoad,
  SMOKE_PURGE_CONFIRMATION,
  validateSmokePurgeProtection,
} from '../modules/cobertura/cobertura.focalizacion.smoke-purge';

const getArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};

const main = async () => {
  const apply = process.argv.includes('--apply');
  const contractId = getArg('contract-id');
  const loadId = getArg('load-id');
  const officialLoadId = getArg('official-load-id');
  const actorUserId = getArg('actor-user-id') ?? '2';
  const confirm = getArg('confirm');

  validateSmokePurgeProtection({
    apply,
    confirm,
    contractId,
    loadId,
    officialLoadId,
  });

  if (!apply) {
    console.log(JSON.stringify({
      mode: 'DRY_RUN_ONLY',
      required_confirmation: SMOKE_PURGE_CONFIRMATION,
      usage: 'node dist/scripts/purge-focalizacion-smoke.js --apply --contract-id=24 --load-id=2 --official-load-id=4 --actor-user-id=2 --confirm=PURGAR_SMOKE_TECNICO_FOCALIZACION',
    }, null, 2));
    return;
  }

  const result = await purgeTechnicalSmokeFocalizacionLoad({
    actorUserId,
    contractId: Number(contractId),
    loadId: Number(loadId),
    officialLoadId: Number(officialLoadId),
  });

  await writeFile(
    path.resolve('reports/focalizacion-smoke-purge-result.json'),
    JSON.stringify(result, null, 2),
    'utf8',
  );

  console.log(JSON.stringify({
    deleted: result.deleted,
    detachedHistory: result.detachedHistory,
    officialLoadId: result.officialLoadId,
    repairedValorAnterior: result.repairedValorAnterior.length,
    smokeLoadId: result.snapshot.smokeLoad.id,
  }, null, 2));
};

main()
  .catch(async (error: unknown) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbPool.end().catch(() => undefined);
  });
