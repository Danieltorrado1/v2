import assert from 'node:assert/strict';
import { test } from 'node:test';
import { importHarness } from './fixtures/planilla-importacion.synthetic';
import { syntheticAuthEnvironment } from './fixtures/planilla-operativa.authorization.synthetic';
import { isInnocuousPendingAttendance } from '../modules/nomina/planilla-importacion.asistencia';
import type { ImportPlanRow } from '../modules/nomina/planilla-importacion.plan';
Object.assign(process.env, syntheticAuthEnvironment);
const { readUploadedPlanilla, validatePlanillaValues } = require('../modules/nomina/planilla-importacion.xlsx') as typeof import('../modules/nomina/planilla-importacion.xlsx');
const { buildImportPlan } = require('../modules/nomina/planilla-importacion.plan') as typeof import('../modules/nomina/planilla-importacion.plan');
const { planillaBaseline } = require('../modules/nomina/planilla-operativa.xlsx') as typeof import('../modules/nomina/planilla-operativa.xlsx');
const workers = [{id:1516,employee:'101',link:'81'}, {id:1514,employee:'102',link:'82'}, {id:1511,employee:'103',link:'83'}, {id:1510,employee:'1001',link:'8001'}];
async function fixture() {
  const h = await importHarness({count:4,period:{start:'2026-09-26',end:'2026-10-25'}});
  for (const w of workers) {
    await h.seedRange({id:w.id,employeeId:w.employee,linkId:w.link,start:'2026-10-05',end:'2026-10-12',days:8});
    await h.db.query(`INSERT INTO nomina_asistencia_diaria(periodo_id,vinculacion_id,fecha,estado_dia,horas_trabajadas)
      SELECT 71,$1::bigint,day,'PENDIENTE',0 FROM generate_series('2026-10-05'::date,'2026-10-09'::date,'1 day') day`,[w.link]);
  }
  return h;
}
const edits = (valueForRetained='S') => workers.flatMap(w => Array.from({length:8},(_,i)=>({id:w.employee,fecha:`2026-10-${String(i+5).padStart(2,'0')}`,value:i<5?valueForRetained:''})));
const downloadEdits = async(h:Awaited<ReturnType<typeof fixture>>, value='S') => h.edit(await h.download(),edits(value));

test('clasificador de evidencia actual: PENDIENTE no implica inocuidad', () => {
  const base = {activo:true,estado_dia:'PENDIENTE',hora_ingreso:null,hora_salida:null,horas_trabajadas:'0.00'};
  assert.equal(isInnocuousPendingAttendance(base),true);
  assert.equal(isInnocuousPendingAttendance({...base,horas_trabajadas:null}),true);
  for (const patch of [{activo:false},{activo:null},{estado_dia:'PRESENTE'},{estado_dia:'AUSENTE'},{estado_dia:null},
    {hora_ingreso:'08:00'},{hora_salida:'12:00'},{horas_trabajadas:'1.00'},{horas_trabajadas:'-1'},
    {horas_trabajadas:undefined},{hora_ingreso:undefined},{hora_salida:undefined},{horas_trabajadas:''}]) {
    assert.equal(isInnocuousPendingAttendance({...base,...patch}),false,JSON.stringify(patch));
  }
});

test('1516/1514/1511/1510: cuatro MODIFICAR_RANGO por ID, originales agregados firmados y pendientes intactos',async()=>{
  const h=await fixture();try {
    const original=await h.download(), upload=readUploadedPlanilla(original);
    assert.equal(upload.baseline.version,'EMPIRIA-V1-OPERATIVA-2A.6-IMPORT');
    assert.equal(Object.hasOwn(upload.baseline,'asistencias_pendientes_inocuas'),false);
    const {snapshot}=await h.loadSnapshot('71',h.tenant());
    assert.deepEqual(planillaBaseline({...snapshot,asistencias_pendientes_inocuas:undefined}),planillaBaseline(snapshot));
    const before=await h.db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY id');
    const preview=await h.preview(h.edit(original,edits()));
    assert.equal(preview.estado,'VISTA_PREVIA');assert.equal(preview.plan!.conflictos,0);assert.equal(preview.plan!.modificaciones_rango,4);assert.ok(preview.token);
    for(const w of workers){
      const rows: ImportPlanRow[]=preview.plan!.filas.filter(r=>r.novedad_id===String(w.id));assert.equal(rows.length,1);
      assert.equal(rows[0]!.accion,'MODIFICAR_RANGO');assert.deepEqual(rows[0]!.sustituir_ids,[String(w.id)]);
      assert.deepEqual(rows[0]!.rango_anterior,{fecha_inicio:'2026-10-05',fecha_fin:'2026-10-12',dias:8});
      assert.deepEqual(rows[0]!.rango_nuevo,{fecha_inicio:'2026-10-05',fecha_fin:'2026-10-09',dias:5});
    }
    assert.deepEqual((await h.db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY id')).rows,before.rows);
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
    assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
  }finally{await h.close();}
});

for(const [label,assignment] of [
  ['PRESENTE',"estado_dia='PRESENTE'"], ['estado incompatible',"estado_dia='AUSENTE'"],
  ['horas efectivas',"horas_trabajadas=1"], ['entrada',"hora_ingreso='08:00'"], ['salida',"hora_salida='12:00'"]
])test(`un ${label} real conserva el conflicto y bloquea el archivo completo`,async()=>{
  const h=await fixture();try{
    await h.db.exec(`UPDATE nomina_asistencia_diaria SET ${assignment} WHERE vinculacion_id=81 AND fecha='2026-10-05'`);
    const preview=await h.preview(await downloadEdits(h));
    assert.equal(preview.plan!.conflictos,1);assert.equal(preview.plan!.modificaciones_rango,3);assert.equal(preview.token,null);
    const conflict=preview.plan!.filas.find(r=>r.novedad_id==='1516')!;assert.equal(conflict.accion,'CONFLICTO');
    assert.equal(conflict.motivo,'RANGO_CON_EVENTO_O_ASISTENCIA_CONCURRENTE');
    assert.equal(h.updateCalls.length,0);assert.equal(h.recalculations.length,0);
    assert.ok((await h.db.query<{dias:string}>('SELECT dias FROM nomina_novedades')).rows.every(r=>Number(r.dias)===8));
  }finally{await h.close();}
});

test('asistencia efectiva en dias retirados tambien sigue bloqueando',async()=>{
  const h=await fixture();try{
    await h.db.exec("INSERT INTO nomina_asistencia_diaria(periodo_id,vinculacion_id,fecha,estado_dia) VALUES(71,81,'2026-10-10','PRESENTE')");
    const preview=await h.preview(await downloadEdits(h));assert.equal(preview.plan!.conflictos,1);assert.equal(preview.token,null);
    assert.equal(preview.plan!.filas.find(r=>r.novedad_id==='1516')!.accion,'CONFLICTO');
  }finally{await h.close();}
});

for(const dependency of ['nomina_novedad_turnos','nomina_novedad_documentos','nomina_novedad_coberturas'])test(`mantiene dependencia ${dependency}`,async()=>{
  const h=await fixture();try{
    await h.db.query(`INSERT INTO ${dependency} VALUES(1,1516)`);
    const preview=await h.preview(await downloadEdits(h));assert.equal(preview.plan!.conflictos,1);assert.equal(preview.token,null);
    assert.equal(preview.plan!.filas.find(r=>r.novedad_id==='1516')!.motivo,'RANGO_CON_DEPENDENCIA_O_PROCESAMIENTO');
  }finally{await h.close();}
});

test('otra novedad conserva conflicto aunque haya PENDIENTE inocuo',async()=>{
  const h=await fixture();try{
    await h.seed('13','2026-10-05');
    const preview=await h.preview(await downloadEdits(h));assert.equal(preview.plan!.conflictos,1);assert.equal(preview.token,null);
  }finally{await h.close();}
});

test('sin evidencia actual, con duplicados o con IDs distintos se rechaza aun con firma valida',async()=>{
  const h=await fixture();try{
    const file=await downloadEdits(h), upload=readUploadedPlanilla(file), {snapshot}=await h.loadSnapshot('71',h.tenant());
    const cells=validatePlanillaValues(upload,snapshot);
    const permissions=['nomina.novedades.update'];
    const missing=buildImportPlan(upload,{...snapshot,asistencias_pendientes_inocuas:undefined},cells,permissions);
    assert.equal(missing.conflictos,4);
    const first=snapshot.asistencias.find(a=>a.vinculacion_id==='81')!;
    const duplicate=buildImportPlan(upload,{...snapshot,asistencias:[...snapshot.asistencias,{...first,id:'99999'}]},cells,permissions);
    assert.equal(duplicate.conflictos,1);
    const replaced=buildImportPlan(upload,{...snapshot,asistencias:snapshot.asistencias.map(a=>a.id===first.id?{...a,id:'99999'}:a),asistencias_pendientes_inocuas:[...snapshot.asistencias_pendientes_inocuas!,'99999']},cells,permissions);
    assert.equal(replaced.conflictos,1);
    const withoutPermission=buildImportPlan(upload,snapshot,cells,[]);assert.equal(withoutPermission.conflictos,4);
  }finally{await h.close();}
});

test('version nueva, periodo cerrado y manipulacion del original permanecen bloqueados',async()=>{
  const h=await fixture();try{
    const file=await downloadEdits(h);
    const upload=readUploadedPlanilla(file),{snapshot}=await h.loadSnapshot('71',h.tenant());
    const tampered=h.edit(file,[{sheet:'_Original',address:'G2',value:'S'}]);
    await assert.rejects(h.preview(tampered),{code:'PLANILLA_DATO_PROTEGIDO'});
    await h.db.exec("UPDATE nomina_asistencia_diaria SET horas_trabajadas=1 WHERE vinculacion_id=81 AND fecha='2026-10-05'");
    const stale=await h.preview(file);assert.ok(stale.plan!.filas.some(r=>r.motivo.startsWith('REGISTROS_CAMBIARON_DESDE_DESCARGA')));assert.equal(stale.token,null);
    const closed=buildImportPlan(upload,{...snapshot,periodo:{...snapshot.periodo,estado:'CERRADO'}},validatePlanillaValues(upload,snapshot),['nomina.novedades.update']);
    assert.equal(closed.conflictos,4);
  }finally{await h.close();}
});

test('RETIRAR_RANGO no hereda la nueva excepcion de pendientes',async()=>{
  const h=await fixture();try{
    const preview=await h.preview(await downloadEdits(h,''));assert.equal(preview.plan!.retiradas,0);assert.equal(preview.plan!.conflictos,4);assert.equal(preview.token,null);
  }finally{await h.close();}
});

test('otra novedad en dias retirados conserva el bloqueo',async()=>{
  const h=await fixture();try{
    await h.seed('13','2026-10-10');
    const preview=await h.preview(await downloadEdits(h));
    assert.equal(preview.plan!.conflictos,1);assert.equal(preview.token,null);
    assert.equal(preview.plan!.filas.find(r=>r.novedad_id==='1516')!.motivo,'RANGO_CON_EVENTO_O_ASISTENCIA_CONCURRENTE');
  }finally{await h.close();}
});

test('la excepcion exige exactamente el agregado firmado y un unico evento original',async()=>{
  const h=await fixture();try{
    const upload=readUploadedPlanilla(await downloadEdits(h)),{snapshot}=await h.loadSnapshot('71',h.tenant());
    const cells=validatePlanillaValues(upload,snapshot),permissions=['nomina.novedades.update'];
    for(const original of ['PENDIENTE + S [DET] extra','PRESENTE + S [DET]','S [DET]']){
      const changed=cells.map(c=>c.empleado_id==='101' && c.fecha==='2026-10-05'?{...c,original}:c);
      assert.equal(buildImportPlan(upload,snapshot,changed,permissions).conflictos,1);
    }
    const base=upload.baseline.novedades.find(n=>n.id==='1516')!;
    const ambiguous={...upload,baseline:{...upload.baseline,novedades:[...upload.baseline.novedades,{...base,id:'99999'}]}};
    const rejected=buildImportPlan(ambiguous,snapshot,cells,permissions);
    assert.equal(rejected.conflictos,2);
    assert.ok(rejected.filas.filter(r=>['1516','99999'].includes(r.novedad_id??'')).every(r=>r.accion==='CONFLICTO'));
  }finally{await h.close();}
});

for(const fail of [false,true])test(`transaccion sintetica con pendientes: ${fail?'fallo de recálculo revierte lote':'conserva IDs, pendientes y auditoria'}`,async()=>{
  const h=await fixture();try{
    const file=await downloadEdits(h),preview=await h.preview(file);
    const before=(await h.db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY id')).rows;
    h.injectRecalculationFailure(fail);
    if(fail){
      await assert.rejects(h.confirm(file,preview.token!));
      assert.ok((await h.db.query<{dias:string}>('SELECT dias FROM nomina_novedades')).rows.every(r=>Number(r.dias)===8));
      assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importacion_operaciones')).rows.length,0);
      assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length,0);
    }else{
      assert.equal((await h.confirm(file,preview.token!)).estado,'APLICADO');
      assert.deepEqual(h.updateCalls.map(c=>[c.id,c.fecha_inicio,c.fecha_fin,c.dias]).sort(),
        workers.map(w=>[String(w.id),'2026-10-05','2026-10-09',5]).sort());
      assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importacion_operaciones')).rows.length,4);
      assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length,1);
      assert.equal(h.recalculations.length,4);assert.ok(h.recalculations.every(r=>r.transactional));
    }
    assert.deepEqual((await h.db.query('SELECT * FROM nomina_asistencia_diaria ORDER BY id')).rows,before);
  }finally{await h.close();}
});
