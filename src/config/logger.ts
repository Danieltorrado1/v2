import { env } from './env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logLevelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const currentLevelPriority = logLevelPriority[env.LOG_LEVEL];

const shouldLog = (level: LogLevel): boolean => {
  return logLevelPriority[level] >= currentLevelPriority;
};

const formatMessage = (level: LogLevel, message: string, meta?: unknown): string => {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta: meta ?? null
  };

  return JSON.stringify(payload);
};

const log = (level: LogLevel, message: string, meta?: unknown): void => {
  if (!shouldLog(level)) {
    return;
  }

  const formatted = formatMessage(level, message, meta);

  if (level === 'error') {
    console.error(formatted);
    return;
  }

  if (level === 'warn') {
    console.warn(formatted);
    return;
  }

  console.log(formatted);
};

export const logger = {
  debug: (message: string, meta?: unknown): void => log('debug', message, meta),
  info: (message: string, meta?: unknown): void => log('info', message, meta),
  warn: (message: string, meta?: unknown): void => log('warn', message, meta),
  error: (message: string, meta?: unknown): void => log('error', message, meta)
};

export const loggerStream = {
  write: (message: string): void => {
    logger.info(message.trim());
  }
};
