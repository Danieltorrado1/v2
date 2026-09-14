import { dbPool } from '../config/db';
import { reconcileVinculacionesVigencia, type VigenciaRepairMode } from '../modules/vinculaciones/vigencia.repair.service';

const mode: VigenciaRepairMode = process.argv.includes('--apply') ? 'APPLY' : 'DRY_RUN';
const actor = process.argv.find((argument) => argument.startsWith('--actor='))?.slice('--actor='.length);

if (!actor) {
  throw new Error('Uso: node dist/scripts/repair-vinculaciones-vigencia.js --actor=<usuario_id> [--dry-run|--apply]');
}

const main = async (): Promise<void> => {
  try {
    const result = await reconcileVinculacionesVigencia(mode, actor);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await dbPool.end();
  }
};

void main();
