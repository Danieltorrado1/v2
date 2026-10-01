import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { projectInternalTurnEmployees } from '../modules/nomina/nomina.turn-projection';

test('turnos históricos 92,93,49,94 usan vínculo estable y no modifican identidad/contexto original', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE contratos(id bigint,empresa_id bigint);
      CREATE TABLE nomina_periodos(id bigint,contrato_id bigint);
      CREATE TABLE vinculaciones(id bigint,contrato_id bigint,empresa_id bigint,persona_id bigint);
      CREATE TABLE nomina_empleados(id bigint,periodo_id bigint,vinculacion_id bigint);
      INSERT INTO contratos VALUES (24,15),(25,16);
      INSERT INTO nomina_periodos VALUES (2,24),(3,24),(4,25);
      INSERT INTO vinculaciones VALUES (860,24,15,1),(864,24,15,2),(1380,24,15,3),(999,25,16,4);
      INSERT INTO nomina_empleados VALUES (80,2,860),(84,2,864),(600,2,1380),
        (849,3,860),(853,3,864),(1348,3,1380),(9999,3,999);
    `);
    const executor = {query: async (sql:string,params?:unknown[]) => {
      assert.match(sql,/^\s*SELECT/);
      return db.query(sql,params);
    }} as any;
    const rows = [
      {id:'92',vinculacion_id:'860',nomina_empleado_id:'80',fecha:'2026-08-26',modalidad:'RI'},
      {id:'93',vinculacion_id:'864',nomina_empleado_id:'84',fecha:'2026-08-27',modalidad:'RI'},
      {id:'49',vinculacion_id:'1380',nomina_empleado_id:'600',fecha:'2026-08-27',modalidad:'CAARES'},
      {id:'94',vinculacion_id:'860',nomina_empleado_id:'80',fecha:'2026-08-31',modalidad:'RI'},
    ].map(row=>({...row,tipo_turno:'INTERNO'}));
    const before=structuredClone(rows);
    const projected=await projectInternalTurnEmployees(rows,'3',executor);
    assert.deepEqual(projected.map(row=>row.nomina_empleado_id),['849','853','1348','849']);
    assert.equal(new Set(projected.map(row=>row.id)).size,4);
    assert.deepEqual(rows,before);
    for(const [index,row] of projected.entries()){
      assert.equal(row.vinculacion_id,rows[index]!.vinculacion_id);
      assert.equal(row.nomina_empleado_origen_id,rows[index]!.nomina_empleado_id);
      assert.equal(row.modalidad,rows[index]!.modalidad);
      assert.equal(row.fecha,rows[index]!.fecha);
    }
    // Linked movement must project identically to avoid counting it twice.
    const movement=(await projectInternalTurnEmployees([{
      id:'38',nomina_empleado_id:'600',vinculacion_id:'1380',tipo_movimiento:'TURNO_INTERNO',
      fecha:'2026-08-27',activo:true,estado:'APROBADO',contexto_operativo:{modalidad:'CAARES'},
    }],'3',executor))[0]!;
    assert.equal(movement.nomina_empleado_id,'1348');
    const missing=(await projectInternalTurnEmployees([{id:'5',vinculacion_id:'777',nomina_empleado_id:'80',tipo_turno:'INTERNO'}],'3',executor))[0]!;
    assert.equal(missing.nomina_empleado_id,null);
    assert.equal(missing.estado_proyeccion,'SIN_EMPLEADO_DESTINO');
    const otherTenant=(await projectInternalTurnEmployees([{id:'6',vinculacion_id:'999',nomina_empleado_id:'80',tipo_turno:'INTERNO'}],'3',executor))[0]!;
    assert.equal(otherTenant.nomina_empleado_id,null);
    await db.exec('INSERT INTO nomina_empleados VALUES (850,3,860)');
    const ambiguous=(await projectInternalTurnEmployees([rows[0]!],'3',executor))[0]!;
    assert.equal(ambiguous.nomina_empleado_id,null);
    assert.equal(ambiguous.estado_proyeccion,'EMPLEADO_DESTINO_AMBIGUO');
    const external={id:'7',vinculacion_id:'860',nomina_empleado_id:'80',tipo_turno:'EXTERNO'};
    assert.strictEqual((await projectInternalTurnEmployees([external],'3',executor))[0],external);
    assert.deepEqual((await db.query('SELECT id,periodo_id,vinculacion_id FROM nomina_empleados WHERE periodo_id=2 ORDER BY id')).rows,
      [{id:80,periodo_id:2,vinculacion_id:860},{id:84,periodo_id:2,vinculacion_id:864},{id:600,periodo_id:2,vinculacion_id:1380}]);
  } finally { await db.close(); }
});
