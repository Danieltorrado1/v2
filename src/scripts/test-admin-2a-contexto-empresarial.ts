import assert from 'node:assert/strict';

import { dbPool } from '../config/db';
import {
  hasTenantEmpresaAccess,
  loadTenantAccess
} from '../middlewares/tenantMiddleware';
import { getTenantMeContext } from '../modules/tenant/tenant.service';

type NumericRow = {
  total: number;
};

async function main(): Promise<void> {
  const client = await dbPool.connect();

  try {
    const schemaCheck = await client.query<{
      is_nullable: 'YES' | 'NO';
    }>(
      `
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'empresas'
          AND column_name = 'organizacion_id'
        LIMIT 1
      `
    );

    assert.equal(schemaCheck.rows[0]?.is_nullable, 'NO');

    const orphanCheck = await client.query<NumericRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM empresas e
        LEFT JOIN organizaciones o ON o.id = e.organizacion_id
        WHERE o.id IS NULL
      `
    );

    assert.equal(orphanCheck.rows[0]?.total ?? 0, 0);

    const nullOrgCheck = await client.query<NumericRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM empresas
        WHERE organizacion_id IS NULL
      `
    );

    assert.equal(nullOrgCheck.rows[0]?.total ?? 0, 0);

    await client.query('BEGIN');

    const orgResult = await client.query<{ id: string }>(
      `
        INSERT INTO organizaciones (codigo, nombre, estado)
        VALUES ($1, $2, 'ACTIVA')
        RETURNING id::text AS id
      `,
      [`ADMIN2A-TEMP-${Date.now()}`, 'ADMIN-2A TEMP ORG']
    );

    const organizacionId = Number(orgResult.rows[0]?.id);
    assert.ok(Number.isFinite(organizacionId));

    const empresaOne = await client.query<{ id: string }>(
      `
        INSERT INTO empresas (
          organizacion_id,
          tipo_empresa,
          nombre_empresa,
          nit,
          representante_legal,
          documento_representante,
          telefono,
          correo,
          direccion,
          ciudad,
          departamento,
          activo
        )
        VALUES
          ($1::bigint, 'S.A.S.', $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE)
        RETURNING id::text AS id
      `,
      [organizacionId, 'ADMIN-2A TEMP EMPRESA 1', `ADMIN2A-TEMP-NIT-${Date.now()}`]
    );

    assert.equal(empresaOne.rowCount, 1);

    const empresasMany = await client.query<NumericRow>(
      `
        INSERT INTO empresas (
          organizacion_id,
          tipo_empresa,
          nombre_empresa,
          nit,
          representante_legal,
          documento_representante,
          telefono,
          correo,
          direccion,
          ciudad,
          departamento,
          activo
        )
        VALUES
          ($1::bigint, 'S.A.S.', $2, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, TRUE)
      `,
      [organizacionId, 'ADMIN-2A TEMP EMPRESA 2', `ADMIN2A-TEMP-NIT-B-${Date.now()}`]
    );

    assert.equal(empresasMany.rowCount, 1);

    const orgCompanyCount = await client.query<NumericRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM empresas
        WHERE organizacion_id = $1::bigint
      `,
      [organizacionId]
    );

    assert.equal(orgCompanyCount.rows[0]?.total, 2);

    await client.query('ROLLBACK');

    const tenantUserResult = await client.query<{
      empresa_id: string;
      user_id: string;
    }>(
      `
        SELECT ue.usuario_id::text AS user_id, ue.empresa_id::text AS empresa_id
        FROM usuario_empresas ue
        INNER JOIN usuarios u ON u.id = ue.usuario_id
        LEFT JOIN usuario_roles ur ON ur.usuario_id = u.id AND COALESCE(ur.activo, TRUE) = TRUE
        LEFT JOIN roles r ON r.id = ur.rol_id AND COALESCE(r.activo, TRUE) = TRUE
        WHERE COALESCE(ue.activo, TRUE) = TRUE
          AND COALESCE(u.activo, TRUE) = TRUE
        GROUP BY ue.usuario_id, ue.empresa_id
        HAVING BOOL_OR(r.nombre_rol = 'ADMINISTRADOR') = FALSE
        ORDER BY ue.usuario_id ASC, ue.empresa_id ASC
        LIMIT 1
      `
    );

    const tenantUserId = tenantUserResult.rows[0]?.user_id;
    const allowedEmpresaId = Number(tenantUserResult.rows[0]?.empresa_id ?? 0);

    assert.ok(tenantUserId);
    assert.ok(Number.isFinite(allowedEmpresaId) && allowedEmpresaId > 0);

    const forbiddenEmpresaResult = await client.query<{ id: string }>(
      `
        SELECT e.id::text AS id
        FROM empresas e
        WHERE e.id <> $1::bigint
          AND NOT EXISTS (
            SELECT 1
            FROM usuario_empresas ue
            WHERE ue.usuario_id::text = $2
              AND ue.empresa_id = e.id
              AND COALESCE(ue.activo, TRUE) = TRUE
          )
        ORDER BY e.id ASC
        LIMIT 1
      `,
      [allowedEmpresaId, tenantUserId]
    );

    const forbiddenEmpresaId = Number(forbiddenEmpresaResult.rows[0]?.id ?? 0);
    assert.ok(Number.isFinite(forbiddenEmpresaId) && forbiddenEmpresaId > 0);

    const tenant = await loadTenantAccess(tenantUserId, client);
    assert.equal(hasTenantEmpresaAccess(tenant, allowedEmpresaId), true);
    assert.equal(hasTenantEmpresaAccess(tenant, forbiddenEmpresaId), false);

    const tenantContext = await getTenantMeContext(tenant);
    assert.ok(tenantContext.empresas.some((empresa) => empresa.id === allowedEmpresaId));
    assert.ok(
      tenantContext.empresas.every(
        (empresa) =>
          empresa.organizacion !== null &&
          Number.isFinite(empresa.organizacion.id)
      )
    );
    assert.ok(
      tenantContext.organizacion_default_id === null ||
        tenantContext.organizaciones.some(
          (organizacion) => organizacion.id === tenantContext.organizacion_default_id
        )
    );

    console.log('ADMIN-2A tenant/company validation passed.');
    console.log(
      JSON.stringify({
        tenantUserId,
        allowedEmpresaId,
        forbiddenEmpresaId,
        organizaciones: tenantContext.organizaciones.length,
        empresas: tenantContext.empresas.length
      })
    );
  } finally {
    client.release();
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error('ADMIN-2A tenant/company validation failed.');
  console.error(error);
  process.exitCode = 1;
});
