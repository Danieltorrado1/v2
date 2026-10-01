import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { calculateNominaMonthBase, calculateNominaPaidDays } from '../modules/nomina/nomina.calculator';
import { calculateCoberturaPayroll } from '../modules/nomina/nomina.cobertura';
import { buildNominaEffectMatrixFromConfig, resolveNominaEfectosPorDia } from '../modules/nomina/nomina.effects';

const source = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const start = source.indexOf('export const recalculateNominaPeriodo = async');
const body = source.slice(start, source.indexOf('\nexport const ', start + 1));
// Execute the actual economic queries, including their grouping and date predicates.
const queryFor = (name: string) => {
  const section = body.slice(body.indexOf(`const ${name} =`));
  return section.slice(section.indexOf('`') + 1, section.indexOf('`,')).trim();
};
const periodo = { start: '2026-08-26', end: '2026-09-25' };
const base = calculateNominaMonthBase(2026, 9, '2026-07-01');
const categoria = {
  categoria_id: '1', codigo_categoria: 'QA', nombre_categoria: 'QA',
  salario_base: 3_000_000, auxilio_transporte: 300_000, recargo_mensual: 150_000
};

test('Adriana: las dos consultas economicas proyectan 5 turnos al empleado actual y pagan 173700', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE nomina_periodos(id bigint, fecha_inicio date, fecha_fin date);
      CREATE TABLE nomina_empleados(id bigint, periodo_id bigint, vinculacion_id bigint, categoria_salarial_id bigint);
      CREATE TABLE vinculaciones(id bigint, persona_id bigint);
      CREATE TABLE personas(id bigint, primer_nombre text, segundo_nombre text, primer_apellido text, segundo_apellido text, numero_documento text);
      CREATE TABLE nomina_categorias_salariales(id bigint, codigo_categoria text, nombre_categoria text,
        salario_base numeric, auxilio_transporte numeric, otros_recargos numeric, vigente_desde date, vigente_hasta date);
      CREATE TABLE nomina_tipos_novedad(id bigint, codigo_operativo text, nombre text, descripcion_operativa text);
      CREATE TABLE nomina_novedades(id bigint, nomina_empleado_id bigint, tipo_novedad_id bigint, fecha_inicio date, fecha_fin date, activo boolean);
      CREATE TABLE nomina_novedad_turnos(id bigint, tipo_turno text, movimiento_id bigint,
        nomina_empleado_id bigint, vinculacion_id bigint, nomina_novedad_id bigint, periodo_id bigint,
        contexto_operativo jsonb, observacion text, activo boolean);
      CREATE TABLE nomina_movimientos(id bigint, periodo_id bigint, nomina_empleado_id bigint, vinculacion_id bigint,
        fecha date, tipo_movimiento text, valor_total numeric, valor_unitario numeric, activo boolean,
        estado text, es_devengado boolean, es_deduccion boolean, afecta_seguridad_social boolean);
      INSERT INTO nomina_periodos VALUES (3,'2026-08-26','2026-09-25');
      INSERT INTO nomina_empleados VALUES (80,2,860,1),(849,3,860,1);
    `);
    const dates = ['2026-08-26','2026-08-31','2026-09-09','2026-09-10','2026-09-11'];
    const allDates = [...dates, '2026-08-25', '2026-09-26', '2026-08-27', '2026-08-28'];
    for (const [index, date] of allDates.entries()) {
      const id = index + 1;
      const employee = date < '2026-09-01' ? 80 : 849;
      const active = id !== 8;
      const state = id === 9 ? 'RECHAZADO' : 'APROBADO';
      await db.query(`INSERT INTO nomina_movimientos VALUES ($1,3,$2,860,$3,'TURNO_INTERNO',34740,34740,$4,$5,TRUE,FALSE,FALSE)`, [id, employee, date, active, state]);
      await db.query(`INSERT INTO nomina_novedades VALUES ($1,$2,1,$3,$3,TRUE)`, [id, employee, date]);
      await db.query(`INSERT INTO nomina_novedad_turnos VALUES ($1,'INTERNO',$1,$2,860,$1,3,'{}',NULL,TRUE)`, [id, employee]);
    }
    const before = (await db.query('SELECT * FROM nomina_movimientos ORDER BY id')).rows;
    const staleGrouping = (await db.query<{total: string}>(`
      SELECT SUM(valor_total) AS total FROM nomina_movimientos
      WHERE periodo_id = 3 AND nomina_empleado_id = 849 AND activo AND estado = 'APROBADO'
        AND fecha BETWEEN '2026-08-26' AND '2026-09-25'
    `)).rows[0]!;
    assert.equal(Number(staleGrouping.total), 104_220);
    const params = ['3', periodo.start, periodo.end];
    const movements = (await db.query<Record<string, unknown>>(queryFor('movimientosResult'), params)).rows;
    assert.equal(movements.length, 1);
    assert.equal(movements[0]!.nomina_empleado_id, '849');
    assert.equal(Number(movements[0]!.movimientos_turnos_internos_devengados), 173_700);
    const turns = (await db.query<Record<string, unknown>>(queryFor('turnosInternosCoberturaResult'), params)).rows;
    assert.equal(turns.length, 5);
    assert.ok(turns.every(turn => turn.nomina_empleado_id === '849'));
    assert.deepEqual(turns.map(turn => turn.fecha_inicio).sort(), dates);
    const result = calculateCoberturaPayroll({
      mes_liquidado_base: base, empleo: {fecha_inicio:'2026-07-01',fecha_fin:periodo.end},
      tramos: [{fecha_inicio:periodo.start,fecha_fin:periodo.end,categoria}],
      dias_efectos: [], aporta_pension: true,
      adiciones_internas: turns.map(turn => ({
        id: String(turn.id), fecha_inicio: String(turn.fecha_inicio), fecha_fin: String(turn.fecha_fin),
        valor_unitario: Number(turn.movimiento_valor_unitario), categoria, aporta_pension: true
      }))
    });
    assert.equal(result.adiciones_internas.reduce((sum, turn) => sum + turn.dias_turno, 0), 5);
    assert.equal(result.adiciones_internas.reduce((sum, turn) => sum + turn.devengado_turno, 0), 173_700);
    assert.equal(result.dias_vinculacion, 30);
    assert.deepEqual((await db.query('SELECT * FROM nomina_movimientos ORDER BY id')).rows, before);
    // Independent economic movements retain the cut, including August dates.
    for (const date of ['2026-08-25','2026-08-26','2026-09-25','2026-09-26']) {
      await db.query(`INSERT INTO nomina_movimientos VALUES (100,3,849,860,$1,'DESCUENTO',100,100,TRUE,'APROBADO',FALSE,TRUE,FALSE),
        (101,3,849,860,$1,'RECARGO',200,200,TRUE,'APROBADO',TRUE,FALSE,TRUE),
        (102,3,849,860,$1,'TURNO_EXTERNO',9000,9000,TRUE,'APROBADO',TRUE,FALSE,FALSE)`, [date]);
    }
    const economic = (await db.query<Record<string, unknown>>(queryFor('movimientosResult'), params)).rows[0]!;
    assert.equal(Number(economic.movimientos_deducciones), 200);
    assert.equal(Number(economic.movimientos_devengados), 400);
    assert.equal(Number(economic.movimientos_ss_devengados), 400);
    assert.equal(Number(economic.movimientos_turnos_internos_devengados), 173_700);
    // A turn crossing the initial boundary contributes only its two cut days.
    await db.exec(`
      INSERT INTO nomina_movimientos VALUES (103,3,80,860,'2026-08-26','TURNO_INTERNO',104220,34740,TRUE,'APROBADO',TRUE,FALSE,FALSE);
      INSERT INTO nomina_novedades VALUES (103,80,1,'2026-08-25','2026-08-27',TRUE);
      INSERT INTO nomina_novedad_turnos VALUES (103,'INTERNO',103,80,860,103,3,'{}',NULL,TRUE);
    `);
    const clipped = (await db.query<Record<string, unknown>>(queryFor('turnosInternosCoberturaResult'), params)).rows.find(turn => turn.id === '103')!;
    assert.equal(clipped.fecha_inicio, periodo.start);
    assert.equal(clipped.fecha_fin, '2026-08-27');
    // A historical source ID must never select an arbitrary duplicate destination.
    await db.exec('INSERT INTO nomina_empleados VALUES (850,3,860,1)');
    assert.equal((await db.query(queryFor('turnosInternosCoberturaResult'), params)).rows.length, 0);
  } finally { await db.close(); }
});

const matrix = (code: string) => buildNominaEffectMatrixFromConfig({
  codigo_operativo: code, nombre: code,
  efecto_salario: code === 'PR1' ? 'SIN_EFECTO' : 'DESCUENTA_PROPORCIONAL',
  efecto_auxilio_transporte: 'DESCUENTA_DIA', efecto_recargos_detallado: code === 'PR1' ? 'SIN_EFECTO' : 'EXCLUIR_DIA',
  efecto_liquidacion: 'SIN_EFECTO', efecto_cobertura_config: 'SIN_EFECTO', efecto_operativo: 'SIN_EFECTO',
  modelo_registro: 'POR_PERIODO', proyecta_periodos: false, bloquea_otras_novedades: false,
  grupo_exclusividad: 'NINGUNA', observacion_plantilla: null
});

for (const date of ['2026-08-25','2026-08-26','2026-08-27','2026-08-28','2026-08-29','2026-08-30','2026-08-31','2026-09-25','2026-09-26']) {
  for (const code of ['PNR','S','PR1']) {
    test(`${code} ${date}: descuentos segun corte 26-25, con base salarial de septiembre`, () => {
      const included = date >= periodo.start && date <= periodo.end;
      const effects = resolveNominaEfectosPorDia({
        periodo, employment: {start:'2026-07-01',end:periodo.end},
        events: [{origen:'PERIODO',fuente_id:code + date,fecha_inicio:date,fecha_fin:date,dias:1,matrix:matrix(code)}]
      });
      const salaryDiscount = included && code !== 'PR1' ? 1 : 0;
      const otherDiscount = included ? 1 : 0;
      assert.equal(effects.dias_salario_descuento, salaryDiscount);
      assert.equal(effects.dias_transporte_descuento, otherDiscount);
      assert.equal(effects.dias_recargo_excluido, salaryDiscount);
      const paid = calculateNominaPaidDays({eligibleDays:base.days,
        salaryDiscountDays:effects.dias_salario_descuento,
        transportDiscountDays:effects.dias_transporte_descuento,
        surchargeDiscountDays:effects.dias_recargo_excluido});
      const result = calculateCoberturaPayroll({mes_liquidado_base:base,
        empleo:{fecha_inicio:'2026-07-01',fecha_fin:periodo.end},
        tramos:[{fecha_inicio:periodo.start,fecha_fin:periodo.end,categoria}],
        dias_efectos:effects.days,aporta_pension:true});
      assert.equal(result.dias_salario, paid.salaryPaidDays);
      assert.equal(result.dias_transporte, 30 - otherDiscount);
      assert.equal(result.dias_recargo, 30 - salaryDiscount);
      assert.equal(result.salario_ordinario, (30 - salaryDiscount) * 100_000);
      assert.equal(result.transporte_ordinario, (30 - otherDiscount) * 10_000);
      assert.equal(result.recargos_ordinarios, (30 - salaryDiscount) * 5_000);
    });
  }
}

test('el servicio conserva el mes para dias base y usa el corte en consultas y tramo de respaldo', () => {
  assert.match(body, /const diasVigenciaNomina = mesLiquidadoBase.days/);
  assert.match(body, /employment: employmentRange,\s+events: effectEvents,\s+periodo: periodoRange/);
  assert.match(body, /periodoId, operationalRange: true/);
  const operativeEmployment = body.slice(body.indexOf('const employmentRange:'), body.indexOf('const mesLiquidadoBase ='));
  assert.doesNotMatch(operativeEmployment, /fecha_inicio_pago|fecha_fin_pago|mesLiquidadoBase/);
  assert.match(body, /tramos: tramosCobertura.length > 0 \? tramosCobertura : \[\{\s+fecha_inicio: periodoRange.start,\s+fecha_fin: periodoRange.end/);
  assert.doesNotMatch(body, /fecha_(?:inicio|fin): mesLiquidadoBase/);
  assert.equal(calculateNominaMonthBase(2026,9,'2026-09-07').days,24);
  assert.equal(calculateNominaMonthBase(2026,9,'2026-07-01','2026-09-03').days,3);
  assert.equal(calculateNominaMonthBase(2026,9,'2026-09-26').days,5);
  assert.equal(calculateNominaMonthBase(2026,9,'2026-09-30').days,1);
});
