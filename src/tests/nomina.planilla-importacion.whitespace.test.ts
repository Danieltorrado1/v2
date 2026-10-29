import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import * as XLSX from 'xlsx';
import {syntheticSnapshot,syntheticType} from './fixtures/planilla-operativa.synthetic';
import {syntheticAuthEnvironment} from './fixtures/planilla-operativa.authorization.synthetic';
import type {PlanillaSnapshot} from '../modules/nomina/planilla-operativa.xlsx';
Object.assign(process.env,syntheticAuthEnvironment);
const {buildPlanillaOperativaXlsx,planillaBaseline}=require('../modules/nomina/planilla-operativa.xlsx') as typeof import('../modules/nomina/planilla-operativa.xlsx');
const {readUploadedPlanilla,validatePlanillaValues}=require('../modules/nomina/planilla-importacion.xlsx') as typeof import('../modules/nomina/planilla-importacion.xlsx');
const {buildImportPlan}=require('../modules/nomina/planilla-importacion.plan') as typeof import('../modules/nomina/planilla-importacion.plan');
const permissions=['nomina.export','nomina.operativa.read','nomina.novedades.create','nomina.novedades.deactivate','nomina.periodos.update'];

function fixture(protectedDetail=true,historical=false){
 const s=syntheticSnapshot(),worker={...s.trabajadores[0]!,institucion_id:'11',sede_id:'21',modalidad_id:'1',...(historical?{solo_lectura:'historico'}:{})};
 const type=syntheticType('13','DCO');
 const snapshot:PlanillaSnapshot={...s,trabajadores:[worker],asistencias:[],catalogo:[type,syntheticType('14','S',{es_suspension:true})],
  novedades:[{...s.novedades[0]!,nomina_empleado_id:worker.id,valor_manual:null,requiere_cobertura:protectedDetail,
   tipo_novedad:{...type,codigo_operativo_registrado:protectedDetail?'':' DCO '}}],
  import_guard:[{id:worker.id,revision:'a'.repeat(64),bloqueado:false,novedades_dependientes:[]}]};
 const baseline=planillaBaseline(snapshot);
 const signature=createHmac('sha256',syntheticAuthEnvironment.JWT_SECRET).update(JSON.stringify({purpose:'planilla-operativa-export-2A',
  generado_at:snapshot.generado_at,alcance:snapshot.alcance,baseline})).digest('hex');
 const file=buildPlanillaOperativaXlsx(snapshot,signature);
 const analyze=(bytes=file)=>{const upload=readUploadedPlanilla(bytes),cells=validatePlanillaValues(upload,snapshot);
  return {upload,cells,plan:buildImportPlan(upload,snapshot,cells,permissions)};};
 const edit=(sheet:string,address:string,value:unknown,type='s')=>{
  const book=XLSX.read(file,{type:'buffer'});book.Sheets[sheet]![address]={t:type as XLSX.ExcelDataType,v:value as string};
  return XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}) as Buffer;
 };
 return {snapshot,baseline,file,analyze,edit,name:readUploadedPlanilla(file).book.SheetNames[0]!};
}

for(const historical of [false,true])test(`original protegido ' [DET]' no genera conflicto al normalizar bordes; historico=${historical}`,()=>{
 const f=fixture(true,historical),{cells,plan,upload}=f.analyze();
 const cell=cells.find(c=>c.fecha==='2026-10-27')!;
 assert.equal(cell.original,' [DET]');assert.equal(cell.valor,'[DET]');assert.equal(cell.editable,false);
 assert.equal(plan.conflictos,0);assert.equal(plan.sin_cambios,1);
 assert.equal(plan.nuevas+plan.sustituciones+plan.asistencias,0);
 assert.deepEqual(upload.baseline,f.baseline);assert.equal(cell.original,' [DET]');
 const changed=f.analyze(f.edit(f.name,'I7','DCO')).plan;
 assert.equal(changed.conflictos,1);assert.match(changed.filas.find(r=>r.accion==='CONFLICTO')!.motivo,/CONSULTA_PROTEGIDA|CELDA_PROTEGIDA/);
});

test('espacios exteriores se comparan simetricamente sin cambiar el original; cambios reales siguen detectados',()=>{
 const f=fixture(false),before=f.analyze();
 assert.equal(before.cells.find(c=>c.fecha==='2026-10-27')!.original,' DCO ');
 for(const mark of ['DCO','  DCO  ','\tDCO\u00a0']){
  const result=f.analyze(f.edit(f.name,'I7',mark));assert.equal(result.plan.conflictos,0);assert.equal(result.plan.sin_cambios,1);
  assert.equal(result.plan.nuevas+result.plan.sustituciones+result.plan.asistencias,0);
  assert.equal(result.cells.find(c=>c.fecha==='2026-10-27')!.original,' DCO ');
 }
 const changed=f.analyze(f.edit(f.name,'I7','S')).plan;
 assert.ok(changed.nuevas+changed.sustituciones>0);assert.equal(changed.sin_cambios,0);
 for(const mark of ['dco','D CO','DCO\u200b']){
  const changed=f.analyze(f.edit(f.name,'I7',mark)).plan;assert.equal(changed.conflictos,1);assert.equal(changed.sin_cambios,0);
 }
 const empty=f.analyze(f.edit(f.name,'I7','')).plan;
  assert.equal(empty.conflictos,0);assert.equal(empty.nuevas+empty.sustituciones+empty.asistencias,0);assert.equal(empty.retiradas,1);assert.ok(empty.celdas_vacias>0);
});

test('valores no textuales o formulas no eluden controles por equivalencia de texto',()=>{
 const f=fixture(false),{upload,cells}=f.analyze();
 const altered=cells.map(c=>c.fecha==='2026-10-27'?{...c,texto:false}:c);
 const plan=buildImportPlan(upload,f.snapshot,altered,permissions);
 assert.equal(plan.conflictos,1);assert.match(plan.filas.find(r=>r.accion==='CONFLICTO')!.motivo,/CODIGO_NO_TEXTO/);
 const book=XLSX.read(f.file,{type:'buffer'});book.Sheets[f.name]!.I7={t:'s',v:'DCO',f:'"DCO"'};
 assert.throws(()=>readUploadedPlanilla(XLSX.write(book,{type:'buffer',bookType:'xlsx'}) as Buffer));
});

test('firma, originales ocultos, municipio e identidades conservan comparacion estricta incluso por espacios',()=>{
 const f=fixture(false);
 for(const [sheet,address] of [[f.name,'A7'],[f.name,'E7'],[f.name,'F7'],[f.name,'AM7'],['_Original','G3']] as const){
  const current=readUploadedPlanilla(f.file).book.Sheets[sheet]![address]?.v??'';
  assert.throws(()=>f.analyze(f.edit(sheet,address,`${current} `)),{code:'PLANILLA_DATO_PROTEGIDO'});
 }
 const upload=readUploadedPlanilla(f.file),part=String(upload.book.Sheets._Base!.B2!.v);
 assert.throws(()=>readUploadedPlanilla(f.edit('_Base','B2',part.replace('SINT','ALTERADO'))),{code:'PLANILLA_FIRMA_INVALIDA'});
});
