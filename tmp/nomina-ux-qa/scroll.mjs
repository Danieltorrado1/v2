import {chromium} from '../nomina-population-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const harness=`import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter,Routes,Route} from 'react-router-dom'; import MainLayout from './src/layouts/MainLayout'; import NominaPage from './src/pages/nomina/NominaPage'; import Detail from './src/pages/nomina/NominaEmpleadoDetallePage'; import Planilla from './src/pages/nomina/PlanillaOperativaPage'; import './src/index.css'; import './src/pages/nomina/NominaPages.css'; createRoot(document.getElementById('root')!).render(<BrowserRouter><Routes><Route element={<MainLayout/>}><Route path='/nomina/gestion' element={<NominaPage/>}/><Route path='/nomina/gestion/:periodoId/empleado/:nominaEmpleadoId' element={<Detail/>}/><Route path='/nomina/planilla-operativa' element={<Planilla/>}/></Route></Routes></BrowserRouter>);`;
const html='<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><script type="module">import RefreshRuntime from "/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><div id="root"></div><script type="module" src="/qa-nomina-final.tsx"></script></body></html>';
await fs.writeFile('FrontendNuevo/qa-nomina-final.tsx',harness);
const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900}});
page.setDefaultTimeout(12000);
const errors=[],writes=[],checks=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
const permissions=['nomina.read','nomina.operativa.read','nomina.dashboard.read','nomina.empleados.import','nomina.novedades.create','nomina.economico.read','nomina.desprendibles.read'];
await page.route('**/nomina/**',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.fallback());
await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`const user={id:1,name:'QA',roles:['TALENTO_HUMANO'],permissions:${JSON.stringify(permissions)}};export const useAuth=()=>({user,logout:()=>{}});`}));
await page.route('**/src/context/CompanyContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useCompanyContext=()=>({empresaId:1,empresasDisponibles:[],empresaActual:null,organizacionActual:null,hasModule:()=>true,setEmpresaActual:()=>{}});`}));
await page.route('**/src/context/ThemeContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useTheme=()=>({theme:'light',toggleTheme:()=>{}});`}));
const periods=[9,8].map(id=>({id:String(id),nombre_periodo:id===9?'SEPTIEMBRE 2026':'AGOSTO 2026',fecha_inicio:`2026-0${id}-01`,fecha_fin:`2026-0${id}-${id===9?30:31}`,estado:'ABIERTO',activo:true,contrato_id:'1',tipo_periodo:'MENSUAL'}));
const employee=(month,index)=>({id:String(month*100+index),periodo_id:String(month),vinculacion_id:String(month*100+index),activo:true,revisado:false,estado:'PENDIENTE',persona:{id:String(index),nombre_completo:`Persona ${month} ${String(index).padStart(3,'0')}`,numero_documento:String(index)},vinculacion:{id:String(index),contrato_id:'1',cotiza_pension:true,fecha_inicio:'2026-01-01',fecha_fin:null},cargo:{nombre_cargo:'Docente'},dias_pagados:30,dias_periodo:30,total_adiciones:1234567,total_deducciones:12345,neto_pagar:1222222,salud:2345,pension:10000,devengado_basico:1000000,devengado_transporte:200000,devengado_otros:34567,detalle_calculo:{dias:{salario:30,transporte:29,recargos:28,base:30},componentes:{recargos_ordinarios:34567,otros_devengos_reales:0}},created_at:'2026-09-01T00:00:00Z'});
let septLoaded=true,eligible=750,employeeError=false;
const paged=items=>({items,pagination:{page:1,limit:500,total:items.length,total_pages:1}});
const novedad=(id,ne)=>({id:String(id),nomina_empleado_id:String(ne),periodo_id:'9',vinculacion_id:String(ne),tipo_novedad:{nombre:'PERMISO',codigo_operativo:'PR1'},persona:{nombre_completo:'Persona 9 026',numero_documento:'26'},fecha_inicio:'2026-09-03',fecha_fin:'2026-09-03',dias:1,activo:true,revisado:false,observacion:`Observacion ${id}`,documento_persona_id:null});
await page.route('**/api/**',async r=>{
 const u=new URL(r.request().url()),p=u.pathname; let data=paged([]);
 const month=Number(p.match(/periodos\/(\d+)/)?.[1]||u.searchParams.get('periodo_id')||9);
 if(r.request().method()!=='GET')writes.push({path:p,body:r.request().postDataJSON()});
 if(p.endsWith('/periodos'))data=periods;
 else if(/periodos\/\d+$/.test(p))data=periods.find(x=>Number(x.id)===month);
 else if(p.endsWith('/dashboard'))data={empleados_total:month===9&&!septLoaded?0:771,empleados_disponibles:eligible,total_devengado:1234567890123,total_neto:1123456789012,ingresos:3,retiros:2};
 else if(p.endsWith('/empleados')||p.endsWith('/empleados-operativos')){
  if(employeeError)return r.fulfill({status:500,json:{success:false,message:'Fallo QA controlado'}});
  data=paged(month===9&&!septLoaded?[]:Array.from({length:771},(_,i)=>employee(month,i+1)));
 }
 else if(p.endsWith('/novedades'))data=paged(month===9?[novedad(1,926),novedad(2,926),novedad(3,927)]:[]);
 else if(p.endsWith('/ajustes-manuales'))data=[{id:'1',nomina_empleado_id:'926',periodo_id:'9',tipo:'DEDUCCION',concepto:'DEDUCCION_ADICIONAL_FINAL',valor:123,activo:true,created_by:'7',created_at:'2026-09-03',updated_at:'2026-09-04'}];
 else if(p.endsWith('/revision-operativa'))data=[{nomina_empleado_id:'926',periodo_id:'9',estado_revision:'REVISADO',revisado_por:'7',revisado_at:'2026-09-04'}];
 else if(p.endsWith('/novedad-turnos-operativos')){const pg=Number(u.searchParams.get('page')||1);data={items:[{id:String(pg),nomina_empleado_id:'926',periodo_id:'9',tipo_turno:pg===1?'INTERNO':'EXTERNO',fecha:'2026-09-02',trabajador_reemplazado:`Cubierto ${pg}`,modalidad:'CAA',movimiento_valor_aplicado:10000*pg,activo:true,estado:'REGISTRADO'}],pagination:{page:pg,total_pages:2,total:2,limit:1}};}
 else if(p.endsWith('/movimientos'))data=paged([{id:'1',nomina_empleado_id:'926',periodo_id:'9',es_deduccion:true,valor_total:123,descripcion:'Deduccion real',activo:true}]);
 else if(p.includes('/desprendibles/'))data=[];
 else if(p.endsWith('/tipos-novedad'))data={...paged([{id:'1',nombre:'PERMISO',activo:true,requiere_fechas:true}]),total:1};
 else if(p.endsWith('/importar-empleados')){septLoaded=true;data={imported:60,excluded:0,skipped_duplicates:0,requires_review:[]};}
 else if(p.includes('/notificaciones'))data={items:[],total:0,no_leidas:0};
 await r.fulfill({json:{success:true,data}});
});
const cards=()=>page.locator('.nomina-page--period-host > .nomina-payroll-main > .payroll-periods > .payroll-period-card');
try {
 await page.goto('http://127.0.0.1:5177/nomina/gestion?period_id=9');
 await page.getByText('Persona 9 001',{exact:true}).waitFor();
 for(const [width,height] of [[1920,1080],[1600,900],[1366,768]]) {
 await page.setViewportSize({width,height});
 const rows=page.locator('.nomina-payroll-rows-scroll');
 await rows.evaluate(e=>e.scrollTop=0);
 const fixed='.np-flow-nav,.payroll-kpis,.payroll-period-summary,.payroll-filterbar,.payroll-actionbar,.payroll-table-head,.payroll-pagination';
 const before=await page.locator(fixed).evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>[e.className,e.getBoundingClientRect().y]));
 await page.mouse.move(80,180);await page.mouse.wheel(0,800);await page.waitForTimeout(150);
 await rows.hover();await page.mouse.wheel(0,800);await page.waitForTimeout(150);
 assert.ok(await rows.evaluate(e=>e.scrollTop>0));
 await rows.evaluate(e=>e.scrollTop=e.scrollHeight);
 const geometry=await page.evaluate(()=>({scrollers:[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+2&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.className),page:document.querySelector('.page-scroll').scrollTop,doc:document.documentElement.scrollHeight, horizontal:[...document.querySelectorAll('.nomina-page--period-host,.payroll-period-card,.nomina-payroll-rows-scroll')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>e.className)}));
 console.log(width,height,JSON.stringify(geometry));
 assert.equal(geometry.page,0);assert.ok(geometry.doc<=height);assert.deepEqual(geometry.horizontal,[]);assert.deepEqual(geometry.scrollers,['payroll-table-scroll nomina-payroll-rows-scroll']);
 const after=await page.locator(fixed).evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>[e.className,e.getBoundingClientRect().y]));assert.deepEqual(after,before);
 const box=await rows.boundingBox(),last=await rows.locator('.payroll-table-row').last().boundingBox();assert.ok(last.y>=box.y&&last.y+last.height<=box.y+box.height+1);
 const card=await cards().first().boundingBox(),footer=await cards().first().locator('.payroll-pagination').boundingBox();assert.ok(card.y+card.height<height&&footer.y+footer.height<=card.y+card.height);
 await page.screenshot({path:`tmp/nomina-ux-qa/scroll-${width}.png`});
 await rows.evaluate(e=>e.scrollTop=0);const first=await rows.locator('.payroll-table-row').first().boundingBox();assert.ok(first.y>=box.y&&first.y+first.height<=box.y+box.height);
 checks.push(`${width}x${height} PASS`);
 }
 await cards().first().locator('.payroll-pagination').getByRole('button',{name:'2',exact:true}).click();await page.getByText('Persona 9 026',{exact:true}).waitFor();
 const list=page.locator('.nomina-payroll-rows-scroll');await list.evaluate(e=>e.scrollTop=40);
 const prior=await list.evaluate(e=>e.scrollTop);
 await page.getByRole('button',{name:'Ver detalle de Persona 9 026',exact:true}).click();
 await page.locator('.nomina-detail-drawer').waitFor();
 await page.locator('.nomina-detail-drawer-header button').click();
 await page.locator('.nomina-detail-drawer').waitFor({state:'detached'});
 assert.equal(await list.evaluate(e=>e.scrollTop),prior);checks.push('drawer preserves internal scroll PASS');
 await page.getByRole('button',{name:/AGOSTO 2026/}).click();await page.getByText('Persona 8 001',{exact:true}).waitFor();assert.equal(await cards().filter({has:page.locator('.nomina-payroll-rows-scroll')}).count(),1);
 checks.push('pagination and single visual expansion PASS');
 await fs.writeFile('tmp/nomina-ux-qa/scroll-result.json',JSON.stringify({checks,errors,writes},null,2));
} finally {await browser.close();await fs.unlink('FrontendNuevo/qa-nomina-final.tsx');}
