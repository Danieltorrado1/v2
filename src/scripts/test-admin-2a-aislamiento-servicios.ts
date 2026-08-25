import assert from 'node:assert/strict';

import { dbPool } from '../config/db';
import { loadTenantAccess } from '../middlewares/tenantMiddleware';
import { AppError } from '../utils/AppError';
import { listVinculacionDocumentos } from '../modules/documentos/documentos.service';
import { getSstEventoById, getSstPlanAccionById } from '../modules/sst/sst.service';
import { listSstInspecciones } from '../modules/sst/sst.inspecciones.service';

type TenantSeedRow = {
  user_id: string;
};

type IdRow = {
  id: string;
};

async function expectTenantForbidden(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.statusCode, 403);
    assert.equal(error.code, 'TENANT_FORBIDDEN');
    return;
  }

  assert.fail('Expected TENANT_FORBIDDEN');
}

async function main() {
  const client = await dbPool.connect();

  try {
    const tenantUserResult = await client.query<TenantSeedRow>(
      `
        SELECT ue.usuario_id::text AS user_id
        FROM usuario_empresas ue
        INNER JOIN usuarios u ON u.id = ue.usuario_id
        LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id AND COALESCE(ur.activo, TRUE) = TRUE
        LEFT JOIN roles r ON r.id = ur.rol_id AND COALESCE(r.activo, TRUE) = TRUE
        WHERE COALESCE(ue.activo, TRUE) = TRUE
          AND COALESCE(u.activo, TRUE) = TRUE
        GROUP BY ue.usuario_id
        HAVING BOOL_OR(r.nombre_rol = 'ADMINISTRADOR') = FALSE
        ORDER BY ue.usuario_id ASC
        LIMIT 1
      `
    );

    const tenantUserId = tenantUserResult.rows[0]?.user_id;
    assert.ok(tenantUserId);

    const tenant = await loadTenantAccess(tenantUserId, client);
    const allowedEmpresaId = tenant.empresaIds[0] ?? 0;

    assert.ok(Number.isFinite(allowedEmpresaId) && allowedEmpresaId > 0);

    const forbiddenEmpresaResult = await client.query<IdRow>(
      `
        SELECT e.id::text AS id
        FROM empresas e
        WHERE e.id <> ALL($1::bigint[])
        ORDER BY e.id ASC
        LIMIT 1
      `,
      [tenant.empresaIds]
    );

    const forbiddenEmpresaId = Number(forbiddenEmpresaResult.rows[0]?.id ?? 0);
    assert.ok(Number.isFinite(forbiddenEmpresaId) && forbiddenEmpresaId > 0);

    let allowedVinculacionResult: { rows: IdRow[] };
    let forbiddenVinculacionResult: { rows: IdRow[] };

    if (tenant.contratoIds.length > 0) {
      allowedVinculacionResult = await client.query<IdRow>(
        `
          SELECT v.id::text AS id
          FROM vinculaciones v
          WHERE v.contrato_id = ANY($1::bigint[])
          ORDER BY v.id ASC
          LIMIT 1
        `,
        [tenant.contratoIds]
      );

      forbiddenVinculacionResult = await client.query<IdRow>(
        `
          SELECT v.id::text AS id
          FROM vinculaciones v
          WHERE NOT (v.contrato_id = ANY($1::bigint[]))
          ORDER BY v.id ASC
          LIMIT 1
        `,
        [tenant.contratoIds]
      );
    } else {
      allowedVinculacionResult = await client.query<IdRow>(
        `
          SELECT v.id::text AS id
          FROM vinculaciones v
          INNER JOIN contratos c ON c.id = v.contrato_id
          WHERE c.empresa_id = ANY($1::bigint[])
          ORDER BY v.id ASC
          LIMIT 1
        `,
        [tenant.empresaIds]
      );

      forbiddenVinculacionResult = await client.query<IdRow>(
        `
          SELECT v.id::text AS id
          FROM vinculaciones v
          INNER JOIN contratos c ON c.id = v.contrato_id
          WHERE NOT (c.empresa_id = ANY($1::bigint[]))
          ORDER BY v.id ASC
          LIMIT 1
        `,
        [tenant.empresaIds]
      );
    }

    const allowedVinculacionId = allowedVinculacionResult.rows[0]?.id;
    const forbiddenVinculacionId = forbiddenVinculacionResult.rows[0]?.id;

    assert.ok(allowedVinculacionId);
    assert.ok(forbiddenVinculacionId);

    await listVinculacionDocumentos(String(allowedVinculacionId), tenant);
    await expectTenantForbidden(() =>
      listVinculacionDocumentos(String(forbiddenVinculacionId), tenant)
    );

    let allowedEventoResult: { rows: IdRow[] };
    let forbiddenEventoResult: { rows: IdRow[] };
    let allowedPlanResult: { rows: IdRow[] };
    let forbiddenPlanResult: { rows: IdRow[] };

    if (tenant.contratoIds.length > 0) {
      allowedEventoResult = await client.query<IdRow>(
        `
          SELECT se.id::text AS id
          FROM sst_eventos se
          INNER JOIN vinculaciones v ON v.id = se.vinculacion_id
          WHERE v.contrato_id = ANY($1::bigint[])
             OR v.empresa_id = ANY($2::bigint[])
          ORDER BY se.id ASC
          LIMIT 1
        `,
        [tenant.contratoIds, tenant.empresaIds]
      );

      forbiddenEventoResult = await client.query<IdRow>(
        `
          SELECT se.id::text AS id
          FROM sst_eventos se
          INNER JOIN vinculaciones v ON v.id = se.vinculacion_id
          WHERE NOT (
            v.contrato_id = ANY($1::bigint[])
            OR v.empresa_id = ANY($2::bigint[])
          )
          ORDER BY se.id ASC
          LIMIT 1
        `,
        [tenant.contratoIds, tenant.empresaIds]
      );

      allowedPlanResult = await client.query<IdRow>(
        `
          SELECT spa.id::text AS id
          FROM sst_planes_accion spa
          LEFT JOIN sst_eventos se
            ON UPPER(TRIM(spa.origen)) IN ('EVENTO', 'SST_EVENTO', 'SST_EVENTOS')
           AND se.id = spa.origen_id
          LEFT JOIN vinculaciones v ON v.id = se.vinculacion_id
          LEFT JOIN sst_inspecciones si
            ON UPPER(TRIM(spa.origen)) IN ('INSPECCION', 'SST_INSPECCION', 'SST_INSPECCIONES')
           AND si.id = spa.origen_id
          LEFT JOIN sst_inspecciones_hallazgos sih
            ON UPPER(TRIM(spa.origen)) IN ('HALLAZGO', 'HALLAZGO_INSPECCION', 'SST_INSPECCION_HALLAZGO', 'SST_INSPECCIONES_HALLAZGOS')
           AND sih.id = spa.origen_id
          LEFT JOIN sst_inspecciones si_h ON si_h.id = sih.inspeccion_id
          LEFT JOIN sst_accidentes_incidentes sai
            ON UPPER(TRIM(spa.origen)) IN ('ACCIDENTE', 'SST_ACCIDENTE', 'SST_ACCIDENTES_INCIDENTES')
           AND sai.id = spa.origen_id
          WHERE COALESCE(v.contrato_id, si.contrato_id, si_h.contrato_id, sai.contrato_id) = ANY($1::bigint[])
             OR COALESCE(v.empresa_id, si.empresa_id, si_h.empresa_id, sai.empresa_id) = ANY($2::bigint[])
          ORDER BY spa.id ASC
          LIMIT 1
        `,
        [tenant.contratoIds, tenant.empresaIds]
      );

      forbiddenPlanResult = await client.query<IdRow>(
        `
          SELECT spa.id::text AS id
          FROM sst_planes_accion spa
          LEFT JOIN sst_eventos se
            ON UPPER(TRIM(spa.origen)) IN ('EVENTO', 'SST_EVENTO', 'SST_EVENTOS')
           AND se.id = spa.origen_id
          LEFT JOIN vinculaciones v ON v.id = se.vinculacion_id
          LEFT JOIN sst_inspecciones si
            ON UPPER(TRIM(spa.origen)) IN ('INSPECCION', 'SST_INSPECCION', 'SST_INSPECCIONES')
           AND si.id = spa.origen_id
          LEFT JOIN sst_inspecciones_hallazgos sih
            ON UPPER(TRIM(spa.origen)) IN ('HALLAZGO', 'HALLAZGO_INSPECCION', 'SST_INSPECCION_HALLAZGO', 'SST_INSPECCIONES_HALLAZGOS')
           AND sih.id = spa.origen_id
          LEFT JOIN sst_inspecciones si_h ON si_h.id = sih.inspeccion_id
          LEFT JOIN sst_accidentes_incidentes sai
            ON UPPER(TRIM(spa.origen)) IN ('ACCIDENTE', 'SST_ACCIDENTE', 'SST_ACCIDENTES_INCIDENTES')
           AND sai.id = spa.origen_id
          WHERE NOT (
            COALESCE(v.contrato_id, si.contrato_id, si_h.contrato_id, sai.contrato_id) = ANY($1::bigint[])
            OR COALESCE(v.empresa_id, si.empresa_id, si_h.empresa_id, sai.empresa_id) = ANY($2::bigint[])
          )
          ORDER BY spa.id ASC
          LIMIT 1
        `,
        [tenant.contratoIds, tenant.empresaIds]
      );
    } else {
      allowedEventoResult = await client.query<IdRow>(
        `
          SELECT se.id::text AS id
          FROM sst_eventos se
          INNER JOIN vinculaciones v ON v.id = se.vinculacion_id
          WHERE v.empresa_id = ANY($1::bigint[])
          ORDER BY se.id ASC
          LIMIT 1
        `,
        [tenant.empresaIds]
      );

      forbiddenEventoResult = await client.query<IdRow>(
        `
          SELECT se.id::text AS id
          FROM sst_eventos se
          INNER JOIN vinculaciones v ON v.id = se.vinculacion_id
          WHERE NOT (v.empresa_id = ANY($1::bigint[]))
          ORDER BY se.id ASC
          LIMIT 1
        `,
        [tenant.empresaIds]
      );

      allowedPlanResult = await client.query<IdRow>(
        `
          SELECT spa.id::text AS id
          FROM sst_planes_accion spa
          LEFT JOIN sst_eventos se
            ON UPPER(TRIM(spa.origen)) IN ('EVENTO', 'SST_EVENTO', 'SST_EVENTOS')
           AND se.id = spa.origen_id
          LEFT JOIN vinculaciones v ON v.id = se.vinculacion_id
          LEFT JOIN sst_inspecciones si
            ON UPPER(TRIM(spa.origen)) IN ('INSPECCION', 'SST_INSPECCION', 'SST_INSPECCIONES')
           AND si.id = spa.origen_id
          LEFT JOIN sst_inspecciones_hallazgos sih
            ON UPPER(TRIM(spa.origen)) IN ('HALLAZGO', 'HALLAZGO_INSPECCION', 'SST_INSPECCION_HALLAZGO', 'SST_INSPECCIONES_HALLAZGOS')
           AND sih.id = spa.origen_id
          LEFT JOIN sst_inspecciones si_h ON si_h.id = sih.inspeccion_id
          LEFT JOIN sst_accidentes_incidentes sai
            ON UPPER(TRIM(spa.origen)) IN ('ACCIDENTE', 'SST_ACCIDENTE', 'SST_ACCIDENTES_INCIDENTES')
           AND sai.id = spa.origen_id
          WHERE COALESCE(v.empresa_id, si.empresa_id, si_h.empresa_id, sai.empresa_id) = ANY($1::bigint[])
          ORDER BY spa.id ASC
          LIMIT 1
        `,
        [tenant.empresaIds]
      );

      forbiddenPlanResult = await client.query<IdRow>(
        `
          SELECT spa.id::text AS id
          FROM sst_planes_accion spa
          LEFT JOIN sst_eventos se
            ON UPPER(TRIM(spa.origen)) IN ('EVENTO', 'SST_EVENTO', 'SST_EVENTOS')
           AND se.id = spa.origen_id
          LEFT JOIN vinculaciones v ON v.id = se.vinculacion_id
          LEFT JOIN sst_inspecciones si
            ON UPPER(TRIM(spa.origen)) IN ('INSPECCION', 'SST_INSPECCION', 'SST_INSPECCIONES')
           AND si.id = spa.origen_id
          LEFT JOIN sst_inspecciones_hallazgos sih
            ON UPPER(TRIM(spa.origen)) IN ('HALLAZGO', 'HALLAZGO_INSPECCION', 'SST_INSPECCION_HALLAZGO', 'SST_INSPECCIONES_HALLAZGOS')
           AND sih.id = spa.origen_id
          LEFT JOIN sst_inspecciones si_h ON si_h.id = sih.inspeccion_id
          LEFT JOIN sst_accidentes_incidentes sai
            ON UPPER(TRIM(spa.origen)) IN ('ACCIDENTE', 'SST_ACCIDENTE', 'SST_ACCIDENTES_INCIDENTES')
           AND sai.id = spa.origen_id
          WHERE NOT (
            COALESCE(v.empresa_id, si.empresa_id, si_h.empresa_id, sai.empresa_id) = ANY($1::bigint[])
          )
          ORDER BY spa.id ASC
          LIMIT 1
        `,
        [tenant.empresaIds]
      );
    }

    let sstDirectEntity: 'evento' | 'plan' | 'ninguna' = 'ninguna';

    const allowedEventoId = allowedEventoResult.rows[0]?.id;
    const forbiddenEventoId = forbiddenEventoResult.rows[0]?.id;
    const allowedPlanId = allowedPlanResult.rows[0]?.id;
    const forbiddenPlanId = forbiddenPlanResult.rows[0]?.id;

    if (allowedEventoId && forbiddenEventoId) {
      sstDirectEntity = 'evento';
      assert.ok(await getSstEventoById(String(allowedEventoId), tenant));
      await expectTenantForbidden(() =>
        getSstEventoById(String(forbiddenEventoId), tenant)
      );
    } else if (allowedPlanId && forbiddenPlanId) {
      sstDirectEntity = 'plan';
      assert.ok(await getSstPlanAccionById(String(allowedPlanId), tenant));
      await expectTenantForbidden(() =>
        getSstPlanAccionById(String(forbiddenPlanId), tenant)
      );
    }

    await listSstInspecciones(
      { page: 1, limit: 10, empresa_id: String(allowedEmpresaId) },
      tenant
    );
    await expectTenantForbidden(() =>
      listSstInspecciones(
        { page: 1, limit: 10, empresa_id: String(forbiddenEmpresaId) },
        tenant
      )
    );

    console.log('ADMIN-2A service isolation validation passed.');
    console.log(
      JSON.stringify({
        tenantUserId,
        allowedEmpresaId,
        forbiddenEmpresaId,
        allowedVinculacionId,
        forbiddenVinculacionId,
        sstDirectEntity
      })
    );
  } finally {
    client.release();
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error('ADMIN-2A service isolation validation failed.');
  console.error(error);
  process.exitCode = 1;
});
