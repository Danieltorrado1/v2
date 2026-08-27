import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { dbQuery } from '../config/db';
import { assertEmpresaModuleEnabled } from '../modules/saas/saas.service';
import { resolveEmpresaId } from '../modules/saas/saas.middleware';

const globalTenant = { isGlobalAdmin: true, empresaIds: [], contratoIds: [] };

interface PayrollLinkRow {
  empresa_id: string;
  nomina_empleado_id: string;
  periodo_id: string;
  vinculacion_id: string;
}

async function loadPayrollLink(): Promise<PayrollLinkRow | null> {
  return (
    await dbQuery<PayrollLinkRow>(
      `
        SELECT
          c.empresa_id::text AS empresa_id,
          ne.id::text AS nomina_empleado_id,
          np.id::text AS periodo_id,
          ne.vinculacion_id::text AS vinculacion_id
        FROM nomina_empleados ne
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        ORDER BY np.id ASC, ne.id ASC
        LIMIT 1
      `
    )
  ).rows[0] ?? null;
}

async function loadCrossCompanyPayrollLink(empresaId: string): Promise<PayrollLinkRow | null> {
  return (
    await dbQuery<PayrollLinkRow>(
      `
        SELECT
          c.empresa_id::text AS empresa_id,
          ne.id::text AS nomina_empleado_id,
          np.id::text AS periodo_id,
          ne.vinculacion_id::text AS vinculacion_id
        FROM nomina_empleados ne
        INNER JOIN nomina_periodos np ON np.id = ne.periodo_id
        INNER JOIN contratos c ON c.id = np.contrato_id
        WHERE c.empresa_id <> $1::bigint
        ORDER BY np.id ASC, ne.id ASC
        LIMIT 1
      `,
      [empresaId]
    )
  ).rows[0] ?? null;
}

test('4B.7: revision operativa resuelve empresa desde periodo y empleado en la ruta real del router', async () => {
  const row = await loadPayrollLink();
  if (!row) return;

  const request = {
    originalUrl: `/api/nomina/periodos/${row.periodo_id}/revision-operativa/${row.nomina_empleado_id}`,
    params: {},
    query: {},
    body: { estado_revision: 'REVISADO' },
    tenant: globalTenant,
  } as any;

  assert.equal(await resolveEmpresaId(request), Number(row.empresa_id));
});

test('4B.7: asistencia operativa resuelve empresa desde la ruta real y valida vinculacion del snapshot', async () => {
  const row = await loadPayrollLink();
  if (!row) return;

  const request = {
    originalUrl: `/api/nomina/periodos/${row.periodo_id}/asistencia/marcar`,
    params: {},
    query: {},
    body: { vinculacion_id: row.vinculacion_id, fecha: '2026-08-01', presente: true },
    tenant: globalTenant,
  } as any;

  assert.equal(await resolveEmpresaId(request), Number(row.empresa_id));
});


test('4B.7: periodo B mas empleado B resuelve empresa del segundo contexto', async () => {
  const rowA = await loadPayrollLink();
  if (!rowA) return;
  const rowB = await loadCrossCompanyPayrollLink(rowA.empresa_id);
  if (!rowB) return;

  const request = {
    originalUrl: `/api/nomina/periodos/${rowB.periodo_id}/revision-operativa/${rowB.nomina_empleado_id}`,
    params: {},
    query: {},
    body: { estado_revision: 'REVISADO' },
    tenant: globalTenant,
  } as any;

  assert.equal(await resolveEmpresaId(request), Number(rowB.empresa_id));
});

test('4B.7: periodo B mas vinculacion B resuelve empresa del segundo contexto', async () => {
  const rowA = await loadPayrollLink();
  if (!rowA) return;
  const rowB = await loadCrossCompanyPayrollLink(rowA.empresa_id);
  if (!rowB) return;

  const request = {
    originalUrl: `/api/nomina/periodos/${rowB.periodo_id}/asistencia/marcar`,
    params: {},
    query: {},
    body: { vinculacion_id: rowB.vinculacion_id, fecha: '2026-08-01', presente: true },
    tenant: globalTenant,
  } as any;

  assert.equal(await resolveEmpresaId(request), Number(rowB.empresa_id));
});

test('4B.7: periodo inexistente ya no cae en EMPRESA_CONTEXT_REQUIRED sino en error de entidad', async () => {
  await assert.rejects(
    () =>
      resolveEmpresaId({
        originalUrl: '/api/nomina/periodos/999999999/revision-operativa/130',
        params: {},
        query: {},
        body: { estado_revision: 'REVISADO' },
        tenant: globalTenant,
      } as any),
    (error: any) => error?.code === 'NOMINA_PERIODO_NOT_FOUND'
  );
});

test('4B.7: periodo A mas empleado B bloquea cruces entre contextos empresariales', async () => {
  const rowA = await loadPayrollLink();
  if (!rowA) return;
  const rowB = await loadCrossCompanyPayrollLink(rowA.empresa_id);
  if (!rowB) return;

  await assert.rejects(
    () =>
      resolveEmpresaId({
        originalUrl: `/api/nomina/periodos/${rowA.periodo_id}/revision-operativa/${rowB.nomina_empleado_id}`,
        params: {},
        query: {},
        body: { estado_revision: 'REVISADO' },
        tenant: globalTenant,
      } as any),
    (error: any) => error?.code === 'NOMINA_CONTEXT_MISMATCH'
  );
});

test('4B.7: periodo A mas vinculacion B bloquea cruces entre contextos empresariales', async () => {
  const rowA = await loadPayrollLink();
  if (!rowA) return;
  const rowB = await loadCrossCompanyPayrollLink(rowA.empresa_id);
  if (!rowB) return;

  await assert.rejects(
    () =>
      resolveEmpresaId({
        originalUrl: `/api/nomina/periodos/${rowA.periodo_id}/asistencia/marcar`,
        params: {},
        query: {},
        body: { vinculacion_id: rowB.vinculacion_id, fecha: '2026-08-01', presente: true },
        tenant: globalTenant,
      } as any),
    (error: any) => error?.code === 'NOMINA_PERIODO_VINCULACION_INVALIDA'
  );
});

test('4B.7: empresa explicita incompatible queda bloqueada contra la entidad autoritativa', async () => {
  const rowA = await loadPayrollLink();
  if (!rowA) return;
  const rowB = await loadCrossCompanyPayrollLink(rowA.empresa_id);
  if (!rowB) return;

  await assert.rejects(
    () =>
      resolveEmpresaId({
        originalUrl: `/api/nomina/periodos/${rowA.periodo_id}/revision-operativa/${rowA.nomina_empleado_id}`,
        params: {},
        query: { empresa_id: rowB.empresa_id },
        body: { estado_revision: 'REVISADO' },
        tenant: globalTenant,
      } as any),
    (error: any) => error?.code === 'EMPRESA_CONTEXT_MISMATCH'
  );
});

test('4B.7: tenant de empresa A no puede operar empresa B aunque el contexto se resuelva desde la entidad', async () => {
  const rowA = await loadPayrollLink();
  if (!rowA) return;
  const rowB = await loadCrossCompanyPayrollLink(rowA.empresa_id);
  if (!rowB) return;

  await assert.rejects(
    () => assertEmpresaModuleEnabled(Number(rowB.empresa_id), 'NOMINA', {
      isGlobalAdmin: false,
      empresaIds: [Number(rowA.empresa_id)],
      contratoIds: [],
      userId: undefined,
    } as any),
    (error: any) => error?.code === 'TENANT_FORBIDDEN'
  );
});

test('4B.7: el resolver central ya cubre novedades, movimientos, correcciones, liquidaciones finales y cuentas OPS', () => {
  const source = readFileSync(resolve(process.cwd(), 'src/modules/saas/saas.middleware.ts'), 'utf8');
  assert.match(source, /FROM nomina_novedades nn/);
  assert.match(source, /FROM nomina_movimientos nm/);
  assert.match(source, /FROM nomina_correcciones nc/);
  assert.match(source, /FROM nomina_liquidaciones_finales nlf/);
  assert.match(source, /FROM nomina_cuentas_cobro_ops ncco/);
  assert.match(source, /FROM nomina_areas na/);
});
