import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {Native202Local,executeNative202Local,buildNativeAuditRows} from '../scripts/nomina-turno-202-native-local';
import {TARGETS,ACTION,canonical,digest,localTicket,protectReference,sanitized,appendAudit,validateNativeLocalTicket,LocalEvidenceStore,type Manifest,type DatabaseState} from '../scripts/nomina-turno-202-integral-local';

test('set-based payloads exactly match the original canonical audit writer, including all flattened history fields',async()=>{
 const before:DatabaseState={},after:DatabaseState={};
 for(const [table,id]of Object.entries(TARGETS)){before[table]=[{id,total:97800,nullable:null,nested:{flag:false},'numeric_keys':{'10':'ten','2':'two'}}];after[table]=[{...before[table]![0],total:195600,nested:{flag:true}}];}
 before.cobertura_cuentas_cobro_externas![0]!.generado_bucket='local';before.cobertura_cuentas_cobro_externas![0]!.generado_path='old.pdf';
 after.cobertura_cuentas_cobro_externas![0]!.generado_bucket=null;after.cobertura_cuentas_cobro_externas![0]!.generado_path=null;
 const m:Manifest={before,documentSha256:digest('old'),referenceSha256:digest('local/old.pdf'),triggerHash:'test',actorId:7,technicalActorIds:[7]};
 const t=localTicket(m),envelope=protectReference({bucket:'local',path:'old.pdf'},randomBytes(32),'local-equivalence');
 const generated=buildNativeAuditRows(before,after,t,m,envelope),expected={events:[] as any[],legacy:[] as any[],history:[] as any[]};
 const recording={query:async(sql:string,p:any[])=>{
  if(sql.startsWith('INSERT INTO auditoria_eventos'))expected.events.push({usuario_id:p[0],empresa_id:15,contrato_id:24,modulo:'NOMINA',entidad:p[1],entidad_id:p[2],accion:p[3],descripcion:p[3],datos_anteriores:JSON.parse(p[4]),datos_nuevos:JSON.parse(p[5])});
  else if(sql.startsWith('INSERT INTO auditoria('))expected.legacy.push({usuario_id:p[0],tabla_afectada:p[1],registro_id:p[2],accion:p[3],descripcion:p[3],datos_anteriores:JSON.parse(p[4]),datos_nuevos:JSON.parse(p[5])});
  else if(sql.startsWith('INSERT INTO historial_cambios'))expected.history.push({usuario_id:p[0],tabla_afectada:p[1],registro_id:p[2],campo:p.length===6?'__snapshot__':p[3],valor_anterior:p.length===6?p[3]:p[4],valor_nuevo:p.length===6?p[4]:p[5],motivo:p.length===6?p[5]:p[6]});
  else throw Error('UNEXPECTED_SQL');return{rows:[]};
 }};
 for(const [table,id]of Object.entries(TARGETS))await appendAudit(recording as never,table,id,sanitized(before[table]![0]!,table,envelope,m),after[table]![0]!,t,m);
 assert.equal(canonical(generated),canonical(expected));assert.equal(generated.events.length,4);assert.equal(generated.legacy.length,4);assert.ok(generated.history.every(r=>r.motivo===ACTION));
});

test('native executor rejects an arbitrary client before calling its query method',async()=>{
 let calls=0;await assert.rejects(executeNative202Local({query:()=>{calls++;}} as never,{} as never,{} as never),/NATIVE_LOCAL_REQUIRED/);assert.equal(calls,0);
});
test('native connector rejects non-disposable paths and reserved production ports before connecting',async()=>{
 for(const port of [5432,5433,0,65536])await assert.rejects(Native202Local.connect(path.resolve('tmp'),port),/LOCAL_CLUSTER_PATH_OR_PORT_REJECTED/);
});
test('shared native ticket gate preserves enable, nonce, confirmation and expiry protections',()=>{
 const m:Manifest={before:{},documentSha256:'test',referenceSha256:'test',triggerHash:'test',actorId:7,technicalActorIds:[7]},store=new LocalEvidenceStore({bucket:'local',path:'old',bytes:Buffer.from('old'),approved:false,sent:false,signed:false,paid:false,posted:false});
 const ticket=localTicket(m),o={mode:'Mutate' as const,enableLocalMutate:true,ticket,confirmation:ticket.confirmation,custodyKey:randomBytes(32),custodyKeyId:'local-test',store};
 assert.equal(validateNativeLocalTicket(m,o),ticket);
 assert.throws(()=>validateNativeLocalTicket(m,{...o,enableLocalMutate:false}),/MUTATE_DISABLED/);
 assert.throws(()=>validateNativeLocalTicket(m,{...o,confirmation:'wrong'}),/CONFIRMATION_NONCE/);
 assert.throws(()=>validateNativeLocalTicket(m,{...o,ticket:{...ticket}}),/CONFIRMATION_NONCE/);
 const expired=localTicket(m,1,1);assert.throws(()=>validateNativeLocalTicket(m,{...o,ticket:expired,confirmation:expired.confirmation}),/CONFIRMATION_NONCE/);
});
