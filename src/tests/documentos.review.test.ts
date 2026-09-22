import test from 'node:test';
import assert from 'node:assert/strict';
import { documentPolicy, normalizeDocumentMetadata, documentState, experienceDays, addCalendarMonths } from '../modules/documentos/documentos.review.domain';
import { buildContextualChecklistSnapshot, type ContextualChecklistDocumentInput } from '../modules/documentos/documentos.checklist.service';
const requirement = {id:1,codigo:'HOJA_VIDA',nombre_requisito:'Hoja de vida',nombre_documento:'Hoja de vida',ambito_documental:'PERSONA' as const,contrato_cargo_id:null,tipo_vinculacion_id:null,obligatorio:true,requiere_fecha_expedicion:false,requiere_fecha_vencimiento:false,dias_proximo_vencimiento:30,tipo_documento_id:1,vigencia_meses:null};
const document = (state:string,id=1):ContextualChecklistDocumentInput=>({id,tipo_documento_id:id,nombre_original:'a.pdf',tipo_documento_nombre:'Archivo',activo:true,fecha_carga:'2026-01-01',fecha_expedicion:null,fecha_vencimiento:null,estado_revision:state});
const snapshot=(docs:ContextualChecklistDocumentInput[],extra={})=>buildContextualChecklistSnapshot({contratoCargoId:1,contratoId:1,personaId:1,vinculacionId:1,requirements:[{...requirement,...extra}],personaDocuments:docs,vinculacionDocuments:[],todayIso:'2026-09-18'});
for(const state of ['PENDIENTE_REVISION','RECHAZADO','APROBADO'])test(`cumplimiento usa revisión ${state}`,()=>{const result=snapshot([document(state)]);assert.equal(result.cumplimiento_porcentaje,state==='APROBADO'?100:0);assert.equal(result.requisitos[0]?.estado_detallado,state);});
test('archivo legacy sin evidencia de revisión no se autoaprueba',()=>{const d=document('');assert.equal(snapshot([d]).cumplimiento_porcentaje,0);});
test('antecedente usa cuatro meses; vigente por vencer cuenta, vencido no',()=>{
 const p=documentPolicy('ANT_REDAM');const data=normalizeDocumentMetadata(p,{fecha_expedicion:'2026-05-31',fecha_vencimiento:'2099-01-01'});assert.equal(data.fecha_vencimiento,'2026-09-30');
 assert.equal(documentState({...data,estado_revision:'APROBADO'},p,'2026-09-18'),'POR_VENCER');assert.equal(documentState({...data,estado_revision:'APROBADO'},p,'2026-10-01'),'VENCIDO');
 assert.equal(snapshot([{...document('APROBADO'),fecha_expedicion:'2026-01-01',fecha_vencimiento:'2026-05-01'}],{codigo:'ANT_REDAM'}).cumplimiento_porcentaje,0);
});
test('residencia calcula seis meses solo sin vencimiento explícito',()=>{const p=documentPolicy('RESIDENCIA');assert.equal(normalizeDocumentMetadata(p,{fecha_expedicion:'2026-08-31'}).fecha_vencimiento,'2027-02-28');assert.equal(normalizeDocumentMetadata(p,{fecha_expedicion:'2026-08-31',fecha_vencimiento:'2027-03-02'}).fecha_vencimiento,'2027-03-02');assert.equal(addCalendarMonths('2023-08-31',6),'2024-02-29');});
for(const code of ['SISBEN','HOJA_VIDA','IDENTIDAD','CERT_BANCARIA','EPS','ARL','PENSION','CAJA','AUT_DATOS','AUT_INHABILIDADES','TARJETA_PROFESIONAL','INDUCCION'])test(`${code} no solicita fechas ni genera vencimiento`,()=>{const p=documentPolicy(code,{requiere_fecha_expedicion:true,requiere_fecha_vencimiento:true});assert.equal(p.emission,false);assert.equal(p.expiration,false);const result=normalizeDocumentMetadata(p,{sisben:'B4',fecha_expedicion:'2020-01-01',fecha_vencimiento:'2020-02-01'});assert.equal(result.fecha_vencimiento,null);assert.equal(result.fecha_expedicion,null);assert.equal(documentState({estado_revision:'APROBADO',fecha_vencimiento:'2020-01-01'},p),'APROBADO');});
test('SISBEN requiere clasificación; experiencia no es vigencia y acumula períodos sin solapes',()=>{assert.throws(()=>normalizeDocumentMetadata(documentPolicy('SISBEN'),{}));const p=documentPolicy('CERT_LABORAL');const data=normalizeDocumentMetadata(p,{experiencia_inicio:'2020-01-01',experiencia_fin:'2020-01-31'});assert.equal(documentState({...data,estado_revision:'APROBADO'},p),'APROBADO');assert.equal(experienceDays([data.metadata,{experiencia_inicio:'2020-01-15',experiencia_fin:'2020-02-02'}]),33);});
test('manipulación necesita ambos componentes aprobados y vigentes; aliases no duplican componente',()=>{
 const extra={codigo:'MANIPULACION',tipo_documento_ids:[1,2,3],componentes:{1:'CURSO',2:'EXAMENES',3:'CURSO'}};
 assert.equal(snapshot([document('PENDIENTE_REVISION'),document('PENDIENTE_REVISION',2)],extra).requisitos[0]?.estado_detallado,'PENDIENTE_REVISION');
 assert.equal(snapshot([document('APROBADO'),document('RECHAZADO',2)],extra).requisitos[0]?.estado_detallado,'RECHAZADO');
 assert.equal(snapshot([document('APROBADO'),document('APROBADO',2)],extra).cumplimiento_porcentaje,100);
 assert.equal(snapshot([document('APROBADO'),{...document('APROBADO',2),policy_type:{requiere_fecha_vencimiento:true},fecha_vencimiento:'2020-01-01'}],extra).cumplimiento_porcentaje,0);
});
import { requirePermissions } from '../middlewares/roleMiddleware';
import { readFileSync } from 'node:fs';
test('subir y revisar requieren capacidades distintas',()=>{
 let error:unknown;requirePermissions('documentos.update')({user:{permissions:['documentos.upload']}} as any,{} as any,(e?:unknown)=>{error=e;});assert.equal((error as any).statusCode,403);
 requirePermissions('documentos.update')({user:{permissions:['documentos.update']}} as any,{} as any,(e?:unknown)=>{error=e;});assert.equal(error,undefined);
 const routes=readFileSync('src/modules/documentos/documentos.routes.ts','utf8');assert.match(routes,/post\('\/revision\/:scope\/:id', requirePermissions\('documentos.update'\)/);
});
test('upload usa pendiente persistido y conserva múltiples certificaciones',()=>{
 const service=readFileSync('src/modules/documentos/documentos.service.ts','utf8');assert.match(service,/await persistUploadReview\(client, 'persona'/);assert.match(service,/await persistUploadReview\(client, 'vinculacion'/);assert.match(service,/latestVigente && prepared.rule.code !== 'CERT_LABORAL'/);assert.match(service,/pg_advisory_xact_lock/);
});
