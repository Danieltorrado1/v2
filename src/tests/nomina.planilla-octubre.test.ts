import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createHmac} from 'node:crypto';
import * as XLSX from 'xlsx';
import {municipalAuthorizationDatabase,syntheticAuthEnvironment} from './fixtures/planilla-operativa.authorization.synthetic';
import {syntheticSnapshot} from './fixtures/planilla-operativa.synthetic';
import {buildPlanillaOperativaXlsx,planillaBaseline} from '../modules/nomina/planilla-operativa.xlsx';
Object.assign(process.env,syntheticAuthEnvironment);
const {resolvePlanillaAuthorizedContexts}=require('../modules/nomina/planilla-operativa.scope') as typeof import('../modules/nomina/planilla-operativa.scope');
const {readUploadedPlanilla,validatePlanillaValues}=require('../modules/nomina/planilla-importacion.xlsx') as typeof import('../modules/nomina/planilla-importacion.xlsx');
const {buildImportPlan}=require('../modules/nomina/planilla-importacion.plan') as typeof import('../modules/nomina/planilla-importacion.plan');

test('octubre: vinculacion historica prima sobre activo hoy; contractual exige administrador, contrato explicito y los municipios asignados',async()=>{
 const db=await municipalAuthorizationDatabase();try{
  await db.exec(`INSERT INTO contrato_cargos VALUES(2,'ADMINISTRATIVO');
   INSERT INTO vinculaciones(id,contrato_id,empresa_id,contrato_cargo_id,fecha_inicio) VALUES(85,51,41,2,'2026-08-01'),(86,52,42,2,'2026-08-01');
   INSERT INTO nomina_empleados VALUES(105,71,85,true),(106,71,86,true);
   UPDATE vinculaciones SET fecha_fin='2026-09-30' WHERE id=83;
   UPDATE nomina_empleados SET activo=false WHERE id=103;
   UPDATE vinculaciones SET fecha_fin='2026-09-20' WHERE id=81;
   UPDATE nomina_empleados SET activo=false WHERE id=101;`);
  const period={id:'71',contrato_id:'51',contrato_empresa_id:'41',fecha_inicio:'2026-09-26',fecha_fin:'2026-10-25'};
  const resolve=(id:number)=>resolvePlanillaAuthorizedContexts(db as any,id,period);
  const base=await resolve(3);
  assert.ok(base.contexts.has('103'));assert.equal(base.contexts.get('103')!.historico,true);
  assert.ok(!base.contexts.has('101'));assert.ok(!base.contexts.has('105'));assert.ok(!base.contexts.has('106'));
  await db.exec("INSERT INTO nomina_responsabilidades_usuario VALUES(32,3,41,51,'COBERTURA',true); INSERT INTO nomina_responsabilidad_municipios VALUES(32,1)");
  assert.ok(!(await resolve(3)).contexts.has('105'));
  await db.exec('INSERT INTO nomina_responsabilidad_municipios VALUES(32,2)');
  const full=await resolve(3);assert.equal(full.contexts.get('105')!.tipo_contexto,'CONTRACTUAL');assert.equal(full.contexts.get('105')!.municipio_id,'');
  assert.ok(!full.contexts.has('106'));
  await db.exec('INSERT INTO usuario_empresas VALUES(3,41,true); UPDATE usuario_contratos SET activo=false WHERE usuario_id=3');
  assert.ok(!(await resolve(3)).contexts.has('105'));
  await db.exec('UPDATE usuario_contratos SET activo=true WHERE usuario_id=3');
  await db.exec('UPDATE nomina_responsabilidades_usuario SET activo=false WHERE id=32');
  assert.ok(!(await resolve(3)).contexts.has('105'));
 }finally{await db.close();}
});

test('2A.6: originales privados permanecen en servidor; XLSX completo sin identidades ajenas y cambios protegidos no autorizan sustituciones',()=>{
 const s=syntheticSnapshot();s.periodo.fecha_inicio='2026-09-26';s.periodo.fecha_fin='2026-10-25';s.periodo.nombre='OCTUBRE';
 s.asistencias=[];s.novedades=s.novedades.slice(0,1);
 const event=s.novedades[0]!;event.fecha_inicio=event.fecha_fin='2026-09-28';event.observacion='TERCERO_SECRETO 999991111';
 event.cobertura={...event.cobertura,id:'901',tipo_cobertura:'PERSONA_INTERNA',persona_cubre_id:'999991111',vinculacion_cubre_id:'999992222',nombre_externo:'TERCERO_SECRETO',documento_externo:'999993333'} as any;
 const worker={...s.trabajadores[0]!,institucion_id:'11',sede_id:'21',modalidad_id:'1'};
 s.trabajadores=[worker,{...worker,id:'910',vinculacion_id:'920',persona_id:'930',nombre:'Administrativa sintetica',tipo_contexto:'CONTRACTUAL',solo_lectura:'Sin contexto municipal',municipio:'',municipio_id:'',institucion:'',institucion_id:'',sede:'',sede_id:'',modalidad:'',modalidad_id:''},
 {...worker,id:'911',vinculacion_id:'921',persona_id:'931',nombre:'Retirada sintetica',fecha_fin:'2026-09-30',solo_lectura:'Registro historico inactivo'}];
 s.import_guard=s.trabajadores.map(w=>({id:w.id,revision:'a'.repeat(64),bloqueado:false,novedades_dependientes:w.id===worker.id?[event.id]:[]}));
 const before=JSON.stringify(s.novedades);
 const base=planillaBaseline(s);assert.equal(base.novedades[0]!.detalle_restringido,true);assert.equal(base.novedades[0]!.persona_cubre_id,null);
 const signature=createHmac('sha256','test-only').update(JSON.stringify({purpose:'planilla-operativa-export-2A',generado_at:s.generado_at,alcance:s.alcance,baseline:base})).digest('hex');
 const bytes=buildPlanillaOperativaXlsx(s,signature);const upload=readUploadedPlanilla(bytes);const cells=validatePlanillaValues(upload,s);
 assert.equal(upload.baseline.version,'EMPIRIA-V1-OPERATIVA-2A.6-IMPORT');assert.equal(cells.length,90);
 assert.ok(upload.book.SheetNames.includes('Personal contrato'));
 const zip=XLSX.CFB.read(bytes,{type:'buffer'});const text=zip.FileIndex.map((f:any)=>f.content?Buffer.from(f.content).toString():'').join('');
 assert.doesNotMatch(text,/TERCERO_SECRETO|999991111|999992222|999993333/);
 const protectedCell=cells.find(c=>c.empleado_id===worker.id&&c.fecha==='2026-09-28')!;assert.equal(protectedCell.editable,false);assert.match(protectedCell.original,/\[DET\]/);
 assert.equal(cells.filter(c=>c.empleado_id==='910'&&c.editable).length,0);
 const changes=cells.map(c=>c.empleado_id==='910'&&c.fecha==='2026-09-29' || c.empleado_id==='911'&&c.fecha==='2026-09-29'
   ? {...c,valor:'PRESENTE'} : c.empleado_id===worker.id&&c.fecha==='2026-09-28' ? {...c,valor:'DCO'} : c);
 const plan=buildImportPlan(upload,s,changes,['nomina.periodos.update','nomina.novedades.create','nomina.novedades.deactivate']);
 assert.equal(plan.conflictos,3);assert.equal(plan.nuevas,0);assert.equal(plan.sustituciones,0);assert.equal(plan.asistencias,0);
 assert.match(plan.filas.find(r=>r.accion==='CONFLICTO'&&r.empleado_id==='910')!.motivo,/CONSULTA_PROTEGIDA/);
 assert.equal(JSON.stringify(s.novedades),before);
});
