import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build} from 'esbuild';
const bundled=await build({stdin:{contents:`export {importNominaEmpleados} from './services/nominaApi'; export {createPopulationSyncCoordinator} from './pages/nomina/populationSync';`,resolveDir:resolve('FrontendNuevo/src'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',define:{'import.meta.env.VITE_API_URL':'"http://synthetic.test/api"'}});
const module={exports:{}};
new Function('module','exports','require',bundled.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
const api=module.exports;
function auth(t){
 const prior=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'synthetic-token'}});
 t.after(()=>prior?Object.defineProperty(globalThis,'localStorage',prior):delete globalThis.localStorage);
}
for(const status of [403,500])test(`POST sintético real del cliente HTTP ${status}: resultado del bloqueo correcto`,async t=>{
 auth(t);let calls=0;const store=api.createPopulationSyncCoordinator();
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'http://synthetic.test/api/nomina/periodos/5/importar-empleados');assert.equal(options.method,'POST');calls++;
  return new Response(JSON.stringify({error:{message:'synthetic failure'}}),{status,headers:{'content-type':'application/json'}});
 });
 await assert.rejects(store.run('15:5',()=>api.importNominaEmpleados('5')));
 assert.equal(calls,1);assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:status===500?1:0});
});
test('timeout de 30s del cliente aborta HTTP pero no se toma como cancelación del servidor',async t=>{
 auth(t);const store=api.createPopulationSyncCoordinator();let timeout;
 t.mock.method(globalThis,'setTimeout',(callback,ms)=>{timeout=ms;queueMicrotask(callback);return 1;});
 t.mock.method(globalThis,'clearTimeout',()=>{});
 t.mock.method(globalThis,'fetch',async(_url,options)=>new Promise((_resolve,reject)=>{
  options.signal.addEventListener('abort',()=>reject(new DOMException('Synthetic abort','AbortError')));
 }));
 await assert.rejects(store.run('15:5',()=>api.importNominaEmpleados('5')),error=>error.status===408);
 assert.equal(timeout,30000);assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:1});
});
test('fallo de red real del cliente no deja spinner ni autoriza otra escritura',async t=>{
 auth(t);const store=api.createPopulationSyncCoordinator();
 t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('Synthetic disconnect');});
 await assert.rejects(store.run('15:5',()=>api.importNominaEmpleados('5')),error=>error.status===0);
 assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:1});
});
test('el timeout actual termina al recibir headers; cuerpo JSON pendiente mantiene bloqueo',async t=>{
 auth(t);const store=api.createPopulationSyncCoordinator();let resolveBody,cleared=0;
 const body=new Promise(resolve=>{resolveBody=resolve;});
 t.mock.method(globalThis,'clearTimeout',id=>{cleared++;clearTimeoutOriginal(id);});
 t.mock.method(globalThis,'fetch',async()=>({status:200,ok:true,headers:new Headers({'content-type':'application/json'}),json:()=>body}));
 const operation=store.run('15:5',()=>api.importNominaEmpleados('5'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.ok(cleared>0);assert.equal(store.getSnapshot().pending,1);
 resolveBody({data:{imported:0}});await operation;
 assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:0});
});
const clearTimeoutOriginal=globalThis.clearTimeout;
