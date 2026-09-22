import test from 'node:test';
import assert from 'node:assert/strict';
import { contextualPersonalOptions } from './personalOperationalFilters';
import type { ContractPersonalFilterOptions } from '../../types/vinculaciones.types';
const rows = [[1,10,100],[1,10,101],[1,11,102],[2,20,200]].map(([municipio_id,institucion_id,sede_id],id)=>({id,municipio_id,institucion_id,sede_id,municipio:'M',institucion:'I',sede:'S',modalidad_id:null,modalidad:''}));
const catalog: ContractPersonalFilterOptions = { gestores:[], modalidades:[], ubicaciones_laborales:[], asignaciones_operativas:rows,
 municipios:[1,2].map(id=>({id,nombre:`M${id}`,departamento_id:null,departamento_nombre:null})),
 instituciones:[10,11,20].map(id=>({id,nombre:`I${id}`,municipio_id:id===20?2:1})),
 sedes:[100,101,102,200].map(id=>({id,nombre:`S${id}`,institucion_id:id===200?20:id===102?11:10})) };
for (const selected of [{municipio_id:'1'},{institucion_id:'10'},{sede_id:'100'},{municipio_id:'1',institucion_id:'10'},{municipio_id:'1',sede_id:'100'},{institucion_id:'10',sede_id:'100'},{municipio_id:'1',institucion_id:'10',sede_id:'100'}]) {
 test(`opciones autónomas y AND ${JSON.stringify(selected)}`,()=>{
 const result=contextualPersonalOptions(catalog,selected);
 for(const [dimension,list] of [['municipio_id','municipios'],['institucion_id','instituciones'],['sede_id','sedes']] as const){
 const expected=new Set(rows.filter(row=>Object.entries(selected).every(([key,value])=>key===dimension||String(row[key as keyof typeof row])===value)).map(row=>row[dimension]));
 assert.deepEqual(result[list].map(o=>o.id),catalog[list].filter(o=>expected.has(o.id)).map(o=>o.id));
 }
 });
}
test('catálogo completo sin filtros, instituciones y sedes se reducen por contexto',()=>{
 assert.deepEqual(contextualPersonalOptions(catalog,{}),catalog);
 assert.deepEqual(contextualPersonalOptions(catalog,{municipio_id:'1'}).instituciones.map(o=>o.id),[10,11]);
 assert.deepEqual(contextualPersonalOptions(catalog,{municipio_id:'1',institucion_id:'10'}).sedes.map(o=>o.id),[100,101]);
});
test('incompatibilidad conserva selecciones sin mutación ni cascadas',()=>{
 const selected={municipio_id:'2',sede_id:'100'};const copy=structuredClone(selected);
 for(let n=0;n<20;n++){const result=contextualPersonalOptions(catalog,selected);assert.ok(result.sedes.some(o=>o.id===100));assert.ok(result.municipios.some(o=>o.id===2));}
 assert.deepEqual(selected,copy);
});
import { readFileSync } from 'node:fs';
test('integración visual y red conservan filtros independientes y resumen batch',()=>{
 const base=readFileSync('FrontendNuevo/src/pages/personal/OperationalPersonalPage.tsx','utf8');
 const repo=readFileSync('FrontendNuevo/src/pages/personal/PersonalRepositoryPanel.tsx','utf8');
 const css=readFileSync('FrontendNuevo/src/pages/personal/OperationalPersonalPage.css','utf8');
 const api=readFileSync('FrontendNuevo/src/services/personalRepositoryApi.ts','utf8');
 assert.match(base,/op-sede-name/); assert.match(base,/title=\{item.asignacion_actual.institucion/);
 assert.match(css,/-webkit-line-clamp: 2; white-space: normal/);
 assert.match(repo,/aria-label="Sede del repositorio"/);assert.match(repo,/sede_id: sede \? Number\(sede\)/);
 assert.doesNotMatch(base,/disabled=\{!contratoId \|\| !(municipioId|institucionId|sedeId)\}/);
 assert.match(base,/controller.signal/);assert.match(repo,/controller.signal/);
 assert.match(api,/documentos\/repositorio\/resumen/);assert.doesNotMatch(api,/\/checklist/);
 assert.doesNotMatch(base,/\[contratoId, fechaConsulta, municipioId/);
 assert.doesNotMatch(repo,/\[contratoId, municipio, refresh\]/);
});
