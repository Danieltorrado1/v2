import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const base = 'FrontendNuevo/src/pages/agenda/';
const frontend = createRequire(resolve('FrontendNuevo/package.json'));
function load(file: string, dependencies: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(file,'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in dependencies,name); return dependencies[name]; }, setTimeout, clearTimeout, ...globals });
  return exports;
}
const flush = async () => { for (let i=0;i<20;i++) await Promise.resolve(); };
const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : node && typeof node === 'object' ? [node,...nodes(node.props?.children)] : [];
function harness(component: (hooks: any) => any) {
  const slots: any[] = []; let cursor=0; let effects: (() => void)[]=[]; let tree: any; let dirty=false;
  const hooks = {
    useState(initial: any) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i],(value: any)=>{const next=typeof value==='function'?value(slots[i]):value; if (!Object.is(next,slots[i])) { slots[i]=next; dirty=true; }}]; },
    useRef(initial: any) { const i=cursor++; return slots[i]??={current:initial}; },
    useMemo(fn: () => unknown,deps: any[]) { const i=cursor++; if (!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j]))) slots[i]={deps,value:fn()}; return slots[i].value; },
    useEffect(fn: () => any,deps: any[]) { const i=cursor++; const previous=slots[i]; if (!previous||deps.some((v,j)=>v!==previous.deps[j])) { slots[i]={deps,cleanup:previous?.cleanup}; effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();}); } },
  };
  const Component=component(hooks);
  return {
    render(props: any={}) { cursor=0; effects=[]; tree=Component(props); effects.forEach(fn=>fn()); return tree; },
    async settle(props: any={}) {
      for (let renders=0; renders<20; renders++) {
        dirty=false; this.render(props); await flush();
        if (!dirty) return;
      }
      assert.fail('Agenda did not settle: repeated state updates after mounting');
    },
    all() { return nodes(tree); },
    click(text: string) { const button=nodes(tree).find(n=>n.type==='button'&&n.props.children===text); assert.ok(button,text); button.props.onClick(); },
  };
}
test('API de Agenda fija empresa para GET y escrituras incluso si cambia la preferencia', async () => {
  let selected='1';const calls:any[]=[];
  const httpClient=Object.fromEntries(['get','post','put','patch'].map(method=>[method,(...args:any[])=>{calls.push([method,...args]);return Promise.resolve({});}]));
  const {createAgendaApi,agendaApi}=load('FrontendNuevo/src/services/agendaApi.ts',{'./apiClient':{apiClient:httpClient}},{window:{localStorage:{getItem:()=>selected}}});
  const captured=createAgendaApi(1); selected='2';
  await captured.summary(); await captured.assign(10,{responsable_id:7});await captured.getTop('2026-09-16');await captured.closeDay({fecha:'2026-09-16'});
  assert.ok(calls.every(call=>call.at(-1).params.empresa_id===1));
  await agendaApi.users();assert.equal(calls.at(-1).at(-1).params.empresa_id,2);
});

test('Semana carga paginas del rango, Mi dia consulta hoy y respuestas viejas no sustituyen pestaña', async () => {
  const common=load(`${base}agendaOperativa.domain.ts`,{});
  const calls:any[]=[]; let late!: (value:any)=>void; let defer=false; let company=1;
  const api={summary:async()=>({}),list:async(params:any)=>{calls.push(params);if(defer){defer=false;return new Promise(resolve=>{late=resolve;});}return {items:Array.from({length:params.page===1?100:1},(_,i)=>({id:i+params.page*100,titulo:'Vigente',fecha_prevista:params.desde,tipo:'OTRA',responsable_id:7})),total:101};}};
  const h=harness(hooks=>{
    const dependencies:any={react:hooks,'react/jsx-runtime':frontend('react/jsx-runtime'),'../../services/agendaApi':{createAgendaApi:()=>api},'../../context/AuthContext':{useAuth:()=>({user:{permissions:['agenda.read']}})},'../../context/CompanyContext':{useCompanyContext:()=>({empresaId:company})},'./agendaOperativa.domain':common,'./agendaFollowup.domain':load(`${base}agendaFollowup.domain.ts`,{'./agendaOperativa.domain':common}),'./agendaTopThree.domain':load(`${base}agendaTopThree.domain.ts`,{'./agendaOperativa.domain':common}),'./AgendaOperativaPage.css':{}};
    for(const name of ['AgendaFollowupsView','AgendaTaskFollowupForm','AgendaTaskTopThree','AgendaTaskEditForm','AgendaTaskAssignForm','AgendaTaskParticipantsForm','AgendaTaskRescheduleForm','AgendaTaskCancelForm','AgendaTaskTransitionConfirm'])dependencies[`./components/${name}`]={default:()=>null};
    dependencies['lucide-react']=frontend('lucide-react');
    const module=load(`${base}AgendaOperativaPage.tsx`,dependencies,{window:{confirm:()=>true}});
    const first=module.default();company=2;const second=module.default();assert.notEqual(first.key,second.key);
    return module.AgendaCompanyPage;
  });
  await h.settle({empresaId:1});
  assert.equal(calls.length,2,'Mount loads each page only once and settles without an update loop');
  assert.equal(calls[0].desde,calls[0].hasta);assert.equal(calls[1].page,2);
  assert.equal(h.all().filter(n=>n.props?.className==='agenda-task').length,101);
  assert.ok(!h.all().some(n=>n.type==='button'&&n.props.children==='Cierre diario'));
  h.click('Semana');h.render({empresaId:1});await flush();h.render({empresaId:1});
  assert.equal(calls[2].hasta,common.addDays(calls[2].desde,6));assert.equal(calls[3].page,2);
  defer=true;h.click('Semana siguiente');h.render({empresaId:1});
  h.click('Bandeja');h.render({empresaId:1});await flush();h.render({empresaId:1});
  late({items:[{id:999,titulo:'Obsoleta'}],total:1});await flush();h.render({empresaId:1});
  assert.ok(!h.all().some(n=>n.props?.children==='Obsoleta'));
});

test('edicion conserva horas SQL en formato aceptado y bloquea doble envio', async () => {
  let calls=0;let sent:any;let finish!:(value:any)=>void;
  const h=harness(hooks=>load(`${base}components/AgendaTaskEditForm.tsx`,{react:hooks,'react/jsx-runtime':frontend('react/jsx-runtime'),'../../../services/agendaApi':{agendaApi:{update:async(_id:number,payload:any)=>{calls++;sent=payload;return new Promise(resolve=>{finish=resolve;});}}}},{window:{confirm:()=>true}}).default);
  const props={task:{id:10,titulo:'Tarea',tipo:'OTRA',prioridad:'C',fecha_prevista:'2026-09-16',hora_inicio:'09:30:00'},onSaved(){},onCancel(){}};
  const tree=h.render(props);const pending=tree.props.onSubmit({preventDefault(){}});tree.props.onSubmit({preventDefault(){}});
  assert.equal(calls,1);assert.equal(sent.hora_inicio,'09:30');finish({id:10});await pending;
});

test('asignacion carga responsables, conserva seleccion y bloquea doble envio', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls=0;let sent:any;let finish!:(value:any)=>void;
  const h=harness(hooks=>load(`${base}components/AgendaTaskAssignForm.tsx`,{react:hooks,'react/jsx-runtime':frontend('react/jsx-runtime'),'../../../services/agendaApi':{agendaApi:{users:async()=>({data:[{id:7,nombre_completo:'Actual'},{id:9,nombre_completo:'Nuevo'}]}),assign:async(_id:number,payload:any)=>{calls++;sent=payload;return new Promise(resolve=>{finish=resolve;});}}}},{window:{confirm:()=>true}}).default);
  const props={task:{id:10,responsable_id:7},onSaved(){},onCancel(){}};
  h.render(props);t.mock.timers.tick(300);await flush();h.render(props);
  const select=h.all().find(n=>n.type==='select');assert.ok(select);
  select.props.onChange({target:{value:'9'}});const tree=h.render(props);
  const pending=tree.props.onSubmit({preventDefault(){}});tree.props.onSubmit({preventDefault(){}});
  assert.equal(calls,1);assert.equal(sent.responsable_id,9);finish({id:10});await pending;
});
