import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { AppError } from '../utils/AppError';
import { resolveNominaMovimientoValue } from '../modules/nomina/nomina.movimientos';
import { createNominaNovedadConTurnoSchema } from '../modules/nomina/nomina.schemas';
import { resolveNovedadTurnContext, selectTurnContext } from '../modules/nomina/nomina.turn-context';
import { countInclusiveDays } from '../modules/nomina/nomina.effects';

// Execute the production orchestrator, coverage persistence and tariff/snapshot
// helpers. Replace DB access, novelty creation and recalculation at their boundaries.
const source = ts.createSourceFile('nomina.service.ts', readFileSync('src/modules/nomina/nomina.service.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = new Set([
  'createNominaNovedadConTurno', 'syncNominaNovedadCobertura',
  'resolveNominaMovimientoTarifa', 'resolveRequiredTurnMovementTarifa',
  'resolveNominaTurnMovementSnapshot', 'insertNominaTurnMovementSnapshot',
]);
const selected = source.statements.filter(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(decl => names.has(decl.name.getText(source))));
assert.equal(selected.length, names.size);
const code = ts.transpileModule(selected.map(node => node.getText(source)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(resolvedCode: string, recalculateFails = false, movementFails = false, unitValue = 125000) {
  const queries: Array<{ sql: string; params: any[] }> = [];
  const recalculations: any[] = [];
  const creations: any[] = [];
  let contextResolutions = 0;
  let destinationResolutions = 0;
  let released = false;
  const client = {
    async query(sql: string, params: any[] = []) {
      queries.push({ sql, params });
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (/UPDATE nomina_novedad_coberturas|INSERT INTO nomina_novedad_coberturas/.test(sql)) return { rows: [] };
      if (/FROM nomina_empleados ne/.test(sql)) return { rows: [{ persona_id: '20', vinculacion_id: '30' }] };
      if (/SELECT c.empresa_id/.test(sql)) return { rows: [{ empresa_id: '40' }] };
      if (/INSERT INTO cobertura_externos/.test(sql)) return { rows: [{ id: '50' }] };
      if (/INSERT INTO nomina_novedad_turnos/.test(sql)) return { rows: [{ id: '60' }] };
      if (/SELECT id::text\s+FROM nomina_movimientos/.test(sql)) return { rows: [] };
      if (/FROM nomina_movimiento_tarifas/.test(sql)) return { rows: [{ id: '70', valor_unitario: String(unitValue) }] };
      if (/INSERT INTO nomina_movimientos/.test(sql)) return { rows: movementFails ? [] : [{ id: '80' }] };
      if (/UPDATE nomina_novedad_turnos/.test(sql)) return { rows: [] };
      assert.fail(`Unexpected SQL: ${sql}`);
    },
    release() { released = true; },
  };
  const exports: any = {};
  const context: any = {
    exports, AppError, Error, dbPool: { connect: async () => client },
    loadRealPeriodoOrThrow: async () => ({ contrato_id: '90', contrato_empresa_id: '40', fecha_inicio: '2026-09-26' }),
    resolveNominaTipoNovedadOrThrow: async () => ({ codigo_operativo: resolvedCode }),
    resolveNovedadTurnContext,
    resolveSelectedTurnContext: async (_periodo: any, _empleado: any, _fecha: any, _fechaFin: any, selected: any) => {
      destinationResolutions++;
      return selectTurnContext([{
        municipio_id: '44', municipio: 'Municipio', institucion_id: '41', institucion: 'Institución',
        sede_id: '42', sede: 'Sede', modalidad_id: '43', modalidad: 'Modalidad',
      }], selected);
    },
    createNominaNovedad: async (input: any, _actor: any, _tenant: any, _audit: any, executor: any) => {
      assert.equal(executor, client);
      creations.push(input);
      await runInNewContext('syncNominaNovedadCobertura', context)(client, {
        cobertura: input.cobertura, novedadId: '100',
        empleado: { contrato_id: '90', vinculacion_id: '30', persona: { id: '20' } },
      });
      return { id: '100', tipo_novedad: { codigo_operativo: resolvedCode } };
    },
    recalculateNominaPeriodo: async (...args: any[]) => {
      assert.ok(queries.some(q => q.sql === 'COMMIT'), 'Recalcular después de confirmar');
      recalculations.push(args);
      if (recalculateFails) throw new Error('recalculation failed');
    },
    loadPersonaIdentityByIdOrThrow: async () => ({ id: '21', numero_documento: '123', primer_nombre: 'ANA', primer_apellido: 'PEREZ' }),
    ensureVinculacionExists: async () => ({ id: '31', persona_id: '21', contrato_id: '90' }),
    normalizeFullName: (...parts: any[]) => parts.filter(Boolean).join(' '),
    loadNominaEmpleadoByIdOrThrow: async () => ({ id: '11', periodo_id: '1', vinculacion_id: '31' }),
    resolveNominaMovimientoContext: async (input: any) => {
      contextResolutions++;
      return input;
    },
    resolveNominaMovimientoValue, toNumberValue: Number,
    countInclusiveDays,
    registerAuditEntry: async () => {}, registrarEventoLaboralNomina: async () => {},
  };
  runInNewContext(code, context);
  return { save: exports.createNominaNovedadConTurno, queries, recalculations, creations,
    resolutions: () => contextResolutions, destinations: () => destinationResolutions, released: () => released };
}

function input(code: string, coverage: 'SIN_REEMPLAZO' | 'PERSONAL_VINCULADO' | 'PERSONA_EXTERNA', complete = false) {
  return createNominaNovedadConTurnoSchema.parse({
    periodo_id: '1', nomina_empleado_id: '10', vinculacion_id: '30', tipo_novedad_codigo: code,
    fecha_inicio: '2026-09-26', fecha_fin: '2026-09-27', dias: 2,
    cobertura: { tipo_cobertura: coverage, persona_cubre_id: '21', vinculacion_cubre_id: '31', nombre_externo: 'ANA', documento_externo: '123' },
    turno: { tipo: coverage === 'PERSONAL_VINCULADO' ? 'INTERNO' : 'EXTERNO', contexto_operativo: {
      persona_externa_nombre: 'ANA', cobertura_documento_externo: '123', cobertura_interna_nomina_empleado_id: '11',
      ...(complete ? { institucion_id: '41', sede_id: '42', modalidad_id: '43' } : {}),
    } },
  });
}

for (const [start, end, days] of [
  ['2026-09-08', '2026-09-08', 1],
  ['2026-09-08', '2026-09-09', 2],
  ['2026-09-08', '2026-09-10', 3],
  ['2026-08-31', '2026-09-01', 2],
] as const) {
  test(`creacion externa ${start}/${end}: ${days} dias a 97800 sin IBC`, async () => {
    const h = harness('TURNO_ADICIONAL', false, false, 97800);
    await h.save({ ...input('TURNO_ADICIONAL', 'PERSONA_EXTERNA', true), fecha_inicio: start, fecha_fin: end, dias: days }, '7');
    const movements = h.queries.filter(q => /INSERT INTO nomina_movimientos/.test(q.sql));
    assert.equal(movements.length, 1);
    assert.equal(movements[0]!.params[7], days);
    assert.equal(movements[0]!.params[8], 97800);
    assert.equal(movements[0]!.params[9], days * 97800);
    assert.equal(movements[0]!.params[10], days * 97800);
    assert.equal(movements[0]!.params[23], false);
  });
}

for (const [code, coverage] of [
  ['PNR', 'SIN_REEMPLAZO'], ['PNR', 'PERSONAL_VINCULADO'], ['PNR', 'PERSONA_EXTERNA'],
  ['S', 'PERSONA_EXTERNA'], ['SUSPENSIÓN', 'PERSONA_EXTERNA'], ['PR1', 'PERSONA_EXTERNA'], ['INC_GENERAL', 'PERSONA_EXTERNA'],
] as const) {
  test(`${code} + ${coverage}: guarda cobertura sin resolver contexto, tarifa ni crear turnos económicos`, async () => {
    const h = harness(code);
    const payload = input(code, coverage);
    const result = await h.save(payload, '7');
    assert.equal(result.novedad.id, '100');
    assert.equal(result.turno_id, null);
    assert.equal(result.turno, null);
    assert.equal(h.destinations(), 0);
    assert.equal(h.resolutions(), 0);
    assert.equal(h.creations[0], payload);
    const persisted = h.queries.find(q => /INSERT INTO nomina_novedad_coberturas/.test(q.sql));
    assert.ok(persisted);
    assert.equal(persisted.params[1], coverage);
    assert.equal(persisted.params[coverage === 'PERSONAL_VINCULADO' ? 2 : 4], coverage === 'PERSONAL_VINCULADO' ? '21' : coverage === 'PERSONA_EXTERNA' ? 'ANA' : null);
    assert.ok(h.queries.some(q => q.sql === 'COMMIT'));
    assert.ok(h.queries.every(q => !/nomina_movimientos|nomina_movimiento_tarifas|nomina_novedad_turnos|cobertura_externos/.test(q.sql)));
    assert.equal(h.recalculations.length, 1);
    assert.equal(h.recalculations[0][1].nomina_empleado_id, '10');
    assert.equal(h.released(), true);
  });
}

test('la separación usa código del catálogo resuelto por ID, no el código enviado', async () => {
  const h = harness('PNR');
  await h.save({ ...input('TURNO_ADICIONAL', 'PERSONA_EXTERNA'), tipo_novedad_id: '3' }, '7');
  assert.equal(h.resolutions(), 0);
  assert.ok(h.queries.every(q => !/INSERT INTO nomina_novedad_turnos/.test(q.sql)));
});

test('TURNO_ADICIONAL sin contexto falla y hace rollback', async () => {
  const h = harness('TURNO_ADICIONAL');
  await assert.rejects(h.save(input('TURNO_ADICIONAL', 'PERSONA_EXTERNA'), '7'), (error: any) => error.code === 'TURNO_INSTITUCION_REQUERIDA');
  assert.equal(h.creations.length, 0);
  assert.ok(h.queries.some(q => q.sql === 'ROLLBACK'));
  assert.ok(h.queries.every(q => q.sql !== 'COMMIT'));
  assert.equal(h.recalculations.length, 0);
});

for (const coverage of ['PERSONA_EXTERNA', 'PERSONAL_VINCULADO'] as const) {
  test(`TURNO_ADICIONAL + ${coverage} conserva tarifa y snapshot del contexto completo`, async () => {
    const h = harness('TURNO_ADICIONAL');
    const result = await h.save(input('TURNO_ADICIONAL', coverage, true), '7');
    assert.equal(result.turno_id, '60');
    assert.equal(h.resolutions(), 1);
    assert.equal(h.destinations(), 1);
    const tariff = h.queries.find(q => /FROM nomina_movimiento_tarifas/.test(q.sql));
    assert.ok(tariff);
    assert.equal(tariff.params[4], '41');
    assert.equal(tariff.params[5], '42');
    assert.equal(tariff.params[6], '43');
    const movement = h.queries.find(q => /INSERT INTO nomina_movimientos/.test(q.sql));
    assert.ok(movement);
    assert.equal(movement.params[4], coverage === 'PERSONA_EXTERNA' ? 'TURNO_EXTERNO' : 'TURNO_INTERNO');
    assert.deepEqual(Array.from(movement.params.slice(14, 23)), ['44', '41', '42', '43', 'Municipio', 'Institución', 'Sede', 'Modalidad', '70']);
    assert.equal(movement.params[8], 125000);
    assert.equal(movement.params[9], 250000);
    assert.equal(movement.params[10], 250000);
    assert.ok(h.queries.some(q => q.sql === 'COMMIT'));
  });
}

for (const [missing, errorCode] of [
  ['institucion_id', 'TURNO_INSTITUCION_REQUERIDA'],
  ['sede_id', 'TURNO_SEDE_REQUERIDA'],
  ['modalidad_id', 'TURNO_MODALIDAD_REQUERIDA'],
] as const) {
  test(`TURNO_ADICIONAL exige ${missing} mediante el contexto actual de main`, async () => {
    const h = harness('TURNO_ADICIONAL');
    const payload = input('TURNO_ADICIONAL', 'PERSONA_EXTERNA', true);
    delete payload.turno.contexto_operativo[missing];
    await assert.rejects(h.save(payload, '7'), (error: any) => error.code === errorCode);
    assert.ok(h.queries.some(q => q.sql === 'ROLLBACK'));
  });
}

for (const coverage of ['PERSONA_EXTERNA', 'PERSONAL_VINCULADO'] as const) {
  test(`TURNO_ADICIONAL + ${coverage}: falla real de creación del movimiento revierte la transacción`, async () => {
    const h = harness('TURNO_ADICIONAL', false, true);
    await assert.rejects(h.save(input('TURNO_ADICIONAL', coverage, true), '7'),
      (error: any) => error.code === 'NOMINA_TURNO_MOVIMIENTO_CREATE_FAILED');
    assert.ok(h.queries.some(q => /INSERT INTO nomina_novedad_turnos/.test(q.sql)));
    assert.ok(h.queries.some(q => /FROM nomina_movimiento_tarifas/.test(q.sql)));
    assert.ok(h.queries.some(q => /INSERT INTO nomina_movimientos/.test(q.sql)));
    assert.equal(h.queries.at(-1)?.sql, 'ROLLBACK');
    assert.ok(h.queries.every(q => q.sql !== 'COMMIT'));
    assert.equal(h.recalculations.length, 0);
    assert.equal(h.released(), true);
  });
}

test('novedad normal confirma antes de recalcular y conserva el warning existente', async () => {
  const h = harness('PNR', true);
  const result = await h.save(input('PNR', 'PERSONA_EXTERNA'), '7');
  assert.equal(result.recalculate_warning, 'recalculation failed');
  assert.ok(h.queries.some(q => q.sql === 'COMMIT'));
  assert.ok(h.queries.every(q => q.sql !== 'ROLLBACK'));
});
