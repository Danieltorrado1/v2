import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDateRangeFromDays,
  countInclusiveDays,
  generateNominaNovedadObservation,
  projectNominaDateRangeToPeriodo,
  projectNominaCanonicalEventsToPeriodo,
  resolveNominaEfectosPorDia,
  type NominaNovedadEffectMatrix
} from '../modules/nomina/nomina.effects';

const agosto = { start: '2026-08-01', end: '2026-08-31' } as const;

const baseEmployment = {
  start: '2026-08-01',
  end: '2026-08-31'
} as const;

const buildMatrix = (
  overrides: Partial<NominaNovedadEffectMatrix> & Pick<NominaNovedadEffectMatrix, 'nombre'>
): NominaNovedadEffectMatrix => ({
  codigo_operativo: null,
  efecto_salario: 'SIN_EFECTO',
  efecto_transporte: 'SIN_EFECTO',
  efecto_recargos: 'SIN_EFECTO',
  efecto_liquidacion: 'SIN_EFECTO',
  efecto_cobertura: 'SIN_EFECTO',
  efecto_operativo: 'SIN_EFECTO',
  modelo_registro: 'POR_PERIODO',
  proyecta_periodos: false,
  bloquea_otras_novedades: false,
  grupo_exclusividad: 'NINGUNA',
  observacion_plantilla: null,
  ...overrides
});

const MATRICES = {
  DNC: buildMatrix({
    codigo_operativo: 'DNC',
    nombre: 'Dia no clase',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA',
    observacion_plantilla: 'Se descuenta transporte y recargos por {dias} dia/dias no clase.'
  }),
  PR1: buildMatrix({
    codigo_operativo: 'PR1',
    nombre: 'Permiso remunerado 1',
    efecto_transporte: 'DESCUENTA_DIA',
    observacion_plantilla: 'Se descuenta transporte por {dias} dia/dias de permiso remunerado.'
  }),
  PR2: buildMatrix({
    codigo_operativo: 'PR2',
    nombre: 'Permiso remunerado 2',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  PR3: buildMatrix({
    codigo_operativo: 'PR3',
    nombre: 'Permiso remunerado 3',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  PR4: buildMatrix({
    codigo_operativo: 'PR4',
    nombre: 'Permiso remunerado 4',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  PNR: buildMatrix({
    codigo_operativo: 'PNR',
    nombre: 'Permiso no remunerado',
    efecto_salario: 'DESCUENTA_PROPORCIONAL',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA'
  }),
  FNJ: buildMatrix({
    codigo_operativo: 'FNJ',
    nombre: 'Falla no justificada',
    efecto_salario: 'DESCUENTA_PROPORCIONAL',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA'
  }),
  S: buildMatrix({
    codigo_operativo: 'S',
    nombre: 'Suspension',
    efecto_salario: 'DESCUENTA_PROPORCIONAL',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA'
  }),
  INC_GENERAL: buildMatrix({
    codigo_operativo: 'INC_GENERAL',
    nombre: 'Incapacidad general',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  INC_ARL: buildMatrix({
    codigo_operativo: 'INC_ARL',
    nombre: 'Incapacidad ARL',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  LICENCIA: buildMatrix({
    codigo_operativo: 'LICENCIA',
    nombre: 'Licencia maternidad/paternidad',
    efecto_salario: 'PENDIENTE_CONFIGURACION',
    efecto_transporte: 'PENDIENTE_CONFIGURACION',
    efecto_recargos: 'EXCLUIR_DIA',
    efecto_liquidacion: 'PREPARAR_LIQUIDACION',
    modelo_registro: 'EVENTO_CANONICO_RANGO',
    proyecta_periodos: true,
    bloquea_otras_novedades: true,
    grupo_exclusividad: 'LICENCIA_MATERNIDAD_PATERNIDAD',
    observacion_plantilla: 'Licencia de maternidad/paternidad del {fecha_inicio} al {fecha_fin}.'
  })
} as const;

const resolveSingle = (matrix: NominaNovedadEffectMatrix, start: string, end = start) =>
  resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: baseEmployment,
    events: [
      {
        origen: 'PERIODO',
        fuente_id: matrix.codigo_operativo ?? matrix.nombre ?? 'TEST',
        fecha_inicio: start,
        fecha_fin: end,
        dias: null,
        matrix
      }
    ]
  });

test('DNC un dia descuenta transporte y recargos sin descontar salario', () => {
  const result = resolveSingle(MATRICES.DNC, '2026-08-12');
  assert.equal(result.dias_salario_descuento, 0);
  assert.equal(result.dias_transporte_descuento, 1);
  assert.equal(result.dias_recargo_excluido, 1);
});

test('PR1 solo descuenta transporte', () => {
  const result = resolveSingle(MATRICES.PR1, '2026-08-07');
  assert.equal(result.dias_salario_descuento, 0);
  assert.equal(result.dias_transporte_descuento, 1);
  assert.equal(result.dias_recargo_excluido, 0);
});

test('PR2, PR3, PR4 e incapacidades solo descuentan transporte', () => {
  for (const key of ['PR2', 'PR3', 'PR4', 'INC_GENERAL', 'INC_ARL'] as const) {
    const result = resolveSingle(MATRICES[key], '2026-08-09');
    assert.equal(result.dias_salario_descuento, 0, key);
    assert.equal(result.dias_transporte_descuento, 1, key);
    assert.equal(result.dias_recargo_excluido, 0, key);
  }
});

test('PNR, FNJ y S descuentan salario, transporte y recargos', () => {
  for (const key of ['PNR', 'FNJ', 'S'] as const) {
    const result = resolveSingle(MATRICES[key], '2026-08-14', '2026-08-16');
    assert.equal(result.dias_salario_descuento, 3, key);
    assert.equal(result.dias_transporte_descuento, 3, key);
    assert.equal(result.dias_recargo_excluido, 3, key);
  }
});

test('licencia dentro de un mes excluye recargos y prepara liquidacion', () => {
  const result = resolveSingle(MATRICES.LICENCIA, '2026-08-20', '2026-08-31');
  assert.equal(result.dias_recargo_excluido, 12);
  assert.equal(result.dias_liquidacion_especial, 12);
  assert.equal(result.dias_salario_descuento, 0);
});

test('licencia cruzando meses se proyecta por interseccion', () => {
  const projectedSeptember = projectNominaCanonicalEventsToPeriodo({
    periodo: { start: '2026-09-01', end: '2026-09-30' },
    employment: { start: '2026-08-01', end: '2026-12-31' },
    canonicalEvents: [
      {
        fuente_id: 'LIC-1',
        vinculacion_id: '10',
        tipo_novedad_id: '9',
        tipo_novedad_codigo_operativo: null,
        fecha_inicio: '2026-08-20',
        fecha_fin: '2026-12-23'
      }
    ]
  });
  assert.equal(projectedSeptember.length, 1);
});

test('recorta licencia canonica al tramo visible', () => {
  const employment = { start: '2026-08-01', end: '2026-12-31' } as const;

  assert.deepEqual(
    projectNominaDateRangeToPeriodo({
      periodo: { start: '2026-08-01', end: '2026-08-31' },
      employment,
      fecha_inicio: '2026-08-20',
      fecha_fin: '2026-11-15'
    }),
    {
      fecha_inicio: '2026-08-20',
      fecha_fin: '2026-08-31',
      dias: 12
    }
  );
});

test('same-date double novelty is blocked', () => {
  const result = resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: baseEmployment,
    events: [
      {
        origen: 'PERIODO',
        fuente_id: 'PNR-1',
        fecha_inicio: '2026-08-10',
        fecha_fin: '2026-08-10',
        dias: null,
        matrix: MATRICES.PNR
      },
      {
        origen: 'PERIODO',
        fuente_id: 'DNC-1',
        fecha_inicio: '2026-08-10',
        fecha_fin: '2026-08-10',
        dias: null,
        matrix: MATRICES.DNC
      }
    ]
  });

  assert.equal(result.conflictos.length, 1);
  assert.equal(result.conflictos[0]?.fecha, '2026-08-10');
});

test('range overlap also reports conflict', () => {
  const result = resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: baseEmployment,
    events: [
      {
        origen: 'PERIODO',
        fuente_id: 'PR1-1',
        fecha_inicio: '2026-08-11',
        fecha_fin: '2026-08-11',
        dias: null,
        matrix: MATRICES.PR1
      },
      {
        origen: 'PERIODO',
        fuente_id: 'INC-1',
        fecha_inicio: '2026-08-11',
        fecha_fin: '2026-08-13',
        dias: null,
        matrix: MATRICES.INC_GENERAL
      }
    ]
  });

  assert.equal(result.conflictos.length > 0, true);
  assert.equal(result.conflictos[0]?.fecha, '2026-08-11');
});

test('vigencia laboral parcial de ingreso filtra dias previos al ingreso', () => {
  const result = resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: { start: '2026-08-15', end: '2026-08-31' },
    events: [
      {
        origen: 'PERIODO',
        fuente_id: 'PNR-ING',
        fecha_inicio: '2026-08-10',
        fecha_fin: '2026-08-18',
        dias: null,
        matrix: MATRICES.PNR
      }
    ]
  });

  assert.equal(result.dias_salario_descuento, 4);
});

test('vigencia laboral parcial de retiro filtra dias posteriores al retiro', () => {
  const result = resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: { start: '2026-08-01', end: '2026-08-20' },
    events: [
      {
        origen: 'PERIODO',
        fuente_id: 'PNR-RET',
        fecha_inicio: '2026-08-18',
        fecha_fin: '2026-08-25',
        dias: null,
        matrix: MATRICES.PNR
      }
    ]
  });

  assert.equal(result.dias_salario_descuento, 3);
});

test('countInclusiveDays y buildDateRangeFromDays usan rango inclusivo', () => {
  assert.equal(countInclusiveDays('2026-08-10', '2026-08-12'), 3);
  assert.deepEqual(buildDateRangeFromDays('2026-08-10', 3), {
    start: '2026-08-10',
    end: '2026-08-12'
  });
});

test('genera observaciones automaticas coherentes con la licencia', () => {
  const text = generateNominaNovedadObservation({
    matrix: MATRICES.LICENCIA,
    dias: 12,
    fecha_inicio: '2026-08-20',
    fecha_fin: '2026-08-31'
  });

  assert.equal(
    text,
    'Licencia de maternidad/paternidad del 20/08/2026 al 31/08/2026.'
  );
});
