import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePersonalRequirement } from '../modules/documentos/documentos.applicability.domain';
import { buildContextualChecklistSnapshot, type ContextualChecklistRequirementInput, type ContextualChecklistDocumentInput } from '../modules/documentos/documentos.checklist.service';
const codes=['HOJA_VIDA','IDENTIDAD','CERT_BANCARIA','AUT_DATOS','AUT_INHABILIDADES','CONTRATO','EPS','ARL','CAJA','PENSION','EXAMEN_OCUPACIONAL','INDUCCION','DOTACION_HISTORICA','MANIPULACION','ANT_CONTRALORIA','ANT_PROCURADURIA','ANT_JUDICIALES','ANT_MEDIDAS_CORRECTIVAS','ANT_REDAM','ANT_INHABILIDADES','RESIDENCIA','SISBEN','FORMACION','CERT_LABORAL','VACUNACION','TARJETA_PROFESIONAL','ANTECEDENTES_PROFESIONALES'];
function requirements(cotiza:boolean|null=true,cargo='MANIPULADOR(A) DE ALIMENTOS'):ContextualChecklistRequirementInput[]{
 return codes.map((codigo,index)=>({id:index+1,codigo,nombre_requisito:codigo,nombre_documento:codigo,tipo_documento_id:index+1,tipo_documento_ids:codigo==='MANIPULACION'?[14,114]:[index+1],componentes:codigo==='MANIPULACION'?{'14':'CURSO','114':'EXAMENES'}:undefined,ambito_documental:'PERSONA',contrato_cargo_id:null,tipo_vinculacion_id:null,requiere_fecha_expedicion:false,requiere_fecha_vencimiento:false,dias_proximo_vencimiento:30,vigencia_meses:null,...resolvePersonalRequirement(codigo,'CONDICIONAL',null,cotiza,cargo)}));
}
const doc=(type:number,state='APROBADO',extra:Partial<ContextualChecklistDocumentInput>={}):ContextualChecklistDocumentInput=>({id:type,tipo_documento_id:type,tipo_documento_nombre:'Soporte',nombre_original:'soporte.pdf',activo:true,fecha_carga:'2026-09-21',fecha_expedicion:'2026-08-01',fecha_vencimiento:null,estado_revision:state,...extra});
const snapshot=(reqs=requirements(),docs:ContextualChecklistDocumentInput[]=[],vinc:ContextualChecklistDocumentInput[]=[])=>buildContextualChecklistSnapshot({requirements:reqs,personaDocuments:docs,vinculacionDocuments:vinc,contratoCargoId:1,contratoId:1,personaId:1,vinculacionId:1,todayIso:'2026-09-21'});

test('A: manipuladora con pensión tiene exactamente las veinte obligaciones de referencia',()=>{
 const result=snapshot();assert.equal(result.exigibles,20);assert.deepEqual(result.requisitos.filter(r=>r.obligatorio).map(r=>r.codigo),codes.slice(0,20));assert.equal(result.cumplidos,0);
});
test('B: sin pensión sale exclusivamente Pensión; NULL mantiene obligación',()=>{
 const withPension=snapshot();const without=snapshot(requirements(false));assert.equal(without.exigibles,19);
 assert.deepEqual(without.requisitos.filter(r=>r.estado_detallado==='NO_APLICA').map(r=>r.codigo),['PENSION']);
 assert.deepEqual(withPension.requisitos.filter(r=>r.codigo!=='PENSION'),without.requisitos.filter(r=>r.codigo!=='PENSION'));
 assert.equal(snapshot(requirements(null)).exigibles,20);
});
test('C: administrativo excluye Manipulación y mantiene seis antecedentes obligatorios',()=>{
 const result=snapshot(requirements(true,'ADMINISTRATIVO'));assert.equal(result.exigibles,19);assert.equal(result.requisitos.find(r=>r.codigo==='MANIPULACION')?.estado_detallado,'NO_APLICA');
 assert.equal(result.requisitos.filter(r=>r.codigo?.startsWith('ANT_')&&r.obligatorio).length,6);
});
for(const code of codes.slice(0,20).filter(c=>c!=='MANIPULACION'))test(`D–K: ${code} ausente es SIN_DOCUMENTO y exigible`,()=>{
 const item=snapshot().requisitos.find(r=>r.codigo===code)!;assert.equal(item.aplica,true);assert.equal(item.obligatorio,true);assert.equal(item.estado_detallado,'SIN_DOCUMENTO');assert.equal(item.cuenta_cumplimiento,true);assert.equal(item.cuenta_numerador,false);
});
for(const code of ['RESIDENCIA','SISBEN','FORMACION','CERT_LABORAL','VACUNACION'])test(`L–O: ${code} aplicable sin archivo no afecta porcentaje`,()=>{
 const reqs=requirements();const index=codes.indexOf(code)+1;const empty=snapshot(reqs);const loaded=snapshot(reqs,[doc(index)]);
 const item=empty.requisitos.find(r=>r.codigo===code)!;assert.equal(item.aplica,true);assert.equal(item.obligatorio,false);assert.equal(item.estado_detallado,'SIN_DOCUMENTO');assert.equal(item.cuenta_cumplimiento,false);assert.equal(empty.cumplimiento_porcentaje,loaded.cumplimiento_porcentaje);
 assert.equal(item.tipo_requisito,['FORMACION','CERT_LABORAL'].includes(code)?'ACREDITABLE':'OPCIONAL');
});
test('P/Q/R: pendiente, rechazado y vencido no suman; aprobado y por vencer sí',()=>{
 const req=requirements().filter(r=>r.codigo==='ANT_CONTRALORIA');
 for(const [state,emission,expected] of [['PENDIENTE_REVISION','2026-08-01',0],['RECHAZADO','2026-08-01',0],['APROBADO','2026-01-01',0],['APROBADO','2026-06-01',100],['APROBADO','2026-08-01',100]] as const){
  const result=snapshot(req,[doc(15,state,{fecha_expedicion:emission})]);assert.equal(result.cumplimiento_porcentaje,expected);
  assert.equal(result.exigibles,1);assert.equal(result.cumplidos,expected?1:0);
 }
});
test('S/T: combinado y separado cuentan una vez; un componente faltante nunca aprueba',()=>{
 const req=requirements().filter(r=>r.codigo==='MANIPULACION');
 assert.equal(snapshot(req,[doc(14)]).cumplidos,0);
 for(const docs of [[doc(14),doc(114)],[doc(14,'APROBADO',{metadatos_revision:{manipulacion_modalidad:'COMBINADO',componentes:['CURSO','EXAMENES']}})]]){
  const result=snapshot(req,docs);assert.equal(result.exigibles,1);assert.equal(result.cumplidos,1);
 }
});
test('legacy MANIPULACION general aprobado cubre Curso y Exámenes como combinado',()=>{
 const req=requirements().filter(r=>r.codigo==='MANIPULACION').map(r=>({...r,tipo_documento_ids:[14,114,99]}));
 const result=snapshot(req,[doc(99,'APROBADO')]);
 assert.equal(result.exigibles,1);
 assert.equal(result.cumplidos,1);
 assert.equal(result.requisitos[0]?.estado_detallado,'APROBADO');
 assert.deepEqual(result.requisitos[0]?.componentes_documentales?.map(c=>[c.codigo,c.documento_id,c.estado]),[['CURSO',99,'APROBADO'],['EXAMENES',99,'APROBADO']]);
});
test('legacy con solo Curso o solo Exámenes queda incompleto',()=>{
 const req=requirements().filter(r=>r.codigo==='MANIPULACION').map(r=>({...r,tipo_documento_ids:[14,114,99]}));
 assert.equal(snapshot(req,[doc(14,'APROBADO')]).requisitos[0]?.estado_detallado,'PARCIAL');
 assert.equal(snapshot(req,[doc(114,'APROBADO')]).requisitos[0]?.estado_detallado,'PARCIAL');
});
test('U: identidad Cédula/PPT y aliases repetidos no duplican obligación ni pierden cobertura',()=>{
 const req=requirements().filter(r=>r.codigo==='IDENTIDAD')[0]!;
 const result=snapshot([req,{...req,id:100,tipo_documento_id:100,tipo_documento_ids:[100]}],[doc(2)]);
 assert.equal(result.exigibles,1);assert.equal(result.cumplidos,1);assert.deepEqual(result.requisitos[0]?.tipo_documento_ids,[2,100]);
});
test('15 de 20 es 75%; opcionales e historial no cambian numerador ni denominador',()=>{
 const reqs=requirements();const docs=codes.slice(0,16).filter(c=>c!=='MANIPULACION').map(c=>doc(codes.indexOf(c)+1));
 const base=snapshot(reqs,docs);assert.equal(base.cumplimiento_porcentaje,75);
 const extra={...reqs[0]!,id:999,codigo:'NOMINA_GENERADA',tipo_documento_id:999,tipo_documento_ids:[999],tipo_requisito:'SYSTEM_GENERATED',obligatorio:true};
 const result=snapshot([...reqs,extra],[...docs,doc(21),doc(22),doc(23),doc(24),doc(999)]);assert.equal(result.exigibles,20);assert.equal(result.cumplidos,15);assert.equal(result.cumplimiento_porcentaje,75);
});
test('Dotación: un acta aprobada, directa o asociada a entrega, satisface una obligación',()=>{
 const req=requirements().filter(r=>r.codigo==='DOTACION_HISTORICA');
 for(const docs of [[doc(13)],[doc(901,'APROBADO',{dotacion_evidencia:true})],[doc(901,'APROBADO',{dotacion_evidencia:true}),doc(902,'PENDIENTE_REVISION',{dotacion_evidencia:true})]]){
  const result=snapshot(req,docs);assert.equal(result.exigibles,1);assert.equal(result.cumplidos,1);
 }
 assert.equal(snapshot(req,[doc(901,'APROBADO')]).cumplidos,0,'archivo no asociado no acredita Dotación');
 assert.equal(snapshot(req,[],[doc(13)]).requisitos[0]?.fuente_documento,'VINCULACION');
 assert.equal(snapshot(req,[doc(13,'PENDIENTE_REVISION')]).cumplidos,0);
});
test('condiciones profesionales y vacunación usan reglas, nunca existencia de archivo',()=>{
 for(const code of ['TARJETA_PROFESIONAL','ANTECEDENTES_PROFESIONALES','VACUNACION']){
  assert.equal(resolvePersonalRequirement(code,'CONDICIONAL',true,true,'PROFESIONAL',true).obligatorio,true);
  assert.equal(resolvePersonalRequirement(code,'CONDICIONAL',true,true,'PROFESIONAL',false).obligatorio,false);
  assert.equal(resolvePersonalRequirement(code,'CONDICIONAL',false,true,'PROFESIONAL').aplica,false);
  assert.equal(resolvePersonalRequirement(code,'CONDICIONAL',null,true,'ADMINISTRATIVO').aplica,true);
 }
});
