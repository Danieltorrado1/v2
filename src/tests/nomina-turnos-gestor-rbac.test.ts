import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const read = (file: string) => readFileSync(path.resolve(file), 'utf8');
const layout = read('FrontendNuevo/src/layouts/MainLayout.tsx');
const flow = read('FrontendNuevo/src/pages/nomina/CoberturaFlowNav.tsx');
const router = read('FrontendNuevo/src/router/AppRouter.tsx');
const turnos = read('FrontendNuevo/src/pages/nomina/TurnosPage.tsx');
const routes = read('src/modules/nomina/nomina.routes.ts');
const service = read('src/modules/nomina/nomina.service.ts');

test('Turnos usa la capability operativa en navegación y route guard', () => {
  for (const source of [layout, flow, router]) {
    assert.match(source, /nomina\/turnos[\s\S]{0,160}nomina\.operativa\.read/);
  }
});

test('endpoints operativos de turnos usan permiso operativo y conservan endpoint económico separado', () => {
  assert.match(routes, /externos-operativos'[\s\S]{0,100}nomina\.operativa\.read/);
  assert.match(routes, /movimientos-operativos'[\s\S]{0,100}nomina\.operativa\.read/);
  assert.match(routes, /'\/movimientos',[\s\S]{0,120}rejectRoles\('GESTOR'\)[\s\S]{0,120}nomina\.movimientos\.read/);
});

test('DTO operativo elimina importes y datos económicos', () => {
  assert.match(service, /getNominaMovimientosOperativos[\s\S]*valor_aplicado:[\s\S]*valor_calculado:[\s\S]*valor_total:[\s\S]*valor_unitario:[\s\S]*es_devengado:[\s\S]*es_deduccion:[\s\S]*afecta_seguridad_social:/);
  assert.match(service, /listNominaEmpleadosOperativos[\s\S]*salario_base:[\s\S]*salud:[\s\S]*pension:[\s\S]*neto_pagar:[\s\S]*detalle_calculo:/);
});

test('pantalla decide por permiso económico y usa loaders operativos cuando falta', () => {
  assert.match(turnos, /canSeeEconomic = user\?\.permissions\.includes\("nomina\.economico\.read"\)/);
  assert.match(turnos, /canSeeEconomic[\s\S]*getAllNominaTurnos[\s\S]*getAllNominaTurnosOperativos/);
  assert.match(turnos, /canSeeEconomic[\s\S]*getCoberturaExternos[\s\S]*getCoberturaExternosOperativos/);
  assert.match(turnos, /canSeeEconomic \? <span>Valor<\/span> : null/);
  assert.match(turnos, /canSeeEconomic \? <div className="np-detail-total">/);
});

test('GESTOR conserva solo el flujo COBERTURA operativo', () => {
  assert.match(flow, /\["\/nomina\/planilla-operativa", "\/nomina\/turnos", "\/nomina\/novedades"\]/);
  assert.match(router, /nomina\/liquidacion[\s\S]{0,180}denyRoles=\{\["GESTOR"\]\}/);
  assert.match(router, /nomina\/gestion[\s\S]{0,180}denyRoles=\{\["GESTOR"\]\}/);
});
