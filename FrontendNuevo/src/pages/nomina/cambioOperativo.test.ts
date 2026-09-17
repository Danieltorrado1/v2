import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as domain from './cambioOperativo.domain';
import { buildTramos } from './planillaOperativa.domain';

const frontend = createRequire(resolve('FrontendNuevo/package.json'));
const options = [
  { id:'1', institucion_id:'10', institucion:'Institución A', sede_id:'100', sede:'Sede A', modalidad_id:'1', modalidad:'Modalidad A' },
  { id:'2', institucion_id:'10', institucion:'Institución A', sede_id:'100', sede:'Sede A', modalidad_id:'2', modalidad:'Modalidad B' },
  { id:'3', institucion_id:'20', institucion:'Institución B', sede_id:'200', sede:'Sede B', modalidad_id:'2', modalidad:'Modalidad B' },
];
const base = domain.contextoDestino({}, options[0]!);
test('selección reconoce los tipos existentes sin código operativo ni IDs hardcodeados', () => {
  assert.equal(domain.tipoCambioOperativo({ nombre:'CAMBIO DE MODALIDAD', codigo_operativo:null }), 'CAMBIO_DE_MODALIDAD');
  assert.equal(domain.tipoCambioOperativo({ nombre:'CAMBIO DE SEDE', codigo_operativo:null }), 'CAMBIO_DE_SEDE');
  assert.equal(domain.tipoCambioOperativo({ nombre:'INCAPACIDAD GENERAL', codigo_operativo:null }), null);
});
test('catálogos dependientes excluyen sedes incompatibles y no inventan modalidades', () => {
  const result = domain.opcionesContexto(options, '20', '200');
  assert.deepEqual(result.sedes.map(row => row.sede_id), ['200']);
  assert.deepEqual(result.modalidades.map(row => row.modalidad_id), ['2']);
  assert.equal(domain.opcionesContexto(options, '20', '100').modalidades.length, 0);
});
test('TH y administrador editan pensión con permisos de movimientos sin edición de vinculaciones', () => {
  const permissions = ['nomina.movimientos.create', 'nomina.movimientos.update'];
  for (const role of ['TALENTO_HUMANO','ADMINISTRADOR']) assert.equal(domain.canSavePension(permissions,[role]),true);
  for (const role of ['GESTOR','NOMINA']) assert.equal(domain.canSavePension(permissions,[role]),false);
  assert.equal(domain.canSavePension(['nomina.movimientos.update'],['TALENTO_HUMANO']),false);
});

function harness(api: any) {
  const slots: any[] = []; let cursor=0; let effects: (()=>void)[]=[]; let tree: any;
  const hooks = {
    useState(initial:any) { const i=cursor++; if (!(i in slots)) slots[i]=typeof initial==='function'?initial():initial; return [slots[i],(next:any)=>{slots[i]=typeof next==='function'?next(slots[i]):next;}]; },
    useRef(initial:any) { const i=cursor++; return slots[i]??={current:initial}; },
    useEffect(fn:()=>any,deps:any[]) { const i=cursor++; if (!slots[i]||deps.some((v,j)=>!Object.is(v,slots[i].deps[j]))) { const previous=slots[i]; slots[i]={deps}; effects.push(()=>{previous?.cleanup?.(); slots[i].cleanup=fn();}); } },
  };
  const exports:any={};
  const dependencies:any={react:hooks,'react/jsx-runtime':frontend('react/jsx-runtime'),'../../services/apiClient':{apiClient:api},'./cambioOperativo.domain':domain};
  const source=readFileSync(resolve('FrontendNuevo/src/pages/nomina/CambioOperativoFields.tsx'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(code,{exports,require:(name:string)=>{assert.ok(name in dependencies,name);return dependencies[name];}});
  const nodes=(node:any):any[]=>Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];
  return {
    render(props:any) { cursor=0;effects=[];tree=exports.default(props);effects.forEach(fn=>fn()); },
    async settle(props:any) { for(let i=0;i<4;i++){this.render(props);for(let j=0;j<10;j++)await Promise.resolve();} },
    all() { return nodes(tree); },
    select(index:number,value:string) { const select=nodes(tree).filter(n=>n.type==='select')[index]; select.props.onChange({target:{value}}); },
  };
}

test('formulario real de TH carga catálogo, limpia sede, envía IDs y guarda por el endpoint existente', async () => {
  const gets:string[]=[]; const posts:any[]=[]; let saved:any; let complete!:(data:any)=>void;
  const h=harness({
    get:async(path:string)=>{gets.push(path);return {data:path.includes('/opciones')?options:{contexto:base}};},
    post:async(path:string,payload:any)=>{posts.push({path,payload});return new Promise(resolve=>{complete=resolve;});},
  });
  const props={periodoId:'1',empleadoId:'20',vinculacionId:'10',fecha:'2026-09-10',tipo:'CAMBIO_DE_SEDE',canSave:true,onSaved:(value:any)=>{saved=value;},onCancel() {}};
  await h.settle(props);
  assert.ok(gets.includes('/vinculaciones/10/asignacion-operativa/opciones'));
  assert.ok(gets.includes('/nomina/periodos/1/vinculaciones/10/contexto-operativo/2026-09-10'));
  assert.equal(h.all().filter(n=>n.type==='select')[0].props.children[1].length,2);
  h.select(0,'20');h.render(props);
  assert.equal(h.all().filter(n=>n.type==='select')[1].props.value,'');
  assert.equal(h.all().filter(n=>n.type==='select')[2].props.value,'');
  h.select(1,'200');h.render(props);h.select(2,'2');h.render(props);
  h.all().find(n=>n.type==='textarea').props.onChange({target:{value:'Cambio solicitado'}});h.render(props);
  const save=h.all().find(n=>n.type==='button'&&n.props.children==='Guardar novedad');
  assert.equal(save.props.disabled,false); save.props.onClick(); save.props.onClick();
  assert.equal(posts.length,1,'doble clic no duplica la novedad');
  assert.equal(posts[0].path,'/nomina/cambios-operativos');
  const payload=posts[0].payload;
  assert.equal(payload.contexto_nuevo.institucion_id,'20');assert.equal(payload.contexto_nuevo.sede_id,'200');assert.equal(payload.contexto_nuevo.modalidad_id,'2');
  assert.equal(payload.fecha_inicio_efectiva,'2026-09-10');assert.equal(payload.contexto_anterior.sede_id,'100');
  complete({data:{...payload,id:'77',activo:true}});await h.settle(props);assert.equal(saved.id,'77');
  const employee:any={vinculacion:{fecha_inicio:'2026-01-01',fecha_fin:null},contexto_operativo:{institucion:'Contexto actual distinto'}};
  const projected=buildTramos(employee,'2026-09-01','2026-09-30',JSON.parse(JSON.stringify([saved])));
  assert.equal(projected[0]?.fin,'2026-09-09');assert.equal(projected[0]?.contexto.sede_id,'100');assert.equal(projected[1]?.contexto.sede_id,'200');
});

test('formulario de cambio de modalidad mantiene institución/sede y conserva borrador ante 403/429', async () => {
  for(const status of [403,429]) {
    const h=harness({get:async(path:string)=>({data:path.includes('/opciones')?options:{contexto:base}}),post:async()=>{throw new Error(`HTTP ${status}`);}});
    const props={periodoId:'1',empleadoId:'20',vinculacionId:'10',fecha:'2026-09-10',tipo:'CAMBIO_DE_MODALIDAD',canSave:true,onSaved(){assert.fail('No debe guardar');},onCancel(){}};
    await h.settle(props);
    assert.ok(h.all().filter(n=>n.type==='select').slice(0,2).every(n=>n.props.disabled));
    h.select(2,'2');h.render(props);h.all().find(n=>n.type==='textarea').props.onChange({target:{value:'Motivo conservado'}});h.render(props);
    h.all().find(n=>n.type==='button'&&n.props.children==='Guardar novedad').props.onClick();await h.settle(props);
    assert.equal(h.all().find(n=>n.type==='textarea').props.value,'Motivo conservado');
    assert.ok(h.all().some(n=>n.props?.role==='alert'));
  }
});
