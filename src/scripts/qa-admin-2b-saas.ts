import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../app';
import { dbPool } from '../config/db';
import { env } from '../config/env';
import { getCompanySaasHistory } from '../modules/saas/saas.service';

const operational=['personas','organizaciones','empresas','contratos','vinculaciones','nomina_empleados'] as const;
async function counts(){const pairs=await Promise.all([...operational,'planes','empresa_suscripciones','empresa_modulo_overrides'].map(async table=>[table,(await dbPool.query<{n:number}>(`SELECT COUNT(*)::int n FROM ${table}`)).rows[0]!.n] as const));return Object.fromEntries(pairs);}
async function main(){
 const before=await counts();const client=await dbPool.connect();let planA=0,planB=0,addedAccess=false;const userId='3',empresaA=1,empresaB=15;
 try{
  const mods=await client.query<{id:string;codigo:string}>('SELECT id::text,codigo FROM modulos');const byCode=new Map(mods.rows.map(x=>[x.codigo,Number(x.id)]));
  const pa=await client.query<{id:string}>(`INSERT INTO planes(codigo,nombre,activo) VALUES($1,'QA ADMIN-2B A',TRUE) RETURNING id::text`,[`QA2B_A_${Date.now()}`]);planA=Number(pa.rows[0]!.id);
  const pb=await client.query<{id:string}>(`INSERT INTO planes(codigo,nombre,activo) VALUES($1,'QA ADMIN-2B B',TRUE) RETURNING id::text`,[`QA2B_B_${Date.now()}`]);planB=Number(pb.rows[0]!.id);
  await client.query(`INSERT INTO plan_modulos(plan_id,modulo_id) SELECT $1,unnest($2::bigint[])`,[planA,[byCode.get('PERSONAL'),byCode.get('NOMINA')]]);
  await client.query(`INSERT INTO plan_modulos(plan_id,modulo_id) SELECT $1,unnest($2::bigint[])`,[planB,[byCode.get('PERSONAL'),byCode.get('COBERTURA')]]);
  await client.query(`INSERT INTO empresa_suscripciones(empresa_id,plan_id,estado,fecha_inicio) VALUES($1,$2,'ACTIVA',CURRENT_DATE),($3,$4,'ACTIVA',CURRENT_DATE)`,[empresaA,planA,empresaB,planB]);
  const access=await client.query('SELECT activo FROM usuario_empresas WHERE usuario_id=$1 AND empresa_id=$2',[userId,empresaB]);
  assert.equal(access.rowCount,0,'Empresa B ya tenía relación y no es fixture seguro');await client.query('INSERT INTO usuario_empresas(usuario_id,empresa_id,activo) VALUES($1,$2,TRUE)',[userId,empresaB]);addedAccess=true;
  const token=jwt.sign({},env.JWT_SECRET,{subject:userId,expiresIn:'10m'});const server=app.listen(0,'127.0.0.1');await new Promise<void>((ok,bad)=>{server.once('listening',ok);server.once('error',bad);});const address=server.address();assert.ok(address&&typeof address==='object');const base=`http://127.0.0.1:${address.port}${env.API_PREFIX}`;
  const get=async(path:string)=>{const response=await fetch(base+path,{headers:{Authorization:`Bearer ${token}`}});const body=await response.json();return{status:response.status,body};};
  try{
   const [capA,capB,crossTenant,cobA,cobB,nomA,nomB]=await Promise.all([get(`/saas/companies/${empresaA}/capabilities`),get(`/saas/companies/${empresaB}/capabilities`),get('/saas/companies/2/capabilities'),get(`/cobertura/resumen?empresa_id=${empresaA}`),get(`/cobertura/resumen?empresa_id=${empresaB}`),get(`/nomina/periodos?empresa_id=${empresaA}`),get(`/nomina/periodos?empresa_id=${empresaB}`)]);
   assert.equal(capA.status,200);assert.equal(capB.status,200);assert.equal(crossTenant.status,403);
   assert.equal(capA.body.data.modulos.NOMINA,true);assert.equal(capA.body.data.modulos.COBERTURA,false);assert.equal(capB.body.data.modulos.NOMINA,false);assert.equal(capB.body.data.modulos.COBERTURA,true);
   assert.equal(cobA.body.error?.code,'MODULE_NOT_ENABLED');assert.equal(nomB.body.error?.code,'MODULE_NOT_ENABLED');assert.notEqual(cobB.body.error?.code,'MODULE_NOT_ENABLED');assert.notEqual(nomA.body.error?.code,'MODULE_NOT_ENABLED');
   await client.query(`INSERT INTO empresa_modulo_overrides(empresa_id,modulo_id,habilitado,motivo,fecha_inicio) VALUES($1,$2,TRUE,'QA override positivo',CURRENT_DATE)`,[empresaA,byCode.get('COBERTURA')]);
   const overrideCaps=await get('/saas/companies/1/capabilities');assert.equal(overrideCaps.body.data.modulos.COBERTURA,true);
   await client.query(`UPDATE empresa_modulo_overrides SET fecha_fin=CURRENT_DATE WHERE empresa_id=$1 AND modulo_id=$2 AND fecha_fin IS NULL`,[empresaA,byCode.get('COBERTURA')]);
   await client.query(`UPDATE empresa_suscripciones SET fecha_fin=CURRENT_DATE WHERE empresa_id=$1 AND plan_id=$2`,[empresaA,planA]);
   await client.query(`INSERT INTO empresa_suscripciones(empresa_id,plan_id,estado,fecha_inicio) VALUES($1,$2,'PRUEBA',CURRENT_DATE+1)`,[empresaA,planB]);
   const history=await getCompanySaasHistory(empresaA,{isGlobalAdmin:true,empresaIds:[],contratoIds:[]});assert.equal(history.suscripciones.length,2);assert.equal(history.overrides.length,1);
   console.log(JSON.stringify({empresaA:{capabilities:capA.body.data.modulos,overridePositivo:overrideCaps.body.data.modulos.COBERTURA,historicoSuscripciones:history.suscripciones.length,historicoOverrides:history.overrides.length,cobertura:{status:cobA.status,code:cobA.body.error?.code},nomina:{status:nomA.status,code:nomA.body.error?.code}},empresaB:{capabilities:capB.body.data.modulos,cobertura:{status:cobB.status,code:cobB.body.error?.code},nomina:{status:nomB.status,code:nomB.body.error?.code}},tenantForbidden:{status:crossTenant.status,code:crossTenant.body.error?.code},before}));
  }finally{await new Promise<void>((ok,bad)=>server.close(e=>e?bad(e):ok()));}
 }finally{
  if(addedAccess)await client.query('DELETE FROM usuario_empresas WHERE usuario_id=$1 AND empresa_id=$2',[userId,empresaB]);
  if(planA||planB){await client.query('DELETE FROM empresa_modulo_overrides WHERE empresa_id=ANY($1::bigint[])',[ [empresaA,empresaB] ]);await client.query('DELETE FROM empresa_suscripciones WHERE plan_id=ANY($1::bigint[])',[[planA,planB]]);await client.query('DELETE FROM plan_modulos WHERE plan_id=ANY($1::bigint[])',[[planA,planB]]);await client.query('DELETE FROM planes WHERE id=ANY($1::bigint[])',[[planA,planB]]);}
  client.release();const after=await counts();assert.deepEqual(after,before);console.log(JSON.stringify({after,fixturesFinales:0}));await dbPool.end();
 }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
