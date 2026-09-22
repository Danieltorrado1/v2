import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('DCO queda en catálogo con efecto económico neutro', () => {
  const sql = readFileSync('sql/phase-41-nomina-dco-dia-compensatorio.sql', 'utf8');
  assert.match(sql, /'DCO'/);
  assert.match(sql, /WHERE NOT EXISTS \(\s*SELECT 1 FROM nomina_tipos_novedad/);
  assert.doesNotMatch(sql, /INSERT INTO nomina_(?:novedades|efectos)/i);
  assert.match(sql, /nombre = 'D[íi]a compensatorio'/i);
  assert.match(sql, /afecta_salario = FALSE/);
  assert.match(sql, /afecta_transporte = FALSE/);
  assert.match(sql, /afecta_recargos = FALSE/);
  assert.match(sql, /efecto_pago = 'SIN_EFECTO'/);
  assert.match(sql, /efecto_operativo = 'SIN_EFECTO'/);
  assert.match(sql, /permite_asistencia_simultanea = TRUE/);
});

test('TA queda en catálogo como novedad informativa neutra y compatible con presencia', () => {
  const sql = readFileSync('sql/phase-42-nomina-ta-turno-adicional.sql', 'utf8');
  assert.match(sql, /'TA'/);
  assert.match(sql, /'TURNO ADICIONAL'/);
  assert.match(sql, /WHERE NOT EXISTS \(\s*SELECT 1 FROM nomina_tipos_novedad/);
  assert.match(sql, /afecta_salario = FALSE/);
  assert.match(sql, /afecta_transporte = FALSE/);
  assert.match(sql, /afecta_recargos = FALSE/);
  assert.match(sql, /efecto_liquidacion = 'SIN_EFECTO'/);
  assert.match(sql, /permite_asistencia_simultanea = TRUE/);
  assert.doesNotMatch(sql, /INSERT INTO nomina_(?:novedades|efectos)/i);
});

test('la planilla pinta códigos de novedad con clases visuales estables', () => {
  const css = readFileSync('FrontendNuevo/src/pages/nomina/nominaNovedadVisual.css', 'utf8');
  for (const code of ['PR1', 'PNR', 'S', 'PR2', 'DCO', 'TA']) {
    assert.match(css, new RegExp(`op-novelty-code-${code}`));
  }
  assert.match(css, /op-novelty-code-DCO[^\n]*#16a34a/);
  assert.match(css, /op-novelty-code-TA[^\n]*#4338ca/);
});

test('DCO y TA no reemplazan asistencia en frontend ni backend', () => {
  const page = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
  const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
  assert.match(page, /permite_asistencia_simultanea !== true/);
  assert.match(service, /!toBooleanValue\(tipoNovedad\.permite_asistencia_simultanea\)/);
});
