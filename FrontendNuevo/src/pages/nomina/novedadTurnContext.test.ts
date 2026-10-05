import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requiresNovedadTurnContext, novedadTurnContext, isNovedadTurnContextMissing } from './novedadTurnContext';

const context = { institucion_id: '1', sede_id: '2', modalidad_id: '3' };
for (const [codigo, cobertura] of [
  ['PNR', 'PERSONA_EXTERNA'], ['SUSPENSIÓN', 'PERSONA_EXTERNA'], ['S', 'PERSONA_EXTERNA'],
  ['PR1', 'PERSONA_EXTERNA'], ['INCAPACIDAD', 'PERSONAL_VINCULADO'],
  ['PERMISO', 'SIN_REEMPLAZO'], ['AUSENCIA', 'PERSONA_EXTERNA'],
]) {
  test(`${codigo} + ${cobertura}: oculta contexto, permite guardar sin destino y omite valores anteriores`, () => {
    assert.equal(requiresNovedadTurnContext(codigo), false);
    assert.equal(isNovedadTurnContextMissing(codigo, null), false);
    assert.equal(novedadTurnContext(codigo, context), null);
  });
}
for (const key of ['institucion_id', 'sede_id', 'modalidad_id'] as const) {
  test(`TURNO_ADICIONAL sin ${key} bloquea`, () => {
    assert.equal(isNovedadTurnContextMissing('TURNO_ADICIONAL', { ...context, [key]: '' }), true);
  });
}
test('TURNO_ADICIONAL completo muestra contexto y permite guardar', () => {
  assert.equal(requiresNovedadTurnContext('TURNO_ADICIONAL'), true);
  assert.equal(isNovedadTurnContextMissing('TURNO_ADICIONAL', context), false);
  assert.deepEqual(novedadTurnContext('TURNO_ADICIONAL', context), context);
});
test('TURNO_ADICIONAL -> PNR limpia los tres destinos y elimina validación', () => {
  const previous = novedadTurnContext('TURNO_ADICIONAL', context);
  const next = novedadTurnContext('PNR', previous);
  assert.equal(next, null);
  for (const key of ['institucion_id', 'sede_id', 'modalidad_id'] as const) assert.equal(next?.[key], undefined);
  assert.equal(requiresNovedadTurnContext('PNR'), false);
  assert.equal(isNovedadTurnContextMissing('PNR', next), false);
});
test('formulario conecta visibilidad, limpieza, validación y payload exclusivamente al tipo', () => {
  const source = readFileSync('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx', 'utf8');
  assert.match(source, /const requiresTurnContext = requiresNovedadTurnContext\(selectedType\?\.codigo_operativo\)/);
  assert.match(source, /\{requiresTurnContext \? <TurnContextFields/);
  assert.match(source, /useEffect\(\(\) => \{\s*setTurnContext\(current => novedadTurnContext\(selectedType\?\.codigo_operativo, current\)\);\s*\}, \[selectedType\?\.codigo_operativo\]\)/);
  assert.match(source, /if \(isNovedadTurnContextMissing\(selectedType.codigo_operativo, turnContext\)\)/);
  assert.match(source, /\.\.\.novedadTurnContext\(selectedType.codigo_operativo, turnContext\)/);
  assert.doesNotMatch(source, /coverageType !== 'SIN_REEMPLAZO' && !turnContext/);
});
