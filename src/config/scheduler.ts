import { env } from './env';
import { registerJobs } from '../jobs/jobs.index';

let schedulerStarted = false;

export const startScheduler = (): void => {
  if (!env.ENABLE_JOBS) {
    console.log('Scheduler disabled by configuration.');
    return;
  }

  if (schedulerStarted) {
    console.log('Scheduler already started. Skipping duplicate initialization.');
    return;
  }

  try {
    registerJobs();
    schedulerStarted = true;
    console.log('Scheduler started successfully.');
  } catch (error) {
    console.error('Failed to start scheduler:', error);
  }
};
