import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { app } from '../app';
import { dbPool } from '../config/db';
import { env } from '../config/env';

type ContratoPayload = {
  data?: {
    items?: Array<Record<string, unknown>>;
    pagination?: Record<string, unknown>;
  };
  error?: Record<string, unknown>;
  success?: boolean;
};

async function main(): Promise<void> {
  const userResult = await dbPool.query<{ user_id: string }>(
    `SELECT id::text AS user_id FROM usuarios WHERE LOWER(correo) = LOWER($1) LIMIT 1`,
    ['admin@empiria.local']
  );
  const user = userResult.rows[0];
  assert.ok(user, 'admin@empiria.local no existe');

  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: user.user_id,
    expiresIn: '10m'
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');

  try {
    const response = await fetch(
      `http://127.0.0.1:${address.port}${env.API_PREFIX}/configuracion/contratos?empresa_id=15&limit=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    const body = await response.json() as ContratoPayload;
    const items = Array.isArray(body.data?.items) ? body.data.items : [];
    const contract24 = items.find((item) => Number(item.id) === 24) ?? null;

    console.log(
      JSON.stringify(
        {
          status: response.status,
          success: body.success ?? null,
          count: items.length,
          includes_contract_24: contract24 !== null,
          contract_24: contract24,
          pagination: body.data?.pagination ?? null,
          error: body.error ?? null
        },
        null,
        2
      )
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
