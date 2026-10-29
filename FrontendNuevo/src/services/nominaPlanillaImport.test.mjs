import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['FrontendNuevo/src/services/nominaPlanillaImportApi.ts'],bundle:true,write:false,platform:'node',format:'cjs',define:{'import.meta.env.VITE_API_URL':'"http://empiria.test/api"'}});
const module={exports:{}};new Function('module','exports','require',bundle.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
for(const confirm of [false,true])test(`cliente importacion ${confirm?'confirmacion explicita':'preview sin autorizacion de escritura'}`,async t=>{
  const calls=[];
  for(const[key,value]of Object.entries({window:{setTimeout,clearTimeout},localStorage:{getItem:()=> 'synthetic-session'}})){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,configurable:true});t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
  }
  t.mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({success:true,data:{estado:confirm?'APLICADO':'VISTA_PREVIA',token:confirm?null:'signed-preview'}}),{headers:{'content-type':'application/json'}});});
  const file=new File(['synthetic-only'],'test.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const result=await module.exports.importPlanillaExcel('71','41',file,confirm?{token:'signed-preview',motivo:'Revision expresa'}:undefined);
  assert.equal(calls.length,1);assert.equal(calls[0].init.method,'POST');assert.equal(calls[0].init.headers.Authorization,'Bearer synthetic-session');
  assert.match(calls[0].url,new RegExp(`/periodos/71/planilla-operativa/importacion/${confirm?'confirmar':'preview'}$`));
  const body=calls[0].init.body;assert.ok(body instanceof FormData);assert.equal(body.get('empresa_id'),'41');assert.equal(body.get('file').name,'test.xlsx');
  assert.equal(body.get('confirmar'),confirm?'CONFIRMAR':null);assert.equal(body.get('token'),confirm?'signed-preview':null);
  assert.equal(body.get('motivo'),confirm?'Revision expresa':null);assert.equal(result.estado,confirm?'APLICADO':'VISTA_PREVIA');
});
