import assert from 'node:assert/strict';
import {test} from 'node:test';
import {importHarness} from './fixtures/planilla-importacion.synthetic';
import {syntheticAuthEnvironment} from './fixtures/planilla-operativa.authorization.synthetic';
Object.assign(process.env,syntheticAuthEnvironment);
const {readUploadedPlanilla,validatePlanillaValues}=require('../modules/nomina/planilla-importacion.xlsx') as typeof import('../modules/nomina/planilla-importacion.xlsx');
const {buildImportPlan}=require('../modules/nomina/planilla-importacion.plan') as typeof import('../modules/nomina/planilla-importacion.plan');

async function fixture(pendingDate='2026-10-05'){
  const h=await importHarness({period:{start:'2026-09-26',end:'2026-10-25'}});
  await h.seedRange({id:3097,start:'2026-10-05',end:'2026-10-12',days:8});
  await h.db.query(`INSERT INTO nomina_asistencia_diaria(id,periodo_id,vinculacion_id,fecha,estado_dia,horas_trabajadas)
    VALUES(26301,71,81,$1::date,'PENDIENTE',0)`,[pendingDate]);
  return h;
}
const trim=(h:Awaited<ReturnType<typeof fixture>>,file:Buffer)=>h.edit(file,
  ['2026-10-10','2026-10-11','2026-10-12'].map(fecha=>({id:'101',fecha,value:''})));

for(const date of ['2026-10-05','2026-10-07'])test(`3097 conserva agregado firmado intacto en ${date}: 8 a 5 dias sin modificar asistencia`,async()=>{
  const h=await fixture(date);try{
    const original=await h.download(),file=trim(h,original),upload=readUploadedPlanilla(file);
    const {snapshot}=await h.loadSnapshot('71',h.tenant());
    const aggregate=validatePlanillaValues(upload,snapshot).find(c=>c.empleado_id==='101'&&c.fecha===date)!;
    assert.equal(aggregate.original,'PENDIENTE + S [DET]');assert.equal(aggregate.valor,aggregate.original);
    const before=(await h.db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY id')).rows;
    const preview=await h.preview(file);
    assert.equal(preview.plan!.conflictos,0);assert.equal(preview.plan!.modificaciones_rango,1);
    const row=preview.plan!.filas.find(r=>r.novedad_id==='3097')!;
    assert.equal(row.accion,'MODIFICAR_RANGO');assert.deepEqual(row.sustituir_ids,['3097']);
    assert.deepEqual(row.rango_anterior,{fecha_inicio:'2026-10-05',fecha_fin:'2026-10-12',dias:8});
    assert.deepEqual(row.rango_nuevo,{fecha_inicio:'2026-10-05',fecha_fin:'2026-10-09',dias:5});
    assert.deepEqual((await h.db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY id')).rows,before);
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
  }finally{await h.close();}
});

test('agregado conservado no elude evidencia, duplicados, eventos, dependencia ni contigüidad',async()=>{
  const h=await fixture();try{
    const upload=readUploadedPlanilla(trim(h,await h.download())),{snapshot}=await h.loadSnapshot('71',h.tenant());
    const cells=validatePlanillaValues(upload,snapshot),permissions=['nomina.novedades.update'];
    const blocked=(current= snapshot,input=cells,book=upload)=>{
      const row=buildImportPlan(book,current,input,permissions).filas.find(r=>r.novedad_id==='3097')!;
      assert.equal(row.accion,'CONFLICTO');
    };
    blocked({...snapshot,asistencias_pendientes_inocuas:[]});
    blocked({...snapshot,asistencias:[...snapshot.asistencias,{...snapshot.asistencias[0]!,id:'99999'}]});
    blocked({...snapshot,asistencias:snapshot.asistencias.map(a=>({...a,estado_dia:'PRESENTE'}))});
    blocked({...snapshot,import_guard:snapshot.import_guard!.map(g=>({...g,novedades_dependientes:['3097']}))});
    blocked({...snapshot,novedades:[...snapshot.novedades,{...snapshot.novedades[0]!,id:'99999'}]});
    blocked(snapshot,cells.map(c=>c.empleado_id==='101'&&c.fecha==='2026-10-07'?{...c,valor:''}:c));
    blocked(snapshot,cells.map(c=>c.empleado_id==='101'&&c.fecha==='2026-10-05'?{...c,valor:'PENDIENTE + S [DET] extra'}:c));
    blocked(snapshot,cells,{...upload,baseline:{...upload.baseline,novedades:upload.baseline.novedades.map(n=>n.id==='3097'?{...n,dias:9}:n)}});
  }finally{await h.close();}
});

test('agregado conservado exige firma original y evidencia actual sin horas',async()=>{
  const h=await fixture();try{
    const file=trim(h,await h.download());
    await assert.rejects(h.preview(h.edit(file,[{sheet:'_Original',address:'G2',value:'S'}])),{code:'PLANILLA_DATO_PROTEGIDO'});
    await h.db.exec('UPDATE nomina_asistencia_diaria SET horas_trabajadas=1 WHERE id=26301');
    const stale=await h.preview(file);assert.equal(stale.token,null);
    assert.ok(stale.plan!.filas.some(r=>r.motivo.startsWith('REGISTROS_CAMBIARON_DESDE_DESCARGA')));
    const fresh=await h.preview(trim(h,await h.download()));assert.equal(fresh.token,null);
    assert.equal(fresh.plan!.filas.find(r=>r.novedad_id==='3097')!.accion,'CONFLICTO');
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
  }finally{await h.close();}
});
