import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { app } from '../app';
import { dbPool } from '../config/db';
import { env } from '../config/env';

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type AdminRow = {
  user_id: string;
  correo: string;
  activo: boolean;
  roles: string[];
  permissions: string[];
  empresa_ids: string[];
  contrato_ids: string[];
};

const ADMIN_EMAIL = 'admin@empiria.local';
const EMPRESA_ID = 15;
const CONTRATO_ID = 24;

async function readJson(response: Response): Promise<Json> {
  const text = await response.text();

  if (text.length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as Json;
  } catch {
    return text;
  }
}

async function main(): Promise<void> {
  const adminResult = await dbPool.query<AdminRow>(
    `
      SELECT
        u.id::text AS user_id,
        u.correo,
        COALESCE(u.activo, TRUE) AS activo,
        COALESCE(
          ARRAY(
            SELECT DISTINCT r.nombre_rol
            FROM usuario_roles ur
            INNER JOIN roles r ON r.id = ur.rol_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(r.activo, TRUE) = TRUE
            ORDER BY r.nombre_rol
          ),
          ARRAY[]::text[]
        ) AS roles,
        COALESCE(
          ARRAY(
            SELECT DISTINCT CONCAT_WS('.', p.modulo, p.accion)
            FROM usuario_roles ur
            INNER JOIN roles r ON r.id = ur.rol_id
            INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id
            INNER JOIN permisos p ON p.id = rp.permiso_id
            WHERE ur.usuario_id = u.id
              AND COALESCE(ur.activo, TRUE) = TRUE
              AND COALESCE(r.activo, TRUE) = TRUE
              AND COALESCE(rp.activo, TRUE) = TRUE
              AND COALESCE(p.activo, TRUE) = TRUE
            ORDER BY CONCAT_WS('.', p.modulo, p.accion)
          ),
          ARRAY[]::text[]
        ) AS permissions,
        COALESCE(
          ARRAY(
            SELECT DISTINCT ue.empresa_id::text
            FROM usuario_empresas ue
            WHERE ue.usuario_id = u.id
              AND COALESCE(ue.activo, TRUE) = TRUE
            ORDER BY ue.empresa_id::text
          ),
          ARRAY[]::text[]
        ) AS empresa_ids,
        COALESCE(
          ARRAY(
            SELECT DISTINCT uc.contrato_id::text
            FROM usuario_contratos uc
            WHERE uc.usuario_id = u.id
              AND COALESCE(uc.activo, TRUE) = TRUE
            ORDER BY uc.contrato_id::text
          ),
          ARRAY[]::text[]
        ) AS contrato_ids
      FROM usuarios u
      WHERE LOWER(u.correo) = LOWER($1)
      LIMIT 1
    `,
    [ADMIN_EMAIL]
  );

  const admin = adminResult.rows[0];
  assert.ok(admin, `No se encontró ${ADMIN_EMAIL}`);

  const contractOwnerResult = await dbPool.query<{
    id: string;
    empresa_id: string;
    numero_contrato: string;
    estado_contractual: string | null;
    activo: boolean;
  }>(
    `
      SELECT
        c.id::text AS id,
        c.empresa_id::text AS empresa_id,
        c.numero_contrato,
        c.estado_contractual,
        COALESCE(c.activo, TRUE) AS activo
      FROM contratos c
      WHERE c.id = $1::bigint
      LIMIT 1
    `,
    [CONTRATO_ID]
  );

  const contractOwner = contractOwnerResult.rows[0] ?? null;

  const token = jwt.sign({}, env.JWT_SECRET, {
    subject: admin.user_id,
    expiresIn: '10m'
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}${env.API_PREFIX}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    const [getParametersResponse, postParametersResponse, contractsResponse] = await Promise.all([
      fetch(`${base}/company-settings/${EMPRESA_ID}/payroll-parameters`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`${base}/company-settings/${EMPRESA_ID}/payroll-parameters`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      }),
      fetch(`${base}/configuracion/contratos?empresa_id=${EMPRESA_ID}&limit=500`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    ]);

    const getParametersBody = await readJson(getParametersResponse);
    const postParametersBody = await readJson(postParametersResponse);
    const contractsBody = await readJson(contractsResponse);

    const contractItems =
      contractsBody &&
      typeof contractsBody === 'object' &&
      !Array.isArray(contractsBody) &&
      'items' in contractsBody &&
      Array.isArray((contractsBody as { items?: Json[] }).items)
        ? ((contractsBody as { items: Json[] }).items as Array<Record<string, Json>>)
        : [];

    const targetContract = contractItems.find((item) => Number(item.id) === CONTRATO_ID) ?? null;

    console.log(
      JSON.stringify(
        {
          auditDate: '2026-08-31',
          admin: {
            user_id: admin.user_id,
            correo: admin.correo,
            activo: admin.activo,
            roles: admin.roles,
            permissions: admin.permissions,
            empresa_ids: admin.empresa_ids,
            contrato_ids: admin.contrato_ids,
            has_nomina_economico_read: admin.permissions.includes('nomina.economico.read'),
            has_nomina_parametros_manage: admin.permissions.includes('nomina.parametros.manage'),
            has_configuracion_read: admin.permissions.includes('configuracion.read'),
            has_contratos_read: admin.permissions.includes('contratos.read'),
            has_contracts_read: admin.permissions.includes('contracts.read')
          },
          endpoints: {
            get_payroll_parameters: {
              method: 'GET',
              path: `${env.API_PREFIX}/company-settings/${EMPRESA_ID}/payroll-parameters`,
              status: getParametersResponse.status,
              body: getParametersBody
            },
            post_payroll_parameters_invalid_payload: {
              method: 'POST',
              path: `${env.API_PREFIX}/company-settings/${EMPRESA_ID}/payroll-parameters`,
              status: postParametersResponse.status,
              body: postParametersBody
            },
            get_contratos_empresa: {
              method: 'GET',
              path: `${env.API_PREFIX}/configuracion/contratos`,
              query: {
                empresa_id: EMPRESA_ID,
                limit: 500
              },
              status: contractsResponse.status,
              total_items: contractItems.length,
              includes_contract_24: targetContract !== null,
              contract_24: targetContract,
              body: contractsBody
            }
          },
          contract_owner: contractOwner
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
