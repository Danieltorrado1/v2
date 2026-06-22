import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Request, Response } from 'express';
import { QueryResultRow } from 'pg';

import { dbQuery } from '../../config/db';
import { env } from '../../config/env';
import { asyncHandler } from '../../utils/asyncHandler';

interface HealthRow extends QueryResultRow {
  now: Date;
}

const getAppVersion = (): string => {
  try {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as {
      version?: unknown;
    };

    return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    return 'unknown';
  }
};

const appVersion = getAppVersion();

export const getHealthStatus = asyncHandler(async (_req: Request, res: Response) => {
  const memoryUsage = process.memoryUsage();
  const basePayload = {
    app: env.APP_NAME,
    environment: env.NODE_ENV,
    status: 'ok',
    uptime: Number(process.uptime().toFixed(2)),
    timestamp: new Date().toISOString(),
    version: appVersion,
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers
    }
  };

  try {
    const result = await dbQuery<HealthRow>('SELECT NOW() AS now');
    const databaseTime = result.rows[0]?.now;

    return res.status(200).json({
      success: true,
      message: 'Health check successful',
      data: {
        ...basePayload,
        database: {
          status: 'ok',
          time: databaseTime instanceof Date ? databaseTime.toISOString() : null
        }
      }
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      message: 'Health check failed',
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database unavailable'
      },
      data: {
        ...basePayload,
        status: 'degraded',
        database: {
          status: 'down',
          time: null
        }
      }
    });
  }
});
