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
  L50: buildMatrix({
    codigo_operativo: 'L50',
    nombre: 'DÍAS DE NO CLASE',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA',
    observacion_plantilla: 'Se descuenta transporte y recargos por {dias} dia/dias de no clase.'
  }),
  PR1: buildMatrix({
    codigo_operativo: 'PR1',
    nombre: 'CITA MÉDICA',
    efecto_transporte: 'DESCUENTA_DIA',
    observacion_plantilla: 'Se descuenta transporte por {dias} dia/dias de cita medica.'
  }),
  PR2: buildMatrix({
    codigo_operativo: 'PR2',
    nombre: 'INCAPACIDAD MÉDICA',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_liquidacion: 'PREPARAR_LIQUIDACION',
    observacion_plantilla: 'Incapacidad medica por {dias} dia/dias. Se descuenta transporte.'
  }),
  PR3: buildMatrix({
    codigo_operativo: 'PR3',
    nombre: 'CALAMIDAD FAMILIAR',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  PR4: buildMatrix({
    codigo_operativo: 'PR4',
    nombre: 'CITACIONES OFICIALES',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  PNR: buildMatrix({
    codigo_operativo: 'PNR',
    nombre: 'PERMISO NO REMUNERADO',
    efecto_salario: 'DESCUENTA_PROPORCIONAL',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA'
  }),
  S: buildMatrix({
    codigo_operativo: 'S',
    nombre: 'SUSPENSIÓN',
    efecto_salario: 'DESCUENTA_PROPORCIONAL',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_recargos: 'EXCLUIR_DIA'
  }),
  LUTO: buildMatrix({
    nombre: 'LUTO',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  CITA_FAMILIAR: buildMatrix({
    nombre: 'CITA MÉDICA FAMILIAR',
    efecto_transporte: 'DESCUENTA_DIA'
  }),
  INCAP_ACL: buildMatrix({
    nombre: 'INCAPACIDAD POR ACCIDENTE LABORAL',
    efecto_transporte: 'DESCUENTA_DIA',
    efecto_liquidacion: 'PREPARAR_LIQUIDACION'
  }),
  LICENCIA: buildMatrix({
    nombre: 'LICENCIA MATERNIDAD/PATERNIDAD',
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

test('L50 un dia descuenta transporte y recargos sin descontar salario', () => {
  const result = resolveSingle(MATRICES.L50, '2026-08-12');
  assert.equal(result.dias_salario_descuento, 0);
  assert.equal(result.dias_transporte_descuento, 1);
  assert.equal(result.dias_recargo_excluido, 1);
});

test('L50 rango inclusivo cuenta todos los dias', () => {
  const result = resolveSingle(MATRICES.L50, '2026-08-10', '2026-08-12');
  assert.equal(result.dias_transporte_descuento, 3);
  assert.equal(result.dias_recargo_excluido, 3);
});

test('PR1 solo descuenta transporte', () => {
  const result = resolveSingle(MATRICES.PR1, '2026-08-07');
  assert.equal(result.dias_salario_descuento, 0);
  assert.equal(result.dias_transporte_descuento, 1);
  assert.equal(result.dias_recargo_excluido, 0);
});

test('PR2 prepara liquidacion y descuenta transporte sin descontar salario', () => {
  const result = resolveSingle(MATRICES.PR2, '2026-08-05', '2026-08-08');
  assert.equal(result.dias_salario_descuento, 0);
  assert.equal(result.dias_transporte_descuento, 4);
  assert.equal(result.dias_liquidacion_especial, 4);
});

test('PR3 y PR4 solo descuentan transporte', () => {
  const pr3 = resolveSingle(MATRICES.PR3, '2026-08-09');
  const pr4 = resolveSingle(MATRICES.PR4, '2026-08-11');
  assert.equal(pr3.dias_transporte_descuento, 1);
  assert.equal(pr3.dias_salario_descuento, 0);
  assert.equal(pr4.dias_transporte_descuento, 1);
  assert.equal(pr4.dias_recargo_excluido, 0);
});

test('PNR un dia descuenta salario, transporte y recargos', () => {
  const result = resolveSingle(MATRICES.PNR, '2026-08-14');
  assert.equal(result.dias_salario_descuento, 1);
  assert.equal(result.dias_transporte_descuento, 1);
  assert.equal(result.dias_recargo_excluido, 1);
});

test('PNR rango inclusivo cuenta todos los dias', () => {
  const result = resolveSingle(MATRICES.PNR, '2026-08-14', '2026-08-16');
  assert.equal(result.dias_salario_descuento, 3);
  assert.equal(result.dias_transporte_descuento, 3);
  assert.equal(result.dias_recargo_excluido, 3);
});

test('S un dia y rango descuentan salario, transporte y recargos', () => {
  const single = resolveSingle(MATRICES.S, '2026-08-02');
  const range = resolveSingle(MATRICES.S, '2026-08-02', '2026-08-04');
  assert.equal(single.dias_salario_descuento, 1);
  assert.equal(range.dias_salario_descuento, 3);
  assert.equal(range.dias_transporte_descuento, 3);
  assert.equal(range.dias_recargo_excluido, 3);
});

test('luto y cita medica familiar solo descuentan transporte', () => {
  const luto = resolveSingle(MATRICES.LUTO, '2026-08-18');
  const familiar = resolveSingle(MATRICES.CITA_FAMILIAR, '2026-08-19');
  assert.equal(luto.dias_salario_descuento, 0);
  assert.equal(luto.dias_transporte_descuento, 1);
  assert.equal(familiar.dias_transporte_descuento, 1);
});

test('incapacidad por accidente laboral prepara liquidacion y descuenta transporte', () => {
  const result = resolveSingle(MATRICES.INCAP_ACL, '2026-08-20', '2026-08-22');
  assert.equal(result.dias_salario_descuento, 0);
  assert.equal(result.dias_transporte_descuento, 3);
  assert.equal(result.dias_liquidacion_especial, 3);
});

test('licencia dentro de un mes excluye recargos y prepara liquidacion', () => {
  const result = resolveSingle(MATRICES.LICENCIA, '2026-08-20', '2026-08-31');
  assert.equal(result.dias_recargo_excluido, 12);
  assert.equal(result.dias_liquidacion_especial, 12);
  assert.equal(result.dias_salario_descuento, 0);
});

test('licencia cruzando dos y varios meses proyecta automaticamente por interseccion', () => {
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
  const projectedDecember = projectNominaCanonicalEventsToPeriodo({
    periodo: { start: '2026-12-01', end: '2026-12-31' },
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
  assert.equal(projectedDecember.length, 1);
});

test('recorta licencia canonica al tramo visible de agosto, septiembre, octubre y noviembre', () => {
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
  assert.deepEqual(
    projectNominaDateRangeToPeriodo({
      periodo: { start: '2026-09-01', end: '2026-09-30' },
      employment,
      fecha_inicio: '2026-08-20',
      fecha_fin: '2026-11-15'
    }),
    {
      fecha_inicio: '2026-09-01',
      fecha_fin: '2026-09-30',
      dias: 30
    }
  );
  assert.deepEqual(
    projectNominaDateRangeToPeriodo({
      periodo: { start: '2026-10-01', end: '2026-10-31' },
      employment,
      fecha_inicio: '2026-08-20',
      fecha_fin: '2026-11-15'
    }),
    {
      fecha_inicio: '2026-10-01',
      fecha_fin: '2026-10-31',
      dias: 31
    }
  );
  assert.deepEqual(
    projectNominaDateRangeToPeriodo({
      periodo: { start: '2026-11-01', end: '2026-11-30' },
      employment,
      fecha_inicio: '2026-08-20',
      fecha_fin: '2026-11-15'
    }),
    {
      fecha_inicio: '2026-11-01',
      fecha_fin: '2026-11-15',
      dias: 15
    }
  );
});

test('solapamiento licencia con PNR y PR1 genera conflicto', () => {
  const result = resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: baseEmployment,
    events: [
      {
        origen: 'CANONICO',
        fuente_id: 'LIC-1',
        fecha_inicio: '2026-08-10',
        fecha_fin: '2026-08-31',
        dias: null,
        matrix: MATRICES.LICENCIA
      },
      {
        origen: 'PERIODO',
        fuente_id: 'PNR-1',
        fecha_inicio: '2026-08-15',
        fecha_fin: '2026-08-16',
        dias: null,
        matrix: MATRICES.PNR
      },
      {
        origen: 'PERIODO',
        fuente_id: 'PR1-1',
        fecha_inicio: '2026-08-20',
        fecha_fin: '2026-08-20',
        dias: null,
        matrix: MATRICES.PR1
      }
    ]
  });

  assert.equal(result.conflictos.length > 0, true);
});

test('protege contra doble descuento de transporte en una misma fecha', () => {
  const result = resolveNominaEfectosPorDia({
    periodo: agosto,
    employment: baseEmployment,
    events: [
      {
        origen: 'PERIODO',
        fuente_id: 'PR1-1',
        fecha_inicio: '2026-08-12',
        fecha_fin: '2026-08-12',
        dias: null,
        matrix: MATRICES.PR1
      },
      {
        origen: 'PERIODO',
        fuente_id: 'PR3-1',
        fecha_inicio: '2026-08-12',
        fecha_fin: '2026-08-12',
        dias: null,
        matrix: MATRICES.PR3
      }
    ]
  });

  assert.equal(result.dias_transporte_descuento, 1);
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
