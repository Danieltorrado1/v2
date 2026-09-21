import type { VinculacionChecklistApi } from '../../types/expediente.types';
import { repositoryProgress } from './repositoryProgressModel';

export default function PersonalRepositoryProgress({ checklist }: { checklist?: VinculacionChecklistApi }) {
  const progress = repositoryProgress(checklist);
  if (!progress) return <small className="repo-worker-progress">Cumplimiento no disponible</small>;
  if (!progress.total) return <small className="repo-worker-progress">Sin requisitos exigibles</small>;
  return <div className="repo-worker-progress">
    <div><progress aria-label="Cumplimiento documental aprobado" max={100} value={progress.percentage} /><span>{progress.percentage}% · {progress.approved} de {progress.total} exigibles</span></div>
  </div>;
}
