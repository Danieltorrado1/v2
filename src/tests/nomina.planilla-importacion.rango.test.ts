import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importHarness } from './fixtures/planilla-importacion.synthetic';
import { syntheticAuthEnvironment } from './fixtures/planilla-operativa.authorization.synthetic';
Object.assign(process.env,syntheticAuthEnvironment);

const rangePeriod={start:'2026-09-26',end:'2026-10-25'};
const workers=[{id:1531,employee:'101',link:'81'},{id:1502,employee:'102',link:'82'},{id:1503,employee:'103',link:'83'}];
const trimEdits=(h:Awaited<ReturnType<typeof importHarness>>,file:Buffer)=>h.edit(file,workers.flatMap(w=>['2026-10-10','2026-10-11','2026-10-12'].map(fecha=>({id:w.employee,fecha,value:''}))));

test('MODIFICAR_RANGO agrupa 1531, 1502 y 1503 una vez por novedad y recalcúla con V1 dentro de la transacción',async()=>{
  const h=await importHarness({period:rangePeriod});try{
    for(const w of workers) await h.seedRange({id:w.id,employeeId:w.employee,linkId:w.link,start:'2026-10-08',end:'2026-10-12',days:5});
    const sibling=await h.seed('13','2026-10-07','101','81');
    const file=trimEdits(h,await h.download());
    const preview=await h.preview(file);
    assert.equal(preview.estado,'VISTA_PREVIA');assert.equal(preview.plan?.modificaciones_rango,3);assert.equal(preview.plan?.conflictos,0);assert.ok(preview.token);
    const operations=preview.plan!.filas.filter(r=>r.accion==='MODIFICAR_RANGO');
    assert.equal(operations.length,3);
    for(const w of workers){
      const op=operations.find(r=>r.novedad_id===String(w.id))!;
      assert.deepEqual(op.rango_anterior,{fecha_inicio:'2026-10-08',fecha_fin:'2026-10-12',dias:5});
      assert.deepEqual(op.rango_nuevo,{fecha_inicio:'2026-10-08',fecha_fin:'2026-10-09',dias:2});
      assert.deepEqual(op.sustituir_ids,[String(w.id)]);
    }
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
    const before=(await h.db.query<{id:string;fecha_inicio:string;fecha_fin:string;dias:string}>('SELECT id::text,fecha_inicio::text,fecha_fin::text,dias::text FROM nomina_novedades WHERE id=ANY(ARRAY[1531,1502,1503]) ORDER BY id')).rows;
    assert.deepEqual(before.map(r=>[r.fecha_inicio,r.fecha_fin,Number(r.dias)]),workers.map(()=>['2026-10-08','2026-10-12',5]));

    const applied=await h.confirm(file,preview.token!);
    assert.equal(applied.estado,'APLICADO');assert.equal(applied.resultado?.aplicadas.length,3);
    assert.deepEqual(h.updateCalls.map(c=>[c.id,c.fecha_inicio,c.fecha_fin,c.dias]).sort(),workers.map(w=>[String(w.id),'2026-10-08','2026-10-09',2]).sort());
    const after=(await h.db.query<{id:string;fecha_inicio:string;fecha_fin:string;dias:string}>('SELECT id::text,fecha_inicio::text,fecha_fin::text,dias::text FROM nomina_novedades WHERE id=ANY(ARRAY[1531,1502,1503]) ORDER BY id')).rows;
    assert.deepEqual(after.map(r=>[r.id,r.fecha_inicio,r.fecha_fin,Number(r.dias)]),workers.map(w=>[String(w.id),'2026-10-08','2026-10-09',2]).sort());
    assert.equal((await h.db.query<{id:string;activo:boolean}>('SELECT id::text,activo FROM nomina_novedades WHERE id=$1::bigint',[sibling])).rows[0]!.activo,true);
    const audit=(await h.db.query<{accion:string;anteriores:unknown;nuevos:Record<string,unknown>;fecha:string}>('SELECT accion,anteriores,nuevos,fecha::text FROM nomina_planilla_importacion_operaciones ORDER BY fecha')).rows;
    assert.equal(audit.length,3);assert.ok(audit.every(r=>r.accion==='MODIFICAR_RANGO'));
    for(const row of audit){assert.ok(row.anteriores);assert.equal(row.nuevos.fecha_inicio,'2026-10-08');assert.equal(row.nuevos.fecha_fin,'2026-10-09');assert.equal(Number(row.nuevos.dias),2);}
    assert.equal(h.recalculations.length,3);assert.ok(h.recalculations.every(r=>r.transactional));
    assert.deepEqual(h.recalculations.map(r=>r.nomina_empleado_id).sort(),workers.map(w=>w.employee).sort());
  }finally{await h.close();}
});

test('un rango con hueco produce un solo conflicto para el evento y no propone actualización parcial',async()=>{
  const h=await importHarness({period:rangePeriod});try{
    await h.seedRange({id:1531,start:'2026-10-08',end:'2026-10-12',days:5});
    const file=h.edit(await h.download(),[{id:'101',fecha:'2026-10-09',value:''}]);
    const preview=await h.preview(file);
    const conflicts=preview.plan!.filas.filter(r=>r.accion==='CONFLICTO' && r.novedad_id==='1531');
    assert.equal(conflicts.length,1);assert.equal(conflicts[0]!.motivo,'MODIFICACION_RANGO_NO_CONTIGUA_O_SIN_DIAS_RESTANTES');
    assert.equal(preview.plan!.modificaciones_rango,0);assert.equal(preview.token,null);assert.equal(h.updateCalls.length,0);
  }finally{await h.close();}
});

test('modificar un rango conserva las novedades hermanas y no altera a otras trabajadoras',async()=>{
  const h=await importHarness({period:rangePeriod,count:4});try{
    await h.seedRange({id:1531,employeeId:'101',linkId:'81',start:'2026-10-08',end:'2026-10-12',days:5});
    await h.seedRange({id:1504,employeeId:'1001',linkId:'8001',start:'2026-10-08',end:'2026-10-12',days:5});
    const sibling=await h.seed('13','2026-10-07','101','81');
    const file=h.edit(await h.download(),['2026-10-10','2026-10-11','2026-10-12'].map(fecha=>({id:'101',fecha,value:''})));
    const preview=await h.preview(file);
    assert.equal(preview.plan!.modificaciones_rango,1);assert.equal(preview.plan!.conflictos,0);
    await h.confirm(file,preview.token!);
    const unchanged=(await h.db.query<{fecha_fin:string;dias:string}>('SELECT fecha_fin::text,dias::text FROM nomina_novedades WHERE id=1504')).rows[0]!;
    assert.deepEqual([unchanged.fecha_fin,Number(unchanged.dias)],['2026-10-12',5]);
    assert.equal((await h.db.query<{activo:boolean}>('SELECT activo FROM nomina_novedades WHERE id=$1::bigint',[sibling])).rows[0]!.activo,true);
    assert.deepEqual(h.updateCalls.map(c=>c.id),['1531']);
  }finally{await h.close();}
});

test('un conflicto en cualquier rango bloquea el archivo completo y conserva los tres eventos',async()=>{
  const h=await importHarness({period:rangePeriod});try{
    for(const w of workers) await h.seedRange({id:w.id,employeeId:w.employee,linkId:w.link,start:'2026-10-08',end:'2026-10-12',days:5});
    await h.db.query('INSERT INTO nomina_novedad_documentos VALUES(1,1502)');
    const file=trimEdits(h,await h.download());const preview=await h.preview(file);
    assert.equal(preview.plan!.modificaciones_rango,2);assert.equal(preview.plan!.conflictos,1);assert.equal(preview.token,null);
    const blocked=preview.plan!.filas.filter(r=>r.accion==='CONFLICTO' && r.novedad_id==='1502');
    assert.equal(blocked.length,1);assert.equal(blocked[0]!.motivo,'RANGO_CON_DEPENDENCIA_O_PROCESAMIENTO');
    assert.deepEqual(preview.plan!.filas.filter(r=>r.accion==='MODIFICAR_RANGO').map(r=>r.novedad_id).sort(),['1503','1531']);
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
    const dates=(await h.db.query<{id:string;fecha_fin:string;dias:string}>('SELECT id::text,fecha_fin::text,dias::text FROM nomina_novedades WHERE id=ANY(ARRAY[1531,1502,1503]) ORDER BY id')).rows;
    assert.deepEqual(dates.map(r=>[r.id,r.fecha_fin,Number(r.dias)]),[['1502','2026-10-12',5],['1503','2026-10-12',5],['1531','2026-10-12',5]]);
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
  }finally{await h.close();}
});

test('fallo del recálculo V1 revierte las tres modificaciones, sus auditorías y el recibo del archivo',async()=>{
  const h=await importHarness({period:rangePeriod});try{
    for(const w of workers) await h.seedRange({id:w.id,employeeId:w.employee,linkId:w.link,start:'2026-10-08',end:'2026-10-12',days:5});
    const file=trimEdits(h,await h.download());const preview=await h.preview(file);assert.ok(preview.token);
    h.injectRecalculationFailure(true);
    await assert.rejects(h.confirm(file,preview.token!),error=>{
      assert.equal((error as {code:string}).code,'PLANILLA_IMPORTACION_FALLIDA');
      assert.equal((error as {details:{reporte:{estado:string;aplicadas:number}}}).details.reporte.estado,'REVERTIDO');
      return true;
    });
    const rows=(await h.db.query<{fecha_fin:string;dias:string}>('SELECT fecha_fin::text,dias::text FROM nomina_novedades WHERE id=ANY(ARRAY[1531,1502,1503]) ORDER BY id')).rows;
    assert.deepEqual(rows.map(r=>[r.fecha_fin,Number(r.dias)]),workers.map(()=>['2026-10-12',5]));
    assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
    assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importacion_operaciones')).rows.length,0);
  }finally{await h.close();}
});
