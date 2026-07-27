import assert from 'node:assert/strict';

import { dbQuery } from '../config/db';
import {
  createContrato,
  createContratoCargo,
  createEmpresa,
  getEmpresaById,
  listContratoCargos,
  listContratos,
  listEmpresas,
  listPermissions,
  listRoles,
  setContratoActiveState,
  setContratoCargoActiveState,
  setEmpresaActiveState,
  updateEmpresa,
  type ActorMeta
} from '../modules/configuracion/configuracion.admin.service';

const resolveActor = async (): Promise<ActorMeta> => {
  const result = await dbQuery<{ id: string }>(
    `SELECT id::text AS id FROM usuarios WHERE COALESCE(activo, TRUE) = TRUE ORDER BY id ASC LIMIT 1`
  );
  const userId = result.rows[0]?.id;

  if (!userId) {
    throw new Error('No active usuarios row found for audit test');
  }

  return {
    userId,
    ip: '127.0.0.1',
    userAgent: 'administracion-test-script'
  };
};

const expectAppErrorCode = async (work: Promise<unknown>, expectedCode: string): Promise<void> => {
  try {
    await work;
    assert.fail(`Expected error code ${expectedCode}`);
  } catch (error) {
    const code = (error as { code?: string }).code;
    assert.equal(code, expectedCode);
  }
};

const main = async (): Promise<void> => {
  const actor = await resolveActor();

  const empresas = await listEmpresas({ page: 1, limit: 5 });
  assert.ok(empresas.items.length > 0, 'Empresas list should not be empty');

  const contratos = await listContratos({ page: 1, limit: 5, empresa_id: empresas.items[0]?.id });
  assert.ok(contratos.items.length >= 0, 'Contratos list should be queryable by empresa_id');

  const cargos = await listContratoCargos({ page: 1, limit: 5, contrato_id: contratos.items[0]?.id });
  assert.ok(cargos.items.length >= 0, 'Cargos list should be queryable by contrato_id');

  const roles = await listRoles();
  const permissions = await listPermissions();
  assert.ok(roles.length > 0, 'Roles should be listed');
  assert.ok(permissions.some((item) => item.codigo === 'empresas.read'), 'New permissions should be present');

  await expectAppErrorCode(getEmpresaById(999999999), 'EMPRESA_NOT_FOUND');

  const uniqueToken = Date.now();
  const empresa = await createEmpresa(
    {
      tipo_empresa: 'S.A.S.',
      nombre_empresa: `ZZ_TEST_ADMIN_${uniqueToken}`,
      nit: `TEST-${uniqueToken}`,
      representante_legal: 'Tester',
      documento_representante: '12345',
      telefono: '3000000000',
      correo: `test${uniqueToken}@example.com`,
      direccion: 'Calle 1',
      ciudad: 'Bogota',
      departamento: 'Cundinamarca'
    },
    actor
  );

  await expectAppErrorCode(
    createEmpresa(
      {
        tipo_empresa: 'S.A.S.',
        nombre_empresa: `ZZ_TEST_ADMIN_DUP_${uniqueToken}`,
        nit: empresa.nit,
        representante_legal: null,
        documento_representante: null,
        telefono: null,
        correo: null,
        direccion: null,
        ciudad: null,
        departamento: null
      },
      actor
    ),
    'EMPRESA_NIT_DUPLICATE'
  );

  const empresaUpdated = await updateEmpresa(
    empresa.id,
    { telefono: '3111111111', ciudad: 'Villavicencio' },
    actor
  );
  assert.equal(empresaUpdated.telefono, '3111111111');

  const contrato = await createContrato(
    {
      empresa_id: empresa.id,
      numero_contrato: `TEST-CONTRATO-${uniqueToken}`,
      numero_licitacion: `LIC-${uniqueToken}`,
      entidad_contratante: 'ENTIDAD TEST',
      fecha_inicio: '2026-07-01',
      fecha_finalizacion: '2026-07-31',
      objeto_contractual: 'Contrato de prueba',
      aplica_cobertura: false
    },
    actor
  );

  const cargo = await createContratoCargo(
    {
      contrato_id: contrato.id,
      nombre_cargo: `CARGO TEST ${uniqueToken}`,
      cantidad_requerida: 1,
      aplica_cobertura: false
    },
    actor
  );

  const cargoOff = await setContratoCargoActiveState(cargo.id, false, actor, 'test de desactivacion');
  assert.equal(cargoOff.activo, false);

  const cargoOn = await setContratoCargoActiveState(cargo.id, true, actor, 'test de reactivacion');
  assert.equal(cargoOn.activo, true);

  const contratoOff = await setContratoActiveState(contrato.id, false, actor, 'test de desactivacion');
  assert.equal(contratoOff.activo, false);

  const empresaOff = await setEmpresaActiveState(empresa.id, false, actor, 'test de desactivacion final');
  assert.equal(empresaOff.activo, false);

  const usedCargoResult = await dbQuery<{ cargo_id: string }>(
    `
      SELECT contrato_cargo_id::text AS cargo_id
      FROM vinculaciones
      WHERE contrato_cargo_id IS NOT NULL
        AND estado_vinculacion IN ('ACTIVA', 'ACTIVO')
      LIMIT 1
    `
  );
  const usedCargoId = Number(usedCargoResult.rows[0]?.cargo_id ?? 0);
  if (usedCargoId > 0) {
    await expectAppErrorCode(
      setContratoCargoActiveState(usedCargoId, false, actor, 'debe fallar por uso activo'),
      'CONTRATO_CARGO_HAS_ACTIVE_VINCULACIONES'
    );
  }

  const auditResult = await dbQuery<{ total: number }>(
    `
      SELECT COUNT(*)::int AS total
      FROM auditoria_eventos
      WHERE entidad IN ('empresas', 'contratos', 'contrato_cargos')
        AND entidad_id IN ($1, $2, $3)
    `,
    [String(empresa.id), String(contrato.id), String(cargo.id)]
  );
  assert.ok((auditResult.rows[0]?.total ?? 0) >= 6, 'Audit entries should have been created');

  console.log('Administracion catalogos test passed.');
  console.log(JSON.stringify({ empresaId: empresa.id, contratoId: contrato.id, cargoId: cargo.id }));
};

void main().catch((error) => {
  console.error('Administracion catalogos test failed.');
  console.error(error);
  process.exitCode = 1;
});
