import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { AppError } from '../utils/AppError';
import { buildTurnosConsolidado, buildCsv } from '../modules/nomina/nomina.exporter';
import { countInclusiveDays } from '../modules/nomina/nomina.effects';
import { calculateCoberturaPayroll } from '../modules/nomina/nomina.cobertura';
import { resolveNominaMovimientoValue, normalizeNominaMovimientoEstado, resolveNominaMovimientoFamilia } from '../modules/nomina/nomina.movimientos';

const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
function functionsFrom(path: string, names: string[], globals: Record<string, unknown> = {}) {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const nodes = source.statements.filter(node =>
    ts.isVariableStatement(node) && node.declarationList.declarations.some(d => names.includes(d.name.getText(source))) ||
    ts.isFunctionDeclaration(node) && node.name && names.includes(node.name.text));
  assert.equal(nodes.length, names.length);
  const context: any = { exports: {}, ...globals };
  runInNewContext(ts.transpileModule(nodes.map(n => n.getText(source)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return Object.fromEntries(names.map(name => [name, runInNewContext(name, context)]));
}

async function fixture(start = '2026-09-08', end = '2026-09-09') {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE contratos (id bigint PRIMARY KEY, empresa_id bigint);
    CREATE TABLE nomina_periodos (id bigint PRIMARY KEY, contrato_id bigint, estado text);
    CREATE TABLE nomina_novedades (id bigint PRIMARY KEY, fecha_inicio date, fecha_fin date, activo boolean);
    CREATE TABLE nomina_novedad_turnos (id bigint PRIMARY KEY, movimiento_id bigint, nomina_novedad_id bigint,
      periodo_id bigint, tipo_turno text, activo boolean, contexto_operativo jsonb);
    CREATE TABLE nomina_movimientos (id bigint PRIMARY KEY, periodo_id bigint, nomina_empleado_id bigint,
      tipo_movimiento text, estado text, activo boolean, cantidad numeric(16,2), valor_unitario numeric(16,2),
      valor_calculado numeric(16,2), valor_total numeric(16,2), afecta_seguridad_social boolean,
      tarifa_config_id bigint, updated_by bigint, updated_at timestamptz, fecha date,
      externo_id bigint, persona_reemplazada_id bigint, modalidad_id bigint, institucion_id bigint, sede_id bigint,
      contexto_municipio text, contexto_modalidad text, contexto_institucion text, contexto_sede text,
      es_devengado boolean DEFAULT true, es_deduccion boolean DEFAULT false, descripcion text, created_at timestamptz,
      vinculacion_id bigint DEFAULT 11);
    CREATE TABLE personas (id bigint PRIMARY KEY, primer_nombre text, segundo_nombre text, primer_apellido text, segundo_apellido text);
    CREATE TABLE modalidades (id bigint PRIMARY KEY, nombre_modalidad text);
    CREATE TABLE instituciones (id bigint PRIMARY KEY, nombre_institucion text);
    CREATE TABLE sedes (id bigint PRIMARY KEY, nombre_sede text);
    CREATE TABLE audit_calls (payload jsonb);
    CREATE TABLE writes (id bigint);
    CREATE FUNCTION track_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN INSERT INTO writes VALUES (NEW.id); RETURN NEW; END; $$;
    CREATE TRIGGER track_write AFTER UPDATE ON nomina_movimientos FOR EACH ROW EXECUTE FUNCTION track_write();
    INSERT INTO contratos VALUES (9, 8);
    INSERT INTO nomina_periodos VALUES (1, 9, 'ABIERTO');
    INSERT INTO nomina_movimientos (id, periodo_id, nomina_empleado_id, tipo_movimiento, estado,
      activo, cantidad, valor_unitario, valor_calculado, valor_total, afecta_seguridad_social,
      tarifa_config_id, fecha, externo_id, modalidad_id, contexto_modalidad)
    VALUES (10, 1, 7, 'TURNO_EXTERNO', 'PENDIENTE', true, 1, 97800, 97800, 97800, false, 5,
      '2026-09-08', 4, 2, 'CAA');
    INSERT INTO nomina_novedad_turnos VALUES (20, 10, 30, 1, 'EXTERNO', true, '{}');
  `);
  await db.query('INSERT INTO nomina_novedades VALUES (30,$1::date,$2::date,true)', [start, end]);
  const client: any = { query: (sql: string, params?: any[]) => db.query(sql, params) };
  const functions = functionsFrom('src/modules/nomina/nomina.turnos-externos.ts',
    ['loadNominaExternalTurnRange', 'repairPositiveExternalTurnSnapshots'], {
      AppError,
      registerAuditEntry: async (input: any) => {
        assert.equal(input.client, client);
        await db.query('INSERT INTO audit_calls VALUES ($1::jsonb)', [JSON.stringify({ ...input, client: undefined })]);
      },
    });
  return { db, client, loadNominaExternalTurnRange: functions.loadNominaExternalTurnRange!,
    repair: (ids?: string[]) => functions.repairPositiveExternalTurnSnapshots!('1', '6', client, ids),
    row: async () => (await db.query<any>('SELECT * FROM nomina_movimientos WHERE id=10')).rows[0],
  };
}

for (const [label, start, end, days] of [
  ['un dia', '2026-09-08', '2026-09-08', 1],
  ['dos dias', '2026-09-08', '2026-09-09', 2],
  ['tres dias', '2026-09-08', '2026-09-10', 3],
  ['cruce de mes', '2026-08-31', '2026-09-01', 2],
] as const) {
  test(`snapshot positivo: ${label}, tarifa conservada, reparacion idempotente`, async () => {
    const h = await fixture(start, end);
    try {
      // Same-day fixture is deliberately wrong too; other fixtures reproduce quantity=1.
      if (days === 1) await h.db.exec('UPDATE nomina_movimientos SET cantidad=2, valor_total=195600, valor_calculado=195600; DELETE FROM writes');
      assert.equal(await h.repair(), 1);
      const repaired = await h.row();
      assert.equal(Number(repaired.cantidad), days);
      assert.equal(Number(repaired.valor_unitario), 97800);
      assert.equal(Number(repaired.valor_calculado), days * 97800);
      assert.equal(Number(repaired.valor_total), days * 97800);
      assert.equal(repaired.tarifa_config_id, 5);
      assert.equal(repaired.afecta_seguridad_social, false);
      assert.equal(repaired.estado, 'PENDIENTE');
      assert.equal(await h.repair(), 0);
      assert.deepEqual(await h.row(), repaired); // Includes timestamp, status and all metadata.
      for (const [table, count] of [['nomina_movimientos', 1], ['nomina_novedad_turnos', 1], ['audit_calls', 1], ['writes', 1]] as const) {
        assert.equal(Number((await h.db.query<any>(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n), count);
      }
    } finally { await h.db.close(); }
  });
}

test('reparacion y auditoria se revierten juntas si la transaccion se cancela', async () => {
  const h = await fixture();
  try {
    await h.db.exec('BEGIN');
    assert.equal(await h.repair(), 1);
    await h.db.exec('ROLLBACK');
    assert.equal(Number((await h.row()).cantidad), 1);
    assert.equal((await h.db.query('SELECT * FROM audit_calls')).rows.length, 0);
    assert.equal(await h.repair(), 1);
    assert.equal(await h.repair(), 0);
  } finally { await h.db.close(); }
});

test('el filtro por empleado no repara otros empleados del periodo', async () => {
  const h = await fixture();
  try {
    assert.equal(await h.repair(['999']), 0);
    assert.equal(await h.repair(['7']), 1);
  } finally { await h.db.close(); }
});

for (const [label, setup] of [
  ['interno de 34740', "UPDATE nomina_movimientos SET tipo_movimiento='TURNO_INTERNO', valor_unitario=34740, valor_total=34740, valor_calculado=34740; UPDATE nomina_novedad_turnos SET tipo_turno='INTERNO'"],
  ['periodo cerrado', "UPDATE nomina_periodos SET estado='CERRADO'"],
  ['movimiento inactivo', 'UPDATE nomina_movimientos SET activo=false'],
  ['rechazado', "UPDATE nomina_movimientos SET estado='RECHAZADO'"],
  ['novedad inactiva', 'UPDATE nomina_novedades SET activo=false'],
  ['sin tarifa certificada', 'UPDATE nomina_movimientos SET tarifa_config_id=NULL'],
  ['rango invertido', "UPDATE nomina_novedades SET fecha_fin='2026-09-07'"],
] as const) {
  test(`no altera ${label}`, async () => {
    const h = await fixture();
    try {
      await h.db.exec(setup);
      const before = await h.row();
      assert.equal(await h.repair(), 0);
      assert.deepEqual(await h.row(), before);
      assert.equal(before.afecta_seguridad_social, false);
      assert.equal((await h.db.query('SELECT * FROM audit_calls')).rows.length, 0);
    } finally { await h.db.close(); }
  });
}

test('enlaces repetidos al mismo rango no duplican el movimiento ni su auditoria; rangos ambiguos se rechazan', async () => {
  const h = await fixture();
  try {
    await h.db.exec("INSERT INTO nomina_novedad_turnos SELECT 21, movimiento_id, nomina_novedad_id, periodo_id, tipo_turno, activo, contexto_operativo FROM nomina_novedad_turnos");
    assert.equal(await h.repair(), 1);
    assert.equal(await h.repair(), 0);
    await h.db.exec("INSERT INTO nomina_novedades VALUES (31,'2026-09-08','2026-09-10',true); UPDATE nomina_novedad_turnos SET nomina_novedad_id=31 WHERE id=21");
    assert.equal(await h.repair(), 0);
    await assert.rejects(h.loadNominaExternalTurnRange!(h.client, '10'), (e: any) => e.code === 'NOMINA_TURNO_EXTERNO_RANGO_INVALIDO');
  } finally { await h.db.close(); }
});

test('DATE PostgreSQL e ISO del frontend conservan los dias en UTC y America/Bogota', async () => {
  const frontend = functionsFrom('FrontendNuevo/src/pages/nomina/TurnosPage.tsx', ['countInclusiveDays']);
  const h = await fixture();
  const previous = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Bogota', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      await h.db.exec(`SET TIME ZONE '${zone}'`);
      const range = await h.loadNominaExternalTurnRange!(h.client, '10');
      assert.equal(range.fecha_inicio, '2026-09-08');
      assert.equal(range.fecha_fin, '2026-09-09');
      assert.equal(range.dias, 2);
      assert.equal(countInclusiveDays(range.fecha_inicio, range.fecha_fin), 2);
      for (const suffix of ['', 'T00:00:00.000Z', 'T00:00:00-05:00']) {
        assert.equal(frontend.countInclusiveDays!(`2026-09-08${suffix}`, `2026-09-09${suffix}`), 2);
      }
    }
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    await h.db.close();
  }
});

test('editar un movimiento externo enlazado deriva cantidad de su novedad y conserva reglas internas', async () => {
  const h = await fixture();
  try {
    const updates: any[][] = [];
    let audits = 0;
    const current: any = { ...await h.row(), id: '10', periodo_id: '1', nomina_empleado_id: '7',
      vinculacion_id: '11', fecha: '2026-09-08', persona: { id: '3' } };
    const client = {
      query: async (sql: string, params: any[]) => {
        if (/UPDATE nomina_movimientos/.test(sql)) { updates.push(params); return { rows: [] }; }
        if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
        return h.client.query(sql, params);
      }, release: () => {},
    };
    const noOp = async () => {};
    const editor = functionsFrom('src/modules/nomina/nomina.service.ts', ['updateNominaMovimiento'], {
      AppError, dbPool: { connect: async () => client },
      loadNominaMovimientoByIdOrThrow: async () => current,
      assertNominaEmpleadoCoberturaScope: noOp,
      loadRealPeriodoOrThrow: async () => ({ id: '1', contrato_id: '9', contrato_empresa_id: '8', estado: 'ABIERTO', fecha_inicio: '2026-08-26', fecha_fin: '2026-09-25' }),
      loadNominaEmpleadoByIdOrThrow: async () => ({}),
      assertPeriodoAllowsOpenMutations: noOp, assertNominaEmpleadoEditable: noOp,
      loadNominaExternalTurnRange: h.loadNominaExternalTurnRange,
      toDateString: (v: any) => v, toNumberValue: Number, toOptionalNumberValue: (v: any) => v == null ? null : Number(v),
      toBooleanValue: Boolean, resolveNominaMovimientoFamilia, normalizeNominaMovimientoEstado,
      isNominaTurnMovementType: (v: string) => ['TURNO_INTERNO', 'TURNO_EXTERNO'].includes(v),
      ensureVinculacionExists: async () => ({}), ensurePeriodoRelacionadoConFecha: noOp, assertNominaMovimientoFechaVigente: noOp,
      resolveNominaMovimientoContext: async (v: any) => v,
      resolveRequiredTurnMovementTarifa: async () => ({ id: '5', valor_unitario: current.tipo_movimiento === 'TURNO_INTERNO' ? 34740 : 97800 }),
      resolveNominaMovimientoValue, buildNominaMovimientoAlerts: async () => ({ alerts: [], posible_duplicado: false }),
      mapRealMovimiento: (v: any) => v, registerAuditEntry: async () => { audits++; },
      registrarEventoLaboralNomina: noOp, recalculateNominaPeriodo: noOp,
    });
    await editor.updateNominaMovimiento!('10', { cantidad: 1 }, '6');
    assert.equal(updates.length, 1);
    assert.equal(updates[0]![6], 2); // SQL cantidad.
    assert.equal(updates[0]![7], 97800);
    assert.equal(updates[0]![8], 195600);
    assert.equal(updates[0]![9], 195600);
    assert.equal(updates[0]![29], false); // SQL afecta_seguridad_social.
    assert.equal(audits, 1);
    await assert.rejects(editor.updateNominaMovimiento!('10', { fecha: '2026-09-10' }, '6'),
      (e: any) => e.code === 'NOMINA_TURNO_EXTERNO_FECHA_ORIGEN');
    await assert.rejects(editor.updateNominaMovimiento!('10', { tipo_movimiento: 'TURNO_INTERNO' }, '6'),
      (e: any) => e.code === 'NOMINA_TURNO_EXTERNO_TIPO_ORIGEN');
    assert.equal(updates.length, 1);
    assert.equal(audits, 1);
    current.tipo_movimiento = 'TURNO_INTERNO';
    await editor.updateNominaMovimiento!('10', { cantidad: 1 }, '6');
    assert.equal(updates[1]![6], 1);
    assert.equal(updates[1]![7], 34740);
    assert.equal(updates[1]![9], 34740);
  } finally { await h.db.close(); }
});

test('frontend y consolidado exportado consumen 2 dias y 195600 tras reparar', async () => {
  const h = await fixture();
  try {
    await h.repair();
    const row = await h.row();
    const frontend = functionsFrom('FrontendNuevo/src/pages/nomina/TurnosPage.tsx', ['countInclusiveDays']);
    const range = await h.loadNominaExternalTurnRange!(h.client, '10');
    assert.equal(frontend.countInclusiveDays!(range.fecha_inicio, range.fecha_fin), Number(row.cantidad));
    const consolidated = buildTurnosConsolidado([{ cantidad: Number(row.cantidad), valor_total: Number(row.valor_total),
      documento_reemplazante: 'QA-1', nombre_reemplazante: 'PERSONA QA', tipo_reemplazante: 'EXTERNO', modalidad: 'CAA' }]);
    assert.equal(consolidated.rows[0]!['TOTAL TURNOS'], 2);
    assert.equal(consolidated.rows[0]!['TOTAL A PAGAR'], 195600);
    assert.match(buildCsv(consolidated.headers, consolidated.rows), /195600/);
  } finally { await h.db.close(); }
});

function serviceQuery(marker: string) {
  const source = ts.createSourceFile('service.ts', service, ts.ScriptTarget.Latest, true);
  const matches: string[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isNoSubstitutionTemplateLiteral(node) && node.text.includes(marker)) matches.push(node.text);
    ts.forEachChild(node, walk);
  };
  walk(source);
  assert.equal(matches.length, 1, marker);
  return matches[0]!;
}

test('Nomina y desprendible no suman el pago externo al salario/IBC del titular', async () => {
  const h = await fixture();
  try {
    await h.repair();
    const payrollSql = serviceQuery('AS movimientos_turnos_internos_ss_devengados');
    const payroll = (await h.db.query<any>(payrollSql, ['1'])).rows[0];
    assert.equal(Number(payroll.movimientos_devengados), 0);
    assert.equal(Number(payroll.movimientos_ss_devengados), 0);
    assert.equal(Number(payroll.movimientos_turnos_internos_devengados), 0);
    const receiptSql = serviceQuery('ORDER BY nm.nomina_empleado_id ASC, nm.created_at ASC, nm.id ASC');
    assert.equal((await h.db.query(receiptSql, ['1'])).rows.length, 0); // Pending stays pending.
    await h.db.exec("UPDATE nomina_movimientos SET estado='APROBADO'");
    const approved = (await h.db.query<any>(receiptSql, ['1'])).rows[0];
    assert.equal(Number(approved.cantidad), 2);
    assert.equal(Number(approved.valor_total), 195600);
    const payrollAfterApproval = (await h.db.query<any>(payrollSql, ['1'])).rows[0];
    assert.equal(Number(payrollAfterApproval.movimientos_devengados), 0);
    assert.equal(Number(payrollAfterApproval.movimientos_ss_devengados), 0);
    const payloadFn = functionsFrom('src/modules/nomina/nomina.service.ts', ['buildNominaDesprendiblePayload']);
    const payload = payloadFn.buildNominaDesprendiblePayload!({ movimientos: [approved], novedades: [] });
    assert.equal(Number(payload.movimientos[0].valor_total), 195600);
    const body = service.slice(service.indexOf('const repairMissingNominaTurnMovementSnapshots'), service.indexOf('const validateNovedadInputAgainstTipo'));
    assert.match(body, /await repairPositiveExternalTurnSnapshots/);
    assert.ok(service.indexOf('await repairMissingNominaTurnMovementSnapshots(\n') < service.indexOf('AS movimientos_turnos_internos_ss_devengados'));
  } finally { await h.db.close(); }
});

test('cuenta externa recibe el total persistido y dias inclusivos del mismo turno', async () => {
  const h = await fixture();
  try {
    await h.repair();
    const accountFn = functionsFrom('src/modules/nomina/cobertura.externos.service.ts', ['loadCoberturaCuentaTurnSnapshots']);
    const rows = await accountFn.loadCoberturaCuentaTurnSnapshots!({ externo_id: '4', periodo_id: '1', contrato_id: '9', empresa_id: '8' }, h.client);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].dias_efectivos, 2);
    assert.equal(Number(rows[0].valor_diario), 97800);
    assert.equal(Number(rows[0].valor), 195600);
    assert.equal(rows[0].movimiento_id, '10');
  } finally { await h.db.close(); }
});

test('expediente conserva un turno y actualiza su total externo a 195600', async () => {
  const h = await fixture();
  try {
    const activitySource = readFileSync('src/modules/vinculaciones/actividad-laboral.service.ts', 'utf8');
    const turnSql = activitySource.match(/\), t AS \(([\s\S]*?)\), l AS/);
    assert.ok(turnSql);
    const sql = turnSql[1]!.replace(/\$2/g, '$1');
    const before = (await h.db.query<any>(sql, [11])).rows[0].datos;
    assert.equal(before.externos, 1);
    assert.equal(before.valor_externo, 97800);
    await h.repair();
    const after = (await h.db.query<any>(sql, [11])).rows[0].datos;
    assert.equal(after.externos, 1);
    assert.equal(after.valor_externo, 195600);
    assert.equal(after.valor_interno, 0);
  } finally { await h.db.close(); }
});

test('turno interno de 34740 permanece fuera del IBC sin cambiar su regla economica', () => {
  const categoria = { categoria_id: 'QA', codigo_categoria: 'QA', nombre_categoria: 'QA',
    salario_base: 3000000, auxilio_transporte: 0, recargo_mensual: 0 };
  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30' },
    tramos: [{ fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', categoria }],
    dias_efectos: [], aporta_pension: true,
    adiciones_internas: [{ fecha_inicio: '2026-09-08', fecha_fin: '2026-09-08', categoria,
      aporta_pension: true, valor_unitario: 34740, afecta_seguridad_social: false }],
  });
  assert.equal(result.adiciones_internas[0]!.devengado_turno, 34740);
  assert.equal(result.adiciones_internas[0]!.salud_turno, 0);
  assert.equal(result.adiciones_internas[0]!.pension_turno, 0);
});
