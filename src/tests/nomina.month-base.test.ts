import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, QueryResultRow } from 'pg';
import { calculateNominaMonthBase, calculateNominaPaidDays } from '../modules/nomina/nomina.calculator';
import { calculateCoberturaPayroll } from '../modules/nomina/nomina.cobertura';
import { getNominaPeriodRange } from '../modules/nomina/nomina-periodos';
import { resolverTramosOperativos } from '../modules/nomina/nomina.tramos';
import { buildNominaEffectMatrixFromConfig, resolveNominaEfectosPorDia } from '../modules/nomina/nomina.effects';
import { NominaCalculoRepository, type NominaCalculoRepositoryExecutor } from '../modules/nomina/infrastructure/repositories/nomina-calculo.repository';

const cut = getNominaPeriodRange(2026, 9);
const periodo = { start: cut.fecha_inicio, end: cut.fecha_fin };
const categoria = {
  categoria_id: '1', codigo_categoria: 'QA', nombre_categoria: 'QA',
  salario_base: 3_000_000, auxilio_transporte: 300_000, recargo_mensual: 150_000
};
const cases: Array<[string, string | null, string | null, number]> = [
  ['activo todo el mes', '2026-07-01', null, 30],
  ['ingreso 01/09', '2026-09-01', null, 30],
  ['ingreso 07/09', '2026-09-07', null, 24],
  ['ingreso 15/09', '2026-09-15', null, 16],
  ['ingreso 25/09', '2026-09-25', null, 6],
  ['ingreso 30/09', '2026-09-30', null, 1],
  ['retiro 03/09', '2026-07-01', '2026-09-03', 3],
  ['retiro 20/09', '2026-07-01', '2026-09-20', 20],
  ['retiro 30/09', '2026-07-01', '2026-09-30', 30],
  ['ingreso 07/09 y retiro 20/09', '2026-09-07', '2026-09-20', 14]
];

test('mes de 31: dias 30/31 comparten dia salarial, con fechas reales y divisor 30', () => {
  const cases31: Array<[string | null, string | null, number]> = [
    ['2026-07-01', null, 30], ['2026-08-01', null, 30],
    ['2026-08-02', null, 29], ['2026-08-31', null, 1],
    ['2026-07-01', '2026-08-31', 30], ['2026-08-01', '2026-08-31', 30],
    ['2026-08-07', '2026-08-20', 14], ['2026-08-07', '2026-08-31', 24],
    ['2026-08-30', '2026-08-31', 1], ['2026-08-31', '2026-08-31', 1],
    ['2026-08-31', '2026-08-30', 0]
  ];
  for (const [start, end, expected] of cases31) {
    const base = calculateNominaMonthBase(2026, 8, start, end);
    assert.equal(base.days, expected, `${start}/${end}`);
    assert.equal(calculateNominaPaidDays({eligibleDays:base.days}).salaryPaidDays, expected);
    const result = calculateCoberturaPayroll({
      mes_liquidado_base: base, empleo: {fecha_inicio:base.start,fecha_fin:base.end},
      tramos: [{fecha_inicio:'2026-07-26',fecha_fin:'2026-08-25',categoria}],
      dias_efectos:[], aporta_pension:true
    });
    assert.equal(result.dias_vinculacion, expected);
    assert.equal(result.dias_salario, expected);
    assert.equal(result.salario_ordinario, expected * 100_000);
  }
  assert.equal(calculateNominaMonthBase(2026,8,'2026-08-31').start,'2026-08-31');
  assert.equal(calculateNominaMonthBase(2026,8).end,'2026-08-31');
});

test('todos los intervalos de todos los meses de 31 dias mantienen base entre 0 y 30', () => {
  for (const month of [1,3,5,7,8,10,12]) {
    const date = (day:number) => `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    for (let start=1;start<=31;start++) {
      for (let end=1;end<=31;end++) {
        const base = calculateNominaMonthBase(2026,month,date(start),date(end));
        assert.ok(base.days>=0 && base.days<=30, `${base.start}/${base.end}`);
        assert.equal(base.days, start>end ? 0 : Math.min(end,30)-Math.min(start,30)+1);
      }
    }
  }
});

test('COBERTURA distribuye la base de 31 dias con la misma convencion entre categorias', () => {
  const result = calculateCoberturaPayroll({
    mes_liquidado_base:calculateNominaMonthBase(2026,8,'2026-08-07'),
    empleo:{fecha_inicio:'2026-08-07',fecha_fin:'2026-08-31'},
    tramos:[
      {fecha_inicio:'2026-08-07',fecha_fin:'2026-08-15',categoria},
      {fecha_inicio:'2026-08-16',fecha_fin:'2026-08-31',categoria:{...categoria,salario_base:6_000_000}}
    ], dias_efectos:[], aporta_pension:true
  });
  assert.deepEqual(result.auditoria.tramos.map(tramo=>tramo.dias_vinculacion),[9,15]);
  assert.equal(result.dias_salario,24);
  assert.equal(result.salario_ordinario,3_900_000);
});

for (const [label, ingreso, retiro, expected] of cases) {
  test(`septiembre 2026: ${label} => ${expected}, ruta general y COBERTURA`, () => {
    const base = calculateNominaMonthBase(2026, 9, ingreso, retiro);
    assert.equal(base.days, expected);
    assert.equal(calculateNominaPaidDays({ eligibleDays: base.days }).salaryPaidDays, expected);
    const operativeTramos = resolverTramosOperativos({
      periodo_inicio: periodo.start, periodo_fin: periodo.end,
      vinculacion_inicio: ingreso ?? periodo.start, vinculacion_fin: retiro,
      contexto_base: {}, cambios: []
    });
    const result = calculateCoberturaPayroll({
      mes_liquidado_base: base,
      empleo: { fecha_inicio: ingreso ?? base.start, fecha_fin: retiro ?? base.end },
      tramos: operativeTramos.length ? operativeTramos.map(tramo => ({ ...tramo, categoria }))
        : [{ fecha_inicio: base.start, fecha_fin: base.end, categoria }],
      dias_efectos: [], aporta_pension: true
    });
    assert.equal(result.dias_vinculacion, expected);
    assert.equal(result.dias_salario, expected);
    assert.equal(result.dias_transporte, expected);
    assert.equal(result.salario_ordinario, expected * 100_000);
    assert.equal(result.transporte_ordinario, expected * 10_000);
    assert.equal(result.recargos_ordinarios, expected * 5_000);
    assert.equal(result.salud_ordinaria, expected * 4_000);
    assert.equal(result.pension_ordinaria, expected * 4_000);
  });
}

test('el corte permanece 26/08-25/09 y las novedades se descuentan después de la base', () => {
  assert.deepEqual(periodo, { start: '2026-08-26', end: '2026-09-25' });
  const base = calculateNominaMonthBase(2026, 9, '2026-09-07');
  const employment = { start: '2026-09-07', end: '2026-09-25' };
  const matrix = (codigo: string, salario: boolean) => buildNominaEffectMatrixFromConfig({
    codigo_operativo: codigo, nombre: codigo,
    efecto_salario: salario ? 'DESCUENTA_PROPORCIONAL' : 'SIN_EFECTO',
    efecto_auxilio_transporte: 'DESCUENTA_DIA', efecto_recargos_detallado: 'EXCLUIR_DIA',
    efecto_liquidacion: 'SIN_EFECTO', efecto_cobertura_config: 'SIN_EFECTO', efecto_operativo: 'SIN_EFECTO',
    modelo_registro: 'POR_PERIODO', proyecta_periodos: false, bloquea_otras_novedades: false,
    grupo_exclusividad: 'NINGUNA', observacion_plantilla: null
  });
  const events = [
    ['PNR', '2026-09-10', true], ['S', '2026-09-11', true], ['PR1', '2026-09-12', false],
    ['PNR', '2026-09-28', true]
  ] as const;
  const effects = resolveNominaEfectosPorDia({
    periodo, employment,
    events: events.map(([code, date, salary]) => ({
      origen: 'PERIODO', fuente_id: code + date, fecha_inicio: date, fecha_fin: date,
      dias: 1, matrix: matrix(code, salary)
    }))
  });
  assert.equal(effects.dias_salario_descuento, 2);
  assert.equal(effects.dias_transporte_descuento, 3);
  assert.ok(effects.days.every(day => day.fecha <= '2026-09-25'));
  const paid = calculateNominaPaidDays({
    eligibleDays: base.days, salaryDiscountDays: effects.dias_salario_descuento,
    transportDiscountDays: effects.dias_transporte_descuento,
    surchargeDiscountDays: effects.dias_recargo_excluido
  });
  const result = calculateCoberturaPayroll({
    mes_liquidado_base: base,
    empleo: { fecha_inicio: employment.start, fecha_fin: employment.end },
    tramos: [{ fecha_inicio: employment.start, fecha_fin: employment.end, categoria }],
    dias_efectos: effects.days, aporta_pension: true
  });
  assert.equal(result.dias_salario, paid.salaryPaidDays);
  assert.equal(result.dias_salario, 22);
  assert.equal(result.dias_transporte, paid.transportPaidDays);
  assert.equal(result.dias_transporte, 21);
  assert.equal(result.dias_recargo, paid.surchargePaidDays);
  assert.equal(result.salario_ordinario, 2_200_000);
  assert.equal(result.transporte_ordinario, 210_000);
});

test('la base no depende de asistencias ni crea escrituras para el 26-30', () => {
  const source = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
  const start = source.indexOf('export const recalculateNominaPeriodo = async');
  const body = source.slice(start, source.indexOf('\nexport const ', start + 1));
  assert.match(body, /settledMonth = new Date\(`\$\{periodoRange\.end\}T00:00:00\.000Z`\)/);
  assert.match(body, /calculateNominaMonthBase\([\s\S]*?settledMonth\.getUTCFullYear\(\),[\s\S]*?settledMonth\.getUTCMonth\(\) \+ 1/);
  const baseCall = body.slice(body.indexOf('const mesLiquidadoBase ='), body.indexOf('const diasVigenciaNomina ='));
  assert.doesNotMatch(baseCall, /fecha_inicio_pago|fecha_fin_pago|employmentRange/);
  assert.match(baseCall, /fecha_inicio_vinculacion/);
  assert.match(baseCall, /fecha_fin_vinculacion/);
  assert.match(body, /const diasPagadosBase = diasVigenciaNomina/);
  assert.match(body, /FROM nomina_asistencia_diaria\s+WHERE periodo_id = \$1::bigint/);
  assert.doesNotMatch(body, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+nomina_asistencia_diaria/i);
  assert.match(body, /employment: employmentRange,\s+events: effectEvents,\s+periodo: periodoRange/);
  assert.equal(calculateNominaMonthBase(2026, 9).days, 30);
});

test('persistir 24 días conserva exactamente las asistencias y no materializa el 26-30', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE nomina_empleados (
        id bigint PRIMARY KEY, dias_pagados numeric, horas_trabajadas numeric,
        devengado_basico numeric, devengado_transporte numeric, devengado_otros numeric,
        salud numeric, pension numeric, total_adiciones numeric, total_deducciones numeric,
        neto_pagar numeric, detalle_calculo jsonb, updated_at timestamptz
      );
      INSERT INTO nomina_empleados (id) VALUES (7);
      CREATE TABLE nomina_asistencia_diaria (vinculacion_id bigint, fecha date, estado_dia text);
      INSERT INTO nomina_asistencia_diaria VALUES (7, '2026-09-07', 'PRESENTE'), (7, '2026-09-25', 'PRESENTE');
    `);
    const executor: NominaCalculoRepositoryExecutor = {
      query: <T extends QueryResultRow = QueryResultRow>(sql: string, values?: readonly unknown[]) =>
        db.query<T>(sql, values as unknown[] | undefined) as unknown as Promise<QueryResult<T>>
    };
    const before = await db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY fecha');
    const result = calculateCoberturaPayroll({
      mes_liquidado_base: calculateNominaMonthBase(2026, 9, '2026-09-07'),
      empleo: { fecha_inicio: '2026-09-07', fecha_fin: periodo.end },
      tramos: [{ fecha_inicio: '2026-09-07', fecha_fin: periodo.end, categoria }],
      dias_efectos: [], aporta_pension: true
    });
    const repository = new NominaCalculoRepository();
    await repository.persistResult({
      empleadoId: '7', diasPagados: result.dias_salario, horasTrabajadas: 16,
      devengadoBasico: result.salario_ordinario, devengadoTransporte: result.transporte_ordinario,
      devengadoOtros: result.recargos_ordinarios, salud: result.salud_ordinaria, pension: result.pension_ordinaria,
      totalAdiciones: result.total_devengado, totalDeducciones: result.total_deducciones,
      netoPagar: result.neto_nomina, detalleCalculo: { dias_base_liquidacion: result.dias_vinculacion }
    }, executor);
    assert.equal(Number((await repository.getCurrentResult('7', executor))?.dias_pagados), 24);
    assert.deepEqual((await db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY fecha')).rows, before.rows);
    assert.equal((await db.query("SELECT * FROM nomina_asistencia_diaria WHERE fecha BETWEEN '2026-09-26' AND '2026-09-30'")).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('sin ingreso/retiro intrames, COBERTURA conserva importes y turnos existentes', () => {
  const input = {
    empleo: { fecha_inicio: periodo.start, fecha_fin: periodo.end },
    tramos: [{ fecha_inicio: periodo.start, fecha_fin: periodo.end, categoria }],
    dias_efectos: [], aporta_pension: true,
    adiciones_internas: [{
      fecha_inicio: '2026-09-10', fecha_fin: '2026-09-11', categoria,
      aporta_pension: true, valor_unitario: 50_000
    }]
  };
  const previous = calculateCoberturaPayroll(input);
  const current = calculateCoberturaPayroll({ ...input, mes_liquidado_base: calculateNominaMonthBase(2026, 9, '2026-07-01') });
  assert.deepEqual(current, previous);
  assert.equal(current.adiciones_internas[0]?.devengado_turno, 100_000);
  assert.equal(current.adiciones_internas[0]?.salud_turno, 0);
  assert.equal(current.adiciones_internas[0]?.pension_turno, 0);
});

test('múltiples categorías conservan el corte para efectos y distribuyen solo la base salarial', () => {
  const result = calculateCoberturaPayroll({
    mes_liquidado_base: calculateNominaMonthBase(2026, 9, '2026-09-07'),
    empleo: { fecha_inicio: '2026-09-07', fecha_fin: periodo.end },
    tramos: [
      { fecha_inicio: '2026-09-07', fecha_fin: '2026-09-14', categoria },
      { fecha_inicio: '2026-09-15', fecha_fin: periodo.end, categoria: { ...categoria, salario_base: 6_000_000 } }
    ], dias_efectos: [], aporta_pension: true
  });
  assert.deepEqual(result.auditoria.tramos.map(tramo => tramo.dias_vinculacion), [8, 16]);
  assert.equal(result.salario_ordinario, 800_000 + 3_200_000);
  assert.equal(result.auditoria.tramos[1]?.fecha_fin, '2026-09-25');
});

test('fuera del mes, sin fechas y meses cortos/largos respetan las reglas explícitas', () => {
  assert.equal(calculateNominaMonthBase(2026, 9, '2026-10-01').days, 0);
  assert.equal(calculateNominaMonthBase(2026, 9, '2026-07-01', '2026-08-31').days, 0);
  assert.equal(calculateNominaMonthBase(2026, 9, '2026-09-20', '2026-09-07').days, 0);
  assert.equal(calculateNominaMonthBase(2026, 9).days, 30);
  assert.equal(calculateNominaMonthBase(2026, 2, '2026-01-01').days, 30);
  assert.equal(calculateNominaMonthBase(2026, 2, '2026-02-07').days, 22);
  assert.equal(calculateNominaMonthBase(2028, 2, '2028-02-07').days, 23);
  assert.equal(calculateNominaMonthBase(2026, 8, '2026-08-07').days, 24);
  assert.equal(calculateNominaMonthBase(2026, 8, '2026-08-01').days, 30);
  assert.throws(() => calculateNominaMonthBase(2026, 13));
  assert.throws(() => calculateNominaMonthBase(2026, 9, '2026-02-30'));
});

test('UTC evita diferencias por timezone y cambios de horario', () => {
  const previous = process.env.TZ;
  try {
    for (const tz of ['America/Bogota', 'America/New_York', 'Pacific/Auckland', 'UTC']) {
      process.env.TZ = tz;
      for (const [, ingreso, retiro, expected] of cases) {
        assert.equal(calculateNominaMonthBase(2026, 9, ingreso, retiro).days, expected, tz);
      }
      assert.equal(calculateNominaMonthBase(2026, 3, '2026-03-07').days, 24, tz);
      assert.equal(calculateNominaMonthBase(2026, 11, '2026-11-01', '2026-11-03').days, 3, tz);
    }
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
