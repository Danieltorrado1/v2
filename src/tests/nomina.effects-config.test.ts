import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNominaEffectMatrixFromConfig } from '../modules/nomina/nomina.effects';

test('buildNominaEffectMatrixFromConfig aplica fallback general para salario y transporte', () => {
  const matrix = buildNominaEffectMatrixFromConfig({
    bloquea_otras_novedades: false,
    codigo_operativo: 'QA',
    afecta_salario: true,
    afecta_transporte: true,
    efecto_auxilio_transporte: null,
    efecto_cobertura_config: null,
    efecto_liquidacion: null,
    efecto_operativo: null,
    efecto_recargos_detallado: null,
    efecto_salario: null,
    grupo_exclusividad: null,
    modelo_registro: null,
    nombre: 'Control QA',
    observacion_plantilla: null,
    proyecta_periodos: false,
  });

  assert.equal(matrix.efecto_salario, 'DESCUENTA_PROPORCIONAL');
  assert.equal(matrix.efecto_transporte, 'DESCUENTA_DIA');
  assert.equal(matrix.efecto_recargos, 'SIN_EFECTO');
});

test('buildNominaEffectMatrixFromConfig respeta efectos explicitos y no los reemplaza por flags booleanos', () => {
  const matrix = buildNominaEffectMatrixFromConfig({
    bloquea_otras_novedades: false,
    codigo_operativo: 'PR1',
    afecta_salario: true,
    afecta_transporte: true,
    efecto_auxilio_transporte: 'DESCUENTA_DIA',
    efecto_cobertura_config: null,
    efecto_liquidacion: null,
    efecto_operativo: null,
    efecto_recargos_detallado: 'SIN_EFECTO',
    efecto_salario: 'SIN_EFECTO',
    grupo_exclusividad: null,
    modelo_registro: 'POR_PERIODO',
    nombre: 'Permiso remunerado 1',
    observacion_plantilla: null,
    proyecta_periodos: false,
  });

  assert.equal(matrix.efecto_salario, 'SIN_EFECTO');
  assert.equal(matrix.efecto_transporte, 'DESCUENTA_DIA');
});
