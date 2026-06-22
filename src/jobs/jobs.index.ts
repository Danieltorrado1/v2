import { AuditRequestMeta } from '../modules/auditoria/auditoria.helper';
import { registerAlertasJob, runAlertasJobNow } from './alertas.job';
import { registerCoberturaJob, runCoberturaJobNow } from './cobertura.job';
import { registerDocumentosJob, runDocumentosJobNow } from './documentos.job';
import { registerNominaJob, runNominaJobNow } from './nomina.job';
import { registerSstJob, runSstJobNow } from './sst.job';

export const jobRunners = {
  alertas: runAlertasJobNow,
  documentos: runDocumentosJobNow,
  cobertura: runCoberturaJobNow,
  nomina: runNominaJobNow,
  sst: runSstJobNow
} as const;

export type JobName = keyof typeof jobRunners;

export const runJobNow = async (
  jobName: JobName,
  actorUserId?: string,
  auditMeta?: AuditRequestMeta
): Promise<Awaited<ReturnType<(typeof jobRunners)[JobName]>>> => {
  return jobRunners[jobName](actorUserId, auditMeta);
};

export const registerJobs = (): void => {
  registerAlertasJob();
  registerDocumentosJob();
  registerCoberturaJob();
  registerNominaJob();
  registerSstJob();
};
