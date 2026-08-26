import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';

import { dbPool } from '../config/db';
import { calculateCoberturaPayroll } from '../modules/nomina/nomina.cobertura';

const tables = {
  personas: 'personas', organizaciones: 'organizaciones', empresas: 'empresas', contratos: 'contratos',
  vinculaciones: 'vinculaciones', nomina_empleados: 'nomina_empleados', liquidaciones: 'nomina_liquidaciones',
  novedades: 'nomina_novedades', movimientos: 'nomina_movimientos', categorias_salariales: 'nomina_categorias_salariales'
} as const;

async function counts(client: PoolClient) {
  const entries: Array<readonly [string, number]> = [];
  for (const [name, table] of Object.entries(tables)) {
    const result = await client.query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM ${table}`);
    entries.push([name, Number(result.rows[0]?.total ?? 0)] as const);
  }
  return Object.fromEntries(entries);
}

async function main() {
  const client = await dbPool.connect();
  const before = await counts(client);
  let rolledBack = false;
  try {
    await client.query('BEGIN');
    const overlaps = await client.query(`SELECT 1 FROM nomina_categorias_salariales a JOIN nomina_categorias_salariales b
      ON a.id < b.id AND a.contrato_id=b.contrato_id
      AND UPPER(BTRIM(a.codigo_categoria))=UPPER(BTRIM(b.codigo_categoria))
      AND a.activo=TRUE AND b.activo=TRUE
      AND DATERANGE(COALESCE(a.vigente_desde,'-infinity'),COALESCE(a.vigente_hasta,'infinity'),'[]')
        && DATERANGE(COALESCE(b.vigente_desde,'-infinity'),COALESCE(b.vigente_hasta,'infinity'),'[]') LIMIT 1`);
    assert.equal(overlaps.rowCount, 0, 'existing active salary category overlaps block safe constraint deployment');

    const migration = await readFile(resolve('sql/phase-33-nomina-4a-cobertura.sql'), 'utf8');
    await client.query(migration);

    const contracts = await client.query<{ contrato_id: string; empresa_id: string }>(`SELECT c.id::text contrato_id,c.empresa_id::text empresa_id
      FROM contratos c WHERE c.empresa_id IS NOT NULL GROUP BY c.id,c.empresa_id ORDER BY c.id`);
    const a = contracts.rows[0];
    const b = contracts.rows.find((row) => row.empresa_id !== a?.empresa_id);
    assert.ok(a && b, 'two contracts from different companies are required for A/B isolation');

    const inserted = [] as Array<{ id: string; contrato_id: string; codigo_categoria: string; salario_base: string }>;
    for (const [side, contract, salary] of [['A', a, 900_000], ['B', b, 2_700_000]] as const) {
      const row = await client.query<{ id: string; contrato_id: string; codigo_categoria: string; salario_base: string }>(
        `INSERT INTO nomina_categorias_salariales
          (contrato_id,codigo_categoria,nombre_categoria,salario_base,otros_recargos,auxilio_transporte,activo,vigente_desde,vigente_hasta)
         VALUES ($1::bigint,$2,$3,$4,$5,$6,TRUE,'2090-01-01','2090-12-31')
         RETURNING id::text,contrato_id::text,codigo_categoria,salario_base::text`,
        [contract.contrato_id, `QA4A_${side}`, `QA NÓMINA-4A ${side}`, salary, side === 'A' ? 30_000 : 90_000, side === 'A' ? 120_000 : 360_000]
      );
      inserted.push(row.rows[0]!);
    }

    const resolveCategory = async (contractId: string, code: string) => (await client.query(
      `SELECT ncs.* FROM nomina_categorias_salariales ncs JOIN contratos c ON c.id=ncs.contrato_id
       WHERE ncs.contrato_id=$1::bigint AND ncs.codigo_categoria=$2 AND '2090-06-01' BETWEEN ncs.vigente_desde AND ncs.vigente_hasta`,
      [contractId, code]
    )).rows[0];
    const categoryA = await resolveCategory(a.contrato_id, 'QA4A_A');
    const categoryB = await resolveCategory(b.contrato_id, 'QA4A_B');
    assert.equal(categoryA.salario_base, '900000.00');
    assert.equal(categoryB.salario_base, '2700000.00');
    assert.equal(await resolveCategory(a.contrato_id, 'QA4A_B'), undefined);
    assert.equal(await resolveCategory(b.contrato_id, 'QA4A_A'), undefined);

    const calc = (row: typeof categoryA) => calculateCoberturaPayroll({
      empleo: { fecha_inicio: '2090-06-01', fecha_fin: '2090-06-03' },
      tramos: [{ fecha_inicio: '2090-06-01', fecha_fin: '2090-06-03', categoria: {
        categoria_id: String(row.id), codigo_categoria: row.codigo_categoria, nombre_categoria: row.nombre_categoria,
        salario_base: Number(row.salario_base), recargo_mensual: Number(row.otros_recargos), auxilio_transporte: Number(row.auxilio_transporte)
      }}], dias_efectos: [], aporta_pension: true
    });
    const calcA = calc(categoryA); const calcB = calc(categoryB);
    assert.notEqual(calcA.neto_nomina, calcB.neto_nomina);

    await client.query('SAVEPOINT overlap_check');
    await assert.rejects(client.query(`INSERT INTO nomina_categorias_salariales
      (contrato_id,codigo_categoria,nombre_categoria,salario_base,otros_recargos,auxilio_transporte,activo,vigente_desde,vigente_hasta)
      VALUES ($1::bigint,'QA4A_A','SOLAPE',1,0,0,TRUE,'2090-06-01','2091-01-01')`, [a.contrato_id]));
    await client.query('ROLLBACK TO SAVEPOINT overlap_check');

    const novelty = (await client.query<{ id: string; periodo_id: string; nomina_empleado_id: string; vinculacion_id: string }>(
      `SELECT nn.id::text,nn.periodo_id::text,nn.nomina_empleado_id::text,nn.vinculacion_id::text
       FROM nomina_novedades nn LIMIT 1`
    )).rows[0];
    const movement = (await client.query<{ id: string; periodo_id: string; nomina_empleado_id: string; vinculacion_id: string }>(
      `SELECT nm.id::text,nm.periodo_id::text,nm.nomina_empleado_id::text,nm.vinculacion_id::text
       FROM nomina_movimientos nm LIMIT 1`
    )).rows[0];
    assert.ok(novelty && movement, 'novelty and movement rows are required as rollback-only fixture bases');
    await client.query(`UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=ANY($1::bigint[])`, [[novelty.periodo_id, movement.periodo_id]]);
    await client.query('UPDATE nomina_novedades SET observacion=observacion WHERE id=$1::bigint', [novelty.id]);
    assert.equal((await client.query(`SELECT estado_revision FROM nomina_revision_operativa
      WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint`, [novelty.periodo_id, novelty.nomina_empleado_id])).rows[0]?.estado_revision, 'REQUIERE_REVISION');

    await client.query('DELETE FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint', [novelty.periodo_id, novelty.nomina_empleado_id]);
    assert.equal((await client.query(`SELECT COUNT(*)::int total FROM nomina_revision_operativa WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint`, [novelty.periodo_id, novelty.nomina_empleado_id])).rows[0]?.total, 0);
    await client.query(`UPDATE nomina_periodos SET estado='CERRADO' WHERE id=$1::bigint`, [novelty.periodo_id]);
    assert.equal((await client.query(`SELECT estado FROM nomina_periodos WHERE id=$1::bigint`, [novelty.periodo_id])).rows[0]?.estado, 'CERRADO');
    await client.query('UPDATE nomina_novedades SET observacion=observacion WHERE id=$1::bigint', [novelty.id]);
    assert.equal((await client.query(`SELECT COUNT(*)::int total FROM nomina_revision_operativa
      WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint`, [novelty.periodo_id, novelty.nomina_empleado_id])).rows[0]?.total, 0);
    await client.query(`UPDATE nomina_periodos SET estado='ABIERTO' WHERE id=$1::bigint`, [novelty.periodo_id]);
    await client.query('UPDATE nomina_movimientos SET descripcion=descripcion WHERE id=$1::bigint', [movement.id]);
    assert.equal((await client.query(`SELECT estado_revision FROM nomina_revision_operativa
      WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint`, [movement.periodo_id, movement.nomina_empleado_id])).rows[0]?.estado_revision, 'REQUIERE_REVISION');

    const actor = (await client.query<{ id: string }>('SELECT id::text FROM usuarios ORDER BY id LIMIT 1')).rows[0];
    assert.ok(actor);
    await client.query(`INSERT INTO nomina_novedad_turnos
      (periodo_id,nomina_novedad_id,nomina_empleado_id,vinculacion_id,tipo_turno,contexto_operativo,created_by,updated_by)
      VALUES ($1::bigint,$2::bigint,$3::bigint,$4::bigint,'INTERNO','{}'::jsonb,$5::bigint,$5::bigint)`,
      [novelty.periodo_id, novelty.id, novelty.nomina_empleado_id, novelty.vinculacion_id, actor.id]);
    assert.equal((await client.query(`SELECT estado_revision FROM nomina_revision_operativa
      WHERE periodo_id=$1::bigint AND nomina_empleado_id=$2::bigint`, [novelty.periodo_id, novelty.nomina_empleado_id])).rows[0]?.estado_revision, 'REQUIERE_REVISION');

    const pensionVinc = (await client.query<{ id: string }>(`SELECT v.id::text FROM vinculaciones v WHERE NOT EXISTS
      (SELECT 1 FROM vinculacion_condiciones_economicas vce WHERE vce.vinculacion_id=v.id AND LOWER(BTRIM(vce.tipo_condicion))='aporta_pension') LIMIT 1`)).rows[0];
    assert.ok(pensionVinc);
    await client.query(`INSERT INTO vinculacion_condiciones_economicas
      (vinculacion_id,tipo_condicion,valor,vigencia_desde,vigencia_hasta,motivo,created_by)
      VALUES ($1::bigint,'aporta_pension',1,'2091-01-01','2091-12-31','QA 4A',$2::bigint),
             ($1::bigint,'aporta_pension',0,'2092-01-01',NULL,'QA 4A',$2::bigint)`, [pensionVinc.id, actor.id]);
    const pensionHistory = await client.query<{ valor: string }>(`SELECT valor::text FROM vinculacion_condiciones_economicas
      WHERE vinculacion_id=$1::bigint AND tipo_condicion='aporta_pension' AND $2::date BETWEEN vigencia_desde AND COALESCE(vigencia_hasta,'infinity')`,
      [pensionVinc.id, '2091-06-01']);
    const pensionCurrent = await client.query<{ valor: string }>(`SELECT valor::text FROM vinculacion_condiciones_economicas
      WHERE vinculacion_id=$1::bigint AND tipo_condicion='aporta_pension' AND $2::date BETWEEN vigencia_desde AND COALESCE(vigencia_hasta,'infinity')`,
      [pensionVinc.id, '2092-06-01']);
    assert.equal(pensionHistory.rows[0]?.valor, '1.00'); assert.equal(pensionCurrent.rows[0]?.valor, '0.00');
    const frozenSnapshot = JSON.stringify({ aporta_pension: pensionHistory.rows[0]?.valor === '1.00' });
    await client.query(`UPDATE vinculacion_condiciones_economicas SET valor=0 WHERE vinculacion_id=$1::bigint AND vigencia_desde='2092-01-01'`, [pensionVinc.id]);
    assert.deepEqual(JSON.parse(frozenSnapshot), { aporta_pension: true });
    await client.query('ROLLBACK'); rolledBack = true;

    const after = await counts(client);
    assert.deepEqual(after, before);
    console.log(JSON.stringify({ before, after, fixtures_finales: 0, empresa_a: a, empresa_b: b,
      categoria_a: inserted[0], categoria_b: inserted[1], calculo_a_neto: calcA.neto_nomina,
      calculo_b_neto: calcB.neto_nomina, acceso_cruzado: 'BLOQUEADO', rollback: true }, null, 2));
  } finally {
    if (!rolledBack) await client.query('ROLLBACK').catch(() => undefined);
    client.release(); await dbPool.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
