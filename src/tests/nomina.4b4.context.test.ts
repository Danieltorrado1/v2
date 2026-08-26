import test from 'node:test';
import assert from 'node:assert/strict';
import { dbQuery } from '../config/db';
import { resolveEmpresaId } from '../modules/saas/saas.middleware';

const globalTenant = { isGlobalAdmin: true, empresaIds: [], contratoIds: [] };

test('4B.4: resolver de módulo resuelve empresa desde periodo en ruta real', async () => {
  const row = (await dbQuery<{ id: string; empresa_id: string }>('SELECT np.id::text, c.empresa_id::text FROM nomina_periodos np JOIN contratos c ON c.id=np.contrato_id ORDER BY np.id LIMIT 1')).rows[0];
  if (!row) return;
  const request = { params: { id: row.id }, query: {}, body: {}, tenant: globalTenant } as any;
  assert.equal(await resolveEmpresaId(request), Number(row.empresa_id));
});

test('4B.4: sin empresa ni entidad el middleware conserva bloqueo', async () => {
  await assert.rejects(() => resolveEmpresaId({ params: {}, query: {}, body: {}, tenant: globalTenant } as any), (error: any) => error?.code === 'EMPRESA_CONTEXT_REQUIRED');
});

test('4B.4: Planilla envía empresa al catálogo inicial', async () => {
  const fs = await import('node:fs/promises');
  const source = await fs.readFile(`${process.cwd()}/FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx`, 'utf8');
  assert.match(source, /listarTiposNovedad\(\{[^}]*empresa_id: String\(empresaId\)/s);
});
