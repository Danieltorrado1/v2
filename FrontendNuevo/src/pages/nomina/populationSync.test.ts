import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPopulationSyncCoordinator} from './populationSync';

function deferred<T>() {
  let resolve!: (value:T)=>void, reject!: (error:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
test('limpieza del efecto y remount no dejan Sincronizando al terminar la petición',async()=>{
  const store=createPopulationSyncCoordinator(),response=deferred<number>();
  let renders=0;
  const unsubscribe=store.subscribe(()=>{renders++;});
  const operation=store.run('15:5',()=>response.promise);
  assert.equal(store.getSnapshot().pending,1);
  unsubscribe(); // The view/effect was cancelled while HTTP is still active.
  response.resolve(7);assert.equal(await operation,7);
  assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:0});
  assert.equal(renders,1);
});
test('efecto repetido para el mismo período espera la petición existente sin repetir POST',async()=>{
  const store=createPopulationSyncCoordinator(),response=deferred<number>();let calls=0;
  const first=store.run('15:5',()=>{calls++;return response.promise;});
  const repeated=store.run('15:5',async()=>{calls++;return 99;});
  assert.equal(first,repeated);assert.equal(store.hasPending('15:5'),true);
  await Promise.resolve();assert.equal(calls,1);
  response.resolve(8);assert.equal(await repeated,8);assert.equal(await first,8);
  assert.equal(store.hasPending('15:5'),false);
});
test('respuesta vieja no desbloquea otra sincronización real de otro período',async()=>{
  const store=createPopulationSyncCoordinator(),old=deferred<number>(),next=deferred<number>();
  const a=store.run('15:5',()=>old.promise),b=store.run('15:6',()=>next.promise);
  assert.equal(store.getSnapshot().pending,2);old.resolve(1);await a;
  assert.equal(store.getSnapshot().pending,1);next.resolve(2);await b;
  assert.equal(store.getSnapshot().pending,0);
});
for(const status of [400,401,403,409,422,429])test(`HTTP ${status} definitivo libera bloqueo y permite corrección posterior`,async()=>{
  const store=createPopulationSyncCoordinator();
  await assert.rejects(store.run('15:5',async()=>{throw Object.assign(new Error('rechazo HTTP'),{status});}));
  assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:0});
  assert.equal(await store.run('15:5',async()=>42),42);
});
for(const status of [0,408,500,502,504])test(`HTTP/red ${status}: termina spinner, mantiene Excel bloqueado por resultado incierto`,async()=>{
  const store=createPopulationSyncCoordinator();
  await assert.rejects(store.run('15:5',async()=>{throw Object.assign(new Error('resultado desconocido'),{status});}));
  assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:1});let calls=0;
  await assert.rejects(store.run('15:5',async()=>{calls++;return 1;}),/requiere verificación/);
  assert.equal(calls,0);
});
test('error inesperado de cuerpo JSON no se interpreta como escritura cancelada',async()=>{
  const store=createPopulationSyncCoordinator();
  await assert.rejects(store.run('15:5',async()=>{throw new SyntaxError('JSON truncado');}));
  assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:1});
});
test('rechazo conocido de una solicitud no libera otra aún pendiente',async()=>{
  const store=createPopulationSyncCoordinator(),active=deferred<number>();
  const b=store.run('15:5:personal:2',()=>active.promise);
  await assert.rejects(store.run('15:5',async()=>{throw Object.assign(new Error('rechazo'),{status:409});}));
  assert.equal(store.getSnapshot().pending,1);active.resolve(1);await b;
  assert.deepEqual(store.getSnapshot(),{pending:0,uncertain:0});
});
