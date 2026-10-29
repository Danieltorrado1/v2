import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import {importHarness} from './fixtures/planilla-importacion.synthetic';
import {syntheticAuthEnvironment} from './fixtures/planilla-operativa.authorization.synthetic';
Object.assign(process.env,syntheticAuthEnvironment);
const {authMiddleware}=require('../middlewares/authMiddleware') as typeof import('../middlewares/authMiddleware');
const {requirePermissions}=require('../middlewares/roleMiddleware') as typeof import('../middlewares/roleMiddleware');
const {createPlanillaImportHandlers}=require('../modules/nomina/planilla-importacion.controller') as typeof import('../modules/nomina/planilla-importacion.controller');
const {dbPool}=require('../config/db') as typeof import('../config/db');

test('HTTP multipart autenticado: carga, preview, confirmacion y parametros manipulados',async t=>{
  const h=await importHarness();
  t.mock.method(dbPool,'query',((sql:string,params:unknown[])=>h.db.query(sql,params)) as never);
  const app=express();app.use(authMiddleware);app.use((req,_res,next)=>{req.tenant=h.tenant(Number(req.user!.userId));next();});
  const handlers=createPlanillaImportHandlers(h.execute);
  const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:12*1024*1024,files:1,fields:5,parts:6}}).single('file');
  app.post('/periodos/:id/preview',requirePermissions('nomina.export','nomina.operativa.read'),upload,handlers.preview);
  app.post('/periodos/:id/confirmar',requirePermissions('nomina.export','nomina.operativa.read'),upload,handlers.confirm);
  app.use((error:{statusCode?:number;name?:string;code?:string},_req:express.Request,res:express.Response,_next:express.NextFunction)=>res.status(error.statusCode ?? (error.name==='ZodError' ? 422 : 500)).json({code:error.code ?? error.name}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const port=(server.address() as {port:number}).port;
  const token=(id:number)=>jwt.sign({sub:String(id),permissions:['nomina.municipios.read_all']},'test-only');
  const request=(path:string,buffer:Buffer,fields:Record<string,string>={},actor:number|null=1,filename='planilla.xlsx')=>{
    const body=new FormData();body.append('file',new Blob([new Uint8Array(buffer)]),filename);body.append('empresa_id','41');for(const [key,value] of Object.entries(fields))body.append(key,value);
    return fetch(`http://127.0.0.1:${port}${path}`,{method:'POST',body,headers:actor===null ? {} : {Authorization:`Bearer ${token(actor)}`}});
  };
  try {
    const file=h.edit(await h.download(1),[{id:'101',fecha:'2026-10-27',value:'DCO'}]);
    assert.equal((await request('/periodos/71/preview',file,{},null)).status,401);
    assert.equal((await request('/periodos/71/preview',file,{municipio_id:'2'})).status,422);
    assert.equal((await request('/periodos/71/preview?usuario_id=3',file)).status,422);
    assert.equal((await request('/periodos/72/preview',file)).status,403);
    assert.equal((await request('/periodos/71/preview',file,{},1,'book.xlsm')).status,422);
    const res=await request('/periodos/71/preview',file);assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'private, no-store');
    const p=(await res.json()).data;assert.equal(p.plan.nuevas,1);assert.ok(p.token);
    assert.equal((await h.db.query('SELECT * FROM nomina_novedades')).rows.length,0);
    assert.equal((await request('/periodos/71/confirmar',file,{token:p.token,motivo:'Motivo de revision'})).status,422);
    const confirmed=await request('/periodos/71/confirmar',file,{token:p.token,motivo:'Motivo de revision expresa',confirmar:'CONFIRMAR'});
    assert.equal(confirmed.status,200);assert.equal((await confirmed.json()).data.estado,'APLICADO');
    const repeated=await request('/periodos/71/confirmar',file,{token:p.token,motivo:'Motivo de revision expresa',confirmar:'CONFIRMAR'});
    assert.equal(repeated.status,200);assert.equal((await repeated.json()).data.estado,'YA_APLICADO');
    assert.equal((await h.db.query('SELECT * FROM nomina_novedades')).rows.length,1);
    const failedFile=h.edit(await h.download(1),[{id:'101',fecha:'2026-10-28',value:'DCO'}]);
    const failedPreview=(await (await request('/periodos/71/preview',failedFile)).json()).data;
    h.injectFailure(1);
    const failed=await request('/periodos/71/confirmar',failedFile,{token:failedPreview.token,motivo:'Revision de fallo sintetico',confirmar:'CONFIRMAR'});
    assert.equal(failed.status,500);const failure=await failed.json();
    assert.equal(failure.error.details.reporte.estado,'REVERTIDO');assert.equal(failure.error.details.reporte.aplicadas,0);
    assert.doesNotMatch(JSON.stringify(failure),/Synthetic injected/);
    assert.equal((await h.db.query('SELECT * FROM nomina_planilla_importaciones')).rows.length,1);
  }finally{await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await h.close();}
});
