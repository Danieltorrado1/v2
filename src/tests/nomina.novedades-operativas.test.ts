import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OFFICIAL_NOMINA_NOVEDAD_CODES,
  resolveNominaNovedadTypeSelection
} from '../modules/nomina/nomina.novedades';

const catalog = [
  { id: '1', codigo_operativo: 'DNC', nombre: 'Dia no clase', activo: true },
  { id: '2', codigo_operativo: 'PR1', nombre: 'Permiso remunerado 1', activo: true },
  { id: '3', codigo_operativo: 'PNR', nombre: 'Permiso no remunerado', activo: true },
  { id: '4', codigo_operativo: 'S', nombre: 'Suspension', activo: true },
  { id: '5', codigo_operativo: 'FNJ', nombre: 'Falla no justificada', activo: true },
  { id: '6', codigo_operativo: 'INC_ARL', nombre: 'Incapacidad por accidente laboral', activo: true },
  { id: '7', codigo_operativo: 'LEGACY', nombre: 'Inactivo', activo: false }
];

test('official novelty catalog includes COBERTURA v1.0 codes', () => {
  const codes = OFFICIAL_NOMINA_NOVEDAD_CODES.map((item) => item.code);
  for (const code of ['DNC', 'PR1', 'PR2', 'PR3', 'PR4', 'PNR', 'FNJ', 'S', 'INC_GENERAL', 'INC_ARL'] as const) {
    assert.equal(codes.includes(code), true, code);
  }
});

test('resolves by code case-insensitively', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { codigo_operativo: 'pnr' });
  assert.equal(match.id, '3');
});

test('resolves by historical alias L50 -> DNC', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { codigo_operativo: 'l50' });
  assert.equal(match.id, '1');
});

test('resolves ARL historical alias', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { codigo_operativo: 'incap_acl' });
  assert.equal(match.id, '6');
});

test('resolves by normalized name alias', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { nombre: 'Dia de no clase' });
  assert.equal(match.id, '1');
});

test('resolves by id', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { id: '3' });
  assert.equal(match.codigo_operativo, 'PNR');
});

test('throws when code does not exist', () => {
  assert.throws(
    () => resolveNominaNovedadTypeSelection(catalog, { codigo_operativo: 'XYZ' }),
    (error: unknown) => (error as { code?: string })?.code === 'NOMINA_TIPO_NOVEDAD_CODIGO_NOT_FOUND'
  );
});

test('throws when selected type is inactive', () => {
  assert.throws(
    () => resolveNominaNovedadTypeSelection(catalog, { id: '7' }),
    (error: unknown) => (error as { code?: string })?.code === 'NOMINA_TIPO_NOVEDAD_INACTIVO'
  );
});
