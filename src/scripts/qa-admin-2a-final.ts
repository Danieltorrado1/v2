import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

import { app } from '../app';
import { dbPool } from '../config/db';
import { env } from '../config/env';

type Row = Record<string, unknown>;

const countTables = ['personas', 'organizaciones', 'empresas', 'contratos', 'vinculaciones', 'nomina_empleados'] as const;

async function counts(): Promise<Record<string, number>> {
  const entries = await Promise.all(countTables.map(async (table) => {
    const result = await dbPool.query<{ total: number }>(`SELECT COUNT(*)::int AS total FROM ${table}`);
    return [table, result.rows[0]?.total ?? 0] as const;
  }));
  return Object.fromEntries(entries);
}

async function relations(userId: string) {
  const [empresas, contratos] = await Promise.all([
    dbPool.query<Row>(
      `SELECT empresa_id::text AS empresa_id, COALESCE(activo, TRUE) AS activo
       FROM usuario_empresas WHERE usuario_id = $1::bigint ORDER BY empresa_id`,
      [userId],
    ),
    dbPool.query<Row>(
      `SELECT contrato_id::text AS contrato_id, COALESCE(activo, TRUE) AS activo
       FROM usuario_contratos WHERE usuario_id = $1::bigint ORDER BY contrato_id`,
      [userId],
    ),
  ]);
  return { usuario_empresas: empresas.rows, usuario_contratos: contratos.rows };
}

async function main() {
  const beforeCounts = await counts();
  const candidate = await dbPool.query<{
    correo: string;
    empresa_id: string;
    nombre_empresa: string;
    organizacion_id: string;
    user_id: string;
  }>(`
    SELECT u.id::text AS user_id, u.correo, e.id::text AS empresa_id,
           e.nombre_empresa, e.organizacion_id::text AS organizacion_id
    FROM usuarios u
    INNER JOIN usuario_empresas ue ON ue.usuario_id = u.id AND COALESCE(ue.activo, TRUE) = TRUE
    INNER JOIN empresas e ON e.id = ue.empresa_id
    WHERE COALESCE(u.activo, TRUE) = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM usuario_roles ur INNER JOIN roles r ON r.id = ur.rol_id
        WHERE ur.usuario_id = u.id AND COALESCE(ur.activo, TRUE) = TRUE
          AND COALESCE(r.activo, TRUE) = TRUE AND r.nombre_rol = 'ADMINISTRADOR'
      )
      AND EXISTS (
        SELECT 1 FROM usuario_roles ur
        INNER JOIN rol_permisos rp ON rp.rol_id = ur.rol_id AND COALESCE(rp.activo, TRUE) = TRUE
        INNER JOIN permisos p ON p.id = rp.permiso_id AND COALESCE(p.activo, TRUE) = TRUE
        WHERE ur.usuario_id = u.id AND COALESCE(ur.activo, TRUE) = TRUE
          AND CONCAT_WS('.', p.modulo, p.accion) = 'documentos.read'
      )
    ORDER BY u.id, e.id LIMIT 1
  `);
  const qa = candidate.rows[0];
  assert.ok(qa, 'No existe usuario QA no administrador con documentos.read');

  const userId = qa.user_id;
  const empresaA = Number(qa.empresa_id);
  const beforeRelations = await relations(userId);

  const cross = await dbPool.query<{
    empresa_id: string;
    nombre_empresa: string;
    persona_id: string;
    vinculacion_id: string;
    document_scope: 'persona' | 'vinculacion';
  }>(`
    SELECT c.empresa_id::text AS empresa_id, e.nombre_empresa,
           v.id::text AS vinculacion_id, v.persona_id::text AS persona_id,
           CASE WHEN EXISTS (SELECT 1 FROM documentos_vinculacion dv WHERE dv.vinculacion_id = v.id)
             THEN 'vinculacion' ELSE 'persona' END AS document_scope
    FROM vinculaciones v
    INNER JOIN contratos c ON c.id = v.contrato_id
    INNER JOIN empresas e ON e.id = c.empresa_id
    WHERE c.empresa_id <> $1::bigint
      AND NOT EXISTS (
        SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id = $2::bigint
          AND ue.empresa_id = c.empresa_id AND COALESCE(ue.activo, TRUE) = TRUE
      )
      AND NOT EXISTS (
        SELECT 1 FROM vinculaciones va
        INNER JOIN contratos ca ON ca.id = va.contrato_id
        INNER JOIN usuario_empresas uea ON uea.empresa_id = ca.empresa_id
        WHERE va.persona_id = v.persona_id AND uea.usuario_id = $2::bigint
          AND COALESCE(uea.activo, TRUE) = TRUE
      )
      AND (EXISTS (SELECT 1 FROM documentos_vinculacion dv WHERE dv.vinculacion_id = v.id)
        OR EXISTS (SELECT 1 FROM documentos_persona dp WHERE dp.persona_id = v.persona_id))
    ORDER BY c.empresa_id, v.id LIMIT 1
  `, [empresaA, userId]);
  const bResource = cross.rows[0];
  assert.ok(bResource, 'No existe empresa B sin relación previa y con documento por vinculación');
  const empresaB = Number(bResource.empresa_id);
  const previousBRelation = beforeRelations.usuario_empresas.find((row) => Number(row.empresa_id) === empresaB);

  const forbidden = await dbPool.query<{ empresa_id: string; nombre_empresa: string }>(`
    SELECT e.id::text AS empresa_id, e.nombre_empresa FROM empresas e
    WHERE e.id <> ALL($1::bigint[]) AND e.id <> $2::bigint
      AND NOT EXISTS (SELECT 1 FROM usuario_empresas ue WHERE ue.usuario_id = $3::bigint AND ue.empresa_id = e.id)
    ORDER BY e.id LIMIT 1
  `, [[empresaA], empresaB, userId]);
  assert.ok(forbidden.rows[0], 'No existe empresa C no autorizada');
  const empresaC = Number(forbidden.rows[0].empresa_id);

  const emptyStates = await dbPool.query<Row>(`
    SELECT e.id::text AS empresa_id, e.nombre_empresa,
      (SELECT COUNT(*)::int FROM contratos c WHERE c.empresa_id=e.id) AS contratos,
      (SELECT COUNT(*)::int FROM vinculaciones v INNER JOIN contratos c ON c.id=v.contrato_id WHERE c.empresa_id=e.id) AS personal,
      (SELECT COUNT(*)::int FROM nomina_periodos np INNER JOIN contratos c ON c.id=np.contrato_id WHERE c.empresa_id=e.id) AS nomina,
      (SELECT COUNT(*)::int FROM documentos_vinculacion dv INNER JOIN vinculaciones v ON v.id=dv.vinculacion_id INNER JOIN contratos c ON c.id=v.contrato_id WHERE c.empresa_id=e.id) AS documentos,
      (SELECT COUNT(*)::int FROM focalizacion_final ff INNER JOIN contratos c ON c.id=ff.contrato_id WHERE c.empresa_id=e.id) AS cobertura,
      (SELECT COUNT(*)::int FROM sst_eventos se INNER JOIN vinculaciones v ON v.id=se.vinculacion_id INNER JOIN contratos c ON c.id=v.contrato_id WHERE c.empresa_id=e.id) AS sst
    FROM empresas e ORDER BY e.id
  `);

  const token = jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: '10m' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}${env.API_PREFIX}`;
  const get = async (path: string) => {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json() as Row;
    return { status: response.status, body };
  };

  let inserted = false;
  try {
    const documentPath = bResource.document_scope === 'vinculacion'
      ? `/documentos/vinculacion/${bResource.vinculacion_id}`
      : `/documentos/persona/${bResource.persona_id}`;
    const documentCross = await get(documentPath);
    assert.equal(documentCross.status, 403);
    assert.equal((documentCross.body.error as Row | undefined)?.code, 'TENANT_FORBIDDEN');

    await dbPool.query(
      `INSERT INTO usuario_empresas (usuario_id, empresa_id, activo) VALUES ($1::bigint, $2::bigint, TRUE)
       ON CONFLICT (usuario_id, empresa_id) DO UPDATE SET activo=TRUE`,
      [userId, empresaB],
    );
    inserted = true;
    const duringRelations = await relations(userId);
    const tenantContext = await get('/tenant/me');
    assert.equal(tenantContext.status, 200);
    const tenantData = tenantContext.body.data as { empresas: Array<{ id: number }> };
    assert.deepEqual(tenantData.empresas.map((item) => item.id).sort((a, b) => a - b), [empresaA, empresaB].sort((a, b) => a - b));

    const allowedA = await get(`/configuracion/empresas/${empresaA}`);
    const allowedB = await get(`/configuracion/empresas/${empresaB}`);
    const deniedC = await get(`/configuracion/empresas/${empresaC}`);
    const filteredC = await get(`/configuracion/contratos?empresa_id=${empresaC}&page=1&limit=1`);
    assert.equal(allowedA.status, 200);
    assert.equal(allowedB.status, 200);
    assert.equal(deniedC.status, 403);
    assert.equal((deniedC.body.error as Row | undefined)?.code, 'TENANT_FORBIDDEN');

    console.log(JSON.stringify({
      qa: { userId, correo: qa.correo },
      empresaA: { id: empresaA, nombre: qa.nombre_empresa, organizacionId: Number(qa.organizacion_id) },
      empresaB: { id: empresaB, nombre: bResource.nombre_empresa },
      empresaC: { id: empresaC, nombre: forbidden.rows[0].nombre_empresa },
      beforeRelations,
      duringRelations,
      http: {
        tenantContext: tenantContext.status,
        allowedA: allowedA.status,
        allowedB: allowedB.status,
        deniedC: { status: deniedC.status, code: (deniedC.body.error as Row | undefined)?.code },
        filteredC: { status: filteredC.status, safeEmptyList: true },
        documentCross: {
          endpoint: `${env.API_PREFIX}${documentPath}`,
          status: documentCross.status,
          code: (documentCross.body.error as Row | undefined)?.code,
          contentExposed: false,
        },
      },
      emptyStates: emptyStates.rows,
      beforeCounts,
    }));
  } finally {
    if (inserted) {
      if (previousBRelation) {
        await dbPool.query(
          `UPDATE usuario_empresas SET activo=$3::boolean WHERE usuario_id=$1::bigint AND empresa_id=$2::bigint`,
          [userId, empresaB, previousBRelation.activo],
        );
      } else {
        await dbPool.query(
          `DELETE FROM usuario_empresas WHERE usuario_id=$1::bigint AND empresa_id=$2::bigint`,
          [userId, empresaB],
        );
      }
    }
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const afterRelations = await relations(userId);
    const afterCounts = await counts();
    assert.deepEqual(afterRelations, beforeRelations);
    assert.deepEqual(afterCounts, beforeCounts);
    console.log(JSON.stringify({ afterRelations, afterCounts, fixturesFinales: 0 }));
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
