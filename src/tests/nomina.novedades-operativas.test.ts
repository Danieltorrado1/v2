import test from 'node:test';
import assert from 'node:assert/strict';

import { AppError } from '../utils/AppError';
import {
  OFFICIAL_NOMINA_NOVEDAD_CODES,
  resolveNominaNovedadTypeSelection
} from '../modules/nomina/nomina.novedades';

const catalog = [
  { id: '1', codigo_operativo: 'L50', nombre: 'DIAS DE NO CLASE', activo: true },
  { id: '2', codigo_operativo: 'PR1', nombre: 'CITA MEDICA', activo: true },
  { id: '3', codigo_operativo: 'PR2', nombre: 'INCAPACIDAD MEDICA', activo: true },
  { id: '4', codigo_operativo: 'PR3', nombre: 'CALAMIDAD FAMILIAR', activo: true },
  { id: '5', codigo_operativo: 'PR4', nombre: 'CITACIONES OFICIALES', activo: true },
  { id: '6', codigo_operativo: 'PNR', nombre: 'PERMISO NO REMUNERADO', activo: true },
  { id: '7', codigo_operativo: 'S', nombre: 'SUSPENSION', activo: true },
  { id: '8', codigo_operativo: 'PR2X', nombre: 'INCAPACIDAD MEDICA HISTORICA', activo: false }
];

test('expone los siete codigos operativos oficiales de nomina', () => {
  assert.deepEqual(
    OFFICIAL_NOMINA_NOVEDAD_CODES.map((item) => item.code),
    ['L50', 'PR1', 'PR2', 'PR3', 'PR4', 'PNR', 'S']
  );
});

test('resuelve L50 por codigo operativo', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { codigo_operativo: 'l50' });
  assert.equal(match.id, '1');
  assert.equal(match.nombre, 'DIAS DE NO CLASE');
});

test('resuelve PR1 por nombre canonico', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { nombre: 'Cita medica' });
  assert.equal(match.codigo_operativo, 'PR1');
});

test('resuelve PR2 por id directo', () => {
  const match = resolveNominaNovedadTypeSelection(catalog, { id: '3' });
  assert.equal(match.codigo_operativo, 'PR2');
});

test('rechaza codigo inexistente', () => {
  assert.throws(
    () => resolveNominaNovedadTypeSelection(catalog, { codigo_operativo: 'XYZ' }),
    (error: unknown) =>
      error instanceof AppError && error.code === 'NOMINA_TIPO_NOVEDAD_CODIGO_NOT_FOUND'
  );
});

test('rechaza tipo inactivo por id', () => {
  assert.throws(
    () => resolveNominaNovedadTypeSelection(catalog, { id: '8' }),
    (error: unknown) =>
      error instanceof AppError && error.code === 'NOMINA_TIPO_NOVEDAD_INACTIVO'
  );
});
