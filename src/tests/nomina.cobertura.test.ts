import test from 'node:test';
import assert from 'node:assert/strict';

import type { NominaDayEffectSummary } from '../modules/nomina/nomina.effects';
import {
  calculateCoberturaPayroll,
  countCommercialInclusiveDays,
  roundUpToHundreds,
  type CoberturaCategoriaSnapshot,
} from '../modules/nomina/nomina.cobertura';

const ri: CoberturaCategoriaSnapshot = {
  categoria_id: '1',
  codigo_categoria: 'RI',
  nombre_categoria: 'RI',
  salario_base: 1_042_205,
  recargo_mensual: 0,
  auxilio_transporte: 249_095,
};

const caa1: CoberturaCategoriaSnapshot = {
  categoria_id: '2',
  codigo_categoria: 'CAA1',
  nombre_categoria: 'CAA1',
  salario_base: 1_750_905,
  recargo_mensual: 73_336,
  auxilio_transporte: 249_095,
};

const baseEffects = (items: Array<Partial<NominaDayEffectSummary> & Pick<NominaDayEffectSummary, 'fecha'>>): NominaDayEffectSummary[] =>
  items.map((item) => ({
    fecha: item.fecha,
    fuentes: item.fuentes ?? [item.fecha],
    codigos: item.codigos ?? [],
    salario_descuento: item.salario_descuento ?? false,
    transporte_descuento: item.transporte_descuento ?? false,
    recargo_excluido: item.recargo_excluido ?? false,
    liquidacion_especial: item.liquidacion_especial ?? false,
    novedad_licencia: item.novedad_licencia ?? false,
  }));

const singleTramo = (categoria: CoberturaCategoriaSnapshot, fechaInicio: string, fechaFin: string) => [{
  fecha_inicio: fechaInicio,
  fecha_fin: fechaFin,
  categoria,
}];

test('countCommercialInclusiveDays uses 30-day commercial base', () => {
  assert.equal(countCommercialInclusiveDays('2026-08-01', '2026-08-31'), 30);
  assert.equal(countCommercialInclusiveDays('2026-02-20', '2026-02-28'), 11);
  assert.equal(countCommercialInclusiveDays('2026-08-11', '2026-08-31'), 20);
});

test('roundUpToHundreds matches COBERTURA health/pension rule', () => {
  assert.equal(roundUpToHundreds(7003.6), 7100);
  assert.equal(roundUpToHundreds(6900), 6900);
  assert.equal(roundUpToHundreds(0), 0);
});

test('CAA1 control case matches expected math', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
    tramos: singleTramo(caa1, '2026-08-01', '2026-08-03'),
    dias_efectos: [],
    aporta_pension: true,
  });

  assert.equal(result.salario_ordinario, 175090);
  assert.equal(result.recargos_ordinarios, 7333);
  assert.equal(result.transporte_ordinario, 24909);
  assert.equal(result.total_devengado, 207332);
  assert.equal(result.salud_ordinaria, 7100);
  assert.equal(result.pension_ordinaria, 7100);
  assert.equal(result.neto_nomina, 193132);
});

test('accepts configured social security percentages expressed as whole percentages', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
    tramos: singleTramo(caa1, '2026-08-01', '2026-08-03'),
    dias_efectos: [],
    aporta_pension: true,
    porcentaje_salud: 4,
    porcentaje_pension: 4,
  });

  assert.equal(result.salud_ordinaria, 7100);
  assert.equal(result.pension_ordinaria, 7100);
});

test('RI control case matches expected math', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
    tramos: singleTramo(ri, '2026-08-01', '2026-08-03'),
    dias_efectos: [],
    aporta_pension: true,
  });

  assert.equal(result.salario_ordinario, 104220);
  assert.equal(result.recargos_ordinarios, 0);
  assert.equal(result.transporte_ordinario, 24909);
  assert.equal(result.total_devengado, 129129);
  assert.equal(result.salud_ordinaria, 4200);
  assert.equal(result.pension_ordinaria, 4200);
  assert.equal(result.neto_nomina, 120729);
});

test('RI control case without pension matches expected math', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
    tramos: singleTramo(ri, '2026-08-01', '2026-08-03'),
    dias_efectos: [],
    aporta_pension: false,
  });

  assert.equal(result.salud_ordinaria, 4200);
  assert.equal(result.pension_ordinaria, 0);
  assert.equal(result.neto_nomina, 124929);
});

test('entry on day 20 limits COBERTURA employment days to 11', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-20', fecha_fin: '2026-08-31' },
    tramos: singleTramo(ri, '2026-08-20', '2026-08-31'),
    dias_efectos: [],
    aporta_pension: true,
  });

  assert.equal(result.dias_vinculacion, 11);
  assert.equal(result.dias_salario, 11);
  assert.equal(result.auditoria.tramos[0]?.salario_causado, 382141);
});

test('retirement on day 20 limits COBERTURA employment days to 20', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-20' },
    tramos: singleTramo(ri, '2026-08-01', '2026-08-20'),
    dias_efectos: [],
    aporta_pension: true,
  });

  assert.equal(result.dias_vinculacion, 20);
  assert.equal(result.dias_salario, 20);
});

test('PNR, FNJ and S discount salary, recargo and transport but keep ss days', () => {
  for (const code of ['PNR', 'FNJ', 'S']) {
    const result = calculateCoberturaPayroll({
      empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
      tramos: singleTramo(caa1, '2026-08-01', '2026-08-03'),
      dias_efectos: baseEffects([{ fecha: '2026-08-02', codigos: [code], salario_descuento: true, recargo_excluido: true, transporte_descuento: true }]),
      aporta_pension: true,
    });

    assert.equal(result.dias_salario, 2);
    assert.equal(result.dias_recargo, 2);
    assert.equal(result.dias_transporte, 2);
    assert.equal(result.dias_cotizacion_ss, 3);
  }
});

test('DNC keeps salary and discounts recargo and transport', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
    tramos: singleTramo(caa1, '2026-08-01', '2026-08-03'),
    dias_efectos: baseEffects([{ fecha: '2026-08-02', codigos: ['DNC'], recargo_excluido: true, transporte_descuento: true }]),
    aporta_pension: true,
  });

  assert.equal(result.dias_salario, 3);
  assert.equal(result.dias_recargo, 2);
  assert.equal(result.dias_transporte, 2);
});

test('PR1, PR2, PR3, PR4, INC_GENERAL and INC_ARL keep salary and recargo but discount transport', () => {
  for (const code of ['PR1', 'PR2', 'PR3', 'PR4', 'INC_GENERAL', 'INC_ARL']) {
    const result = calculateCoberturaPayroll({
      empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
      tramos: singleTramo(caa1, '2026-08-01', '2026-08-03'),
      dias_efectos: baseEffects([{ fecha: '2026-08-02', codigos: [code], transporte_descuento: true }]),
      aporta_pension: true,
    });

    assert.equal(result.dias_salario, 3, code);
    assert.equal(result.dias_recargo, 3, code);
    assert.equal(result.dias_transporte, 2, code);
    assert.equal(result.dias_cotizacion_ss, 3, code);
  }
});

test('category change creates two tramos without duplicating payroll result', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    tramos: [
      { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-10', categoria: ri },
      { fecha_inicio: '2026-08-11', fecha_fin: '2026-08-31', categoria: caa1 },
    ],
    dias_efectos: [],
    aporta_pension: true,
  });

  assert.equal(result.auditoria.tramos.length, 2);
  assert.equal(result.dias_vinculacion, 30);
  assert.equal(result.auditoria.tramos[0]?.dias_vinculacion, 10);
  assert.equal(result.auditoria.tramos[1]?.dias_vinculacion, 20);
  assert.equal(result.auditoria.tramos[0]?.salario_causado, 347401);
  assert.equal(result.auditoria.tramos[1]?.salario_causado, 1167270);
});

test('novelty before and after category change uses the correct tramo category', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    tramos: [
      { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-10', categoria: ri },
      { fecha_inicio: '2026-08-11', fecha_fin: '2026-08-31', categoria: caa1 },
    ],
    dias_efectos: baseEffects([
      { fecha: '2026-08-05', codigos: ['PNR'], salario_descuento: true, recargo_excluido: true, transporte_descuento: true },
      { fecha: '2026-08-15', codigos: ['PNR'], salario_descuento: true, recargo_excluido: true, transporte_descuento: true },
    ]),
    aporta_pension: true,
  });

  assert.equal(result.auditoria.tramos[0]?.dias_salario, 9);
  assert.equal(result.auditoria.tramos[1]?.dias_salario, 19);
  assert.deepEqual(result.auditoria.tramos[0]?.codigos_novedad, ['PNR']);
  assert.deepEqual(result.auditoria.tramos[1]?.codigos_novedad, ['PNR']);
});

test('internal addition uses covered category and subtracts health and pension', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    tramos: singleTramo(ri, '2026-08-01', '2026-08-31'),
    dias_efectos: [],
    aporta_pension: true,
    adiciones_internas: [{
      id: 'AD-1',
      fecha_inicio: '2026-08-15',
      fecha_fin: '2026-08-17',
      categoria: caa1,
      aporta_pension: true,
    }],
  });

  assert.equal(result.adiciones_internas.length, 1);
  assert.equal(result.adiciones_internas[0]?.salario_turno, 175090);
  assert.equal(result.adiciones_internas[0]?.recargo_turno, 7333);
  assert.equal(result.adiciones_internas[0]?.transporte_turno, 24909);
  assert.equal(result.adiciones_internas[0]?.salud_turno, 7100);
  assert.equal(result.adiciones_internas[0]?.pension_turno, 7100);
  assert.equal(result.adiciones_internas[0]?.neto_turno, 193132);
});

test('internal addition without pension only subtracts health', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    tramos: singleTramo(ri, '2026-08-01', '2026-08-31'),
    dias_efectos: [],
    aporta_pension: false,
    adiciones_internas: [{
      id: 'AD-1',
      fecha_inicio: '2026-08-15',
      fecha_fin: '2026-08-17',
      categoria: caa1,
      aporta_pension: false,
    }],
  });

  assert.equal(result.adiciones_internas[0]?.salud_turno, 7100);
  assert.equal(result.adiciones_internas[0]?.pension_turno, 0);
  assert.equal(result.adiciones_internas[0]?.neto_turno, 200232);
});

test('authorized discount reduces total deductions only', () => {
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-03' },
    tramos: singleTramo(caa1, '2026-08-01', '2026-08-03'),
    dias_efectos: [],
    aporta_pension: true,
    descuentos_autorizados: 12345,
  });

  assert.equal(result.salario_ordinario, 175090);
  assert.equal(result.total_deducciones, 26545);
  assert.equal(result.neto_nomina, 180787);
});
