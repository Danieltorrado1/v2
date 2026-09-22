import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const turnosPage = readFileSync('FrontendNuevo/src/pages/nomina/TurnosPage.tsx', 'utf8');
const nominaService = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const nominaSchemas = readFileSync('src/modules/nomina/nomina.schemas.ts', 'utf8');

test('apoyo por mercado persiste como turno adicional y no como novedad de ausencia', () => {
  assert.match(turnosPage, /APOYO_MERCADO/);
  assert.match(turnosPage, /Apoyo adicional por mercado/);
  assert.match(turnosPage, /familia_movimiento: "ADICION_DEVENGO"/);
  assert.match(turnosPage, /createNominaTurno\(payload\)/);
  assert.doesNotMatch(turnosPage, /createNominaNovedad\(/);
});

test('el movimiento de apoyo conserva referencia opcional y no muta asistencia del titular', () => {
  assert.match(nominaSchemas, /persona_reemplazada_id: identifierSchema\.nullable\(\)/);
  assert.match(nominaService, /familia_movimiento.*ADICION_DEVENGO/);
  assert.match(nominaService, /tipo_movimiento.*TURNO_INTERNO.*TURNO_EXTERNO/);
  assert.doesNotMatch(nominaService, /createNominaMovimiento[\s\S]{0,500}nomina_asistencia_diaria/);
});

test('la cobertura externa mantiene identidad documental separada', () => {
  assert.match(nominaService, /COBERTURA_EXTERNO_IDENTIDAD_REQUERIDA/);
  assert.match(nominaService, /INSERT INTO cobertura_externos/);
  assert.match(nominaService, /tipo_movimiento: 'TURNO_EXTERNO'/);
});
