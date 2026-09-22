import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveCoberturaPersonal } from '../modules/operacion/operacion.cobertura.domain';

const industrial = (maximo: number | null, personal: number) => ({ minimo: personal === 0 ? 0 : personal === 1 ? 101 : personal === 2 ? 301 : personal === 3 ? 501 : 801, maximo, personal, mensaje: null });
const industrialRule = { tipo: 'INDUSTRIALIZADA', multiplicador: 1, rangos: [industrial(100, 0), industrial(300, 1), industrial(500, 2), industrial(800, 3), industrial(null, 4)] };
const almuerzoRule = { tipo: 'PREPARADA_EN_SITIO_ALMUERZO', multiplicador: 1, rangos: [{ minimo: 0, maximo: 60, personal: 1, mensaje: null }, { minimo: 61, maximo: 150, personal: 2, mensaje: null }, { minimo: 1001, maximo: 1500, personal: 7, mensaje: null }] };

test('industrializada clasifica límites y 801 como cuatro', () => {
  for (const [raciones, personal] of [[0, 0], [100, 0], [101, 1], [300, 1], [301, 2], [500, 2], [501, 3], [800, 3], [801, 4], [900, 4]] as Array<[number, number]>) {
    assert.equal(resolveCoberturaPersonal({ modalidadCodigo: 'CAJM/JT-RI', raciones, vinculadas: personal, regla: industrialRule }).requeridas, personal);
  }
});

test('residencias aplica multiplicador cuatro y rechaza más de 2500', () => {
  const rule = { tipo: 'PREPARADA_EN_SITIO_RESIDENCIAS', multiplicador: 4, rangos: [{ minimo: 0, maximo: 2500, personal: 11, mensaje: null }] };
  assert.equal(resolveCoberturaPersonal({ modalidadCodigo: 'CAARES', raciones: 625, vinculadas: 11, regla: rule }).raciones_calculadas, 2500);
  assert.equal(resolveCoberturaPersonal({ modalidadCodigo: 'CAARES', raciones: 626, vinculadas: 0, regla: rule }).estado, 'FUERA_DE_RANGO');
});

test('modalidad sin regla y personal requerido', () => {
  assert.equal(resolveCoberturaPersonal({ modalidadCodigo: 'OTRA', raciones: 10, vinculadas: 0, regla: null }).estado, 'MODALIDAD_SIN_REGLA');
  assert.equal(resolveCoberturaPersonal({ modalidadCodigo: 'CAA', raciones: 10, vinculadas: 1, regla: almuerzoRule }).estado, 'COMPLETA');
});

test('cero cupos es servicio no focalizado y no aplica rangos', () => {
  const rule = { tipo: 'PREPARADA_EN_SITIO_ALMUERZO', multiplicador: 1, rangos: [{ minimo: 0, maximo: 60, personal: 1, mensaje: null }] };
  for (const modalidad of ['CAA', 'CAA-JU', 'CAARES']) {
    const result = resolveCoberturaPersonal({ modalidadCodigo: modalidad, raciones: 0, cuposFocalizados: 0, vinculadas: 0, regla: rule });
    assert.equal(result.requeridas, 0);
    assert.equal(result.vinculadas, 0);
    assert.equal(result.diferencia, 0);
    assert.equal(result.estado, 'SIN_SERVICIO_FOCALIZADO');
    assert.equal(result.mensaje, 'La sede no tiene cupos focalizados para esta modalidad.');
  }
});

test('cero cupos conserva vinculadas y advierte personal sin servicio', () => {
  const result = resolveCoberturaPersonal({ modalidadCodigo: 'CAA', raciones: 0, cuposFocalizados: 0, vinculadas: 2, regla: { tipo: 'ALMUERZO', multiplicador: 1, rangos: [] } });
  assert.equal(result.requeridas, 0);
  assert.equal(result.vinculadas, 2);
  assert.equal(result.diferencia, 2);
  assert.equal(result.estado, 'SIN_SERVICIO_FOCALIZADO');
  assert.ok(result.advertencia);
});

test('residencia con un beneficiario aplica cuatro raciones y una requerida', () => {
  const result = resolveCoberturaPersonal({ modalidadCodigo: 'CAARES', raciones: 1, cuposFocalizados: 1, vinculadas: 1, regla: { tipo: 'PREPARADA_EN_SITIO_RESIDENCIAS', multiplicador: 4, rangos: [{ minimo: 0, maximo: 60, personal: 1, mensaje: null }] } });
  assert.equal(result.raciones_calculadas, 4);
  assert.equal(result.requeridas, 1);
  assert.equal(result.estado, 'COMPLETA');
});

test('un cupo en almuerzo requiere una manipuladora', () => {
  const result = resolveCoberturaPersonal({ modalidadCodigo: 'CAA', raciones: 1, cuposFocalizados: 1, vinculadas: 0, regla: { tipo: 'ALMUERZO', multiplicador: 1, rangos: [{ minimo: 0, maximo: 60, personal: 1, mensaje: null }] } });
  assert.equal(result.requeridas, 1);
  assert.equal(result.estado, 'FALTANTE');
});
