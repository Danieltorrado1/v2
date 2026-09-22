import type { VinculacionChecklistApi } from '../../types/expediente.types';

// The batch checklist owns applicability, approval and validity rules.
export function repositoryProgress(checklist?: VinculacionChecklistApi) {
  if (!checklist) return undefined;
  return {
    total: checklist.total_requisitos,
    approved: checklist.completos + checklist.proximos_vencer,
    percentage: checklist.cumplimiento_porcentaje,
  };
}
