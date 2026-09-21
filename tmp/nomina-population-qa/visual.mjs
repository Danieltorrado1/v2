import { chromium } from './node_modules/playwright-core/index.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
// Run after starting FrontendNuevo Vite on port 5177. All API traffic is intercepted.
await fs.writeFile('FrontendNuevo/qa-nomina.html', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div><script type="module" src="/qa-nomina.tsx"></script></body></html>');
await fs.writeFile('FrontendNuevo/qa-nomina.tsx', `import React from 'react'; import {createRoot} from 'react-dom/client'; import {BrowserRouter} from 'react-router-dom'; import NominaPage from './src/pages/nomina/NominaPage'; import Planilla from './src/pages/nomina/PlanillaOperativaPage'; import './src/index.css'; createRoot(document.getElementById('root')!).render(<BrowserRouter><div style={{height:'100vh',padding:16,boxSizing:'border-box'}}>{location.search.includes("planilla") ? <Planilla /> : <NominaPage />}</div></BrowserRouter>);`);
const browser = await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[]; const writes=[];
page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message);});
await page.route('**/src/context/AuthContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useAuth=()=>({user:{roles:['TALENTO_HUMANO'],permissions:['nomina.empleados.import','nomina.novedades.create','nomina.economico.read']}});`}));
await page.route('**/src/context/CompanyContext.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export const useCompanyContext=()=>({empresaId:1});`}));
const periods=[{id:9,nombre_periodo:'SEPTIEMBRE 2026',fecha_inicio:'2026-09-01',fecha_fin:'2026-09-30',estado:'ABIERTO',activo:true,contrato_id:'1'}, {id:8,nombre_periodo:'AGOSTO 2026',fecha_inicio:'2026-08-01',fecha_fin:'2026-08-31',estado:'ABIERTO',activo:true,contrato_id:'1'}];
const employee=(month,id)=>({id:String(id),periodo_id:String(month),vinculacion_id:String(id),activo:true,revisado:false,estado:'PENDIENTE',persona:{id:String(id),nombre_completo:`Persona ${month} ${id}`,numero_documento:String(id)},vinculacion:{id:String(id),contrato_id:'1',cotiza_pension:true},dias_pagados:30,dias_periodo:30,total_adiciones:1234567,total_deducciones:12345,neto_pagar:1222222,salud:0,pension:0,devengado_basico:0,devengado_transporte:0,detalle_calculo:null});
let septLoaded=false;
const paged=items=>({items,pagination:{page:1,limit:1000,total:items.length,total_pages:1}});
await page.route('**/api/**', async r=>{
 const u=new URL(r.request().url()); const p=u.pathname; let data=paged([]);
 const month=Number(p.match(/periodos\/(\d+)/)?.[1]||9);
 if(r.request().method()!=='GET') writes.push({path:p,method:r.request().method()});
 if(p.endsWith('/periodos')) data=periods;
 else if(/periodos\/\d+$/.test(p)) data=periods.find(x=>x.id===month);
 else if(p.endsWith('/dashboard')) data={empleados_total:month===9&&!septLoaded?0:2,empleados_disponibles:750,empleados_revisados:1,empleados_pendientes:1,total_devengado:1234567890123,total_neto:1123456789012,total_novedades:0,total_dias_novedades:0,ingresos:month===9?3:7,retiros:month===9?2:4};
 else if(p.endsWith('/empleados')) data=paged(month===9&&!septLoaded?[]:[employee(month,month*10+1),employee(month,month*10+2)]);
 else if(p.endsWith('/ajustes-manuales') || p.endsWith('/revision-operativa')) data=[];
 else if(p.endsWith('/tipos-novedad')) data={...paged([{id:'1',nombre:'PERMISO',activo:true,requiere_fechas:true}]),total:1};
 else if(p.endsWith('/importar-empleados')) {septLoaded=true;data={imported:1,excluded:0,skipped_duplicates:2,requires_review:[]};}
 await r.fulfill({json:{success:true,data}});
});
try {
 await page.goto('http://127.0.0.1:5177/qa-nomina.html');
 await page.getByRole('button',{name:'CARGAR PERSONAL'}).click();
 await page.getByText('Persona 9 91',{exact:true}).waitFor();
 await page.getByRole('button',{name:/AGOSTO 2026/}).click();
 await page.getByText('Persona 8 81',{exact:true}).waitFor();
 const cards=page.locator('.nomina-page--period-host > .nomina-payroll-main > .payroll-periods > .payroll-period-card');
 assert.equal(await cards.count(),2);
 assert.ok((await cards.nth(0).innerText()).includes('Persona 9 91'));
 assert.ok(!(await cards.nth(0).innerText()).includes('Persona 8 81'));
 assert.ok((await cards.nth(1).innerText()).includes('Persona 8 81'));
 await cards.nth(0).getByRole('button',{name:'Ver detalle de Persona 9 91'}).click();
 await cards.nth(1).getByRole('button',{name:'Ver detalle de Persona 8 81'}).click();
 assert.equal(await page.locator('.payroll-table-row-detail').count(),2);
 await cards.nth(1).getByRole('button',{name:'ACTUALIZAR PERSONAL'}).click();
 await cards.nth(1).getByText(/Personal actualizado/).waitFor();
 assert.deepEqual(writes,[{path:'/api/nomina/periodos/9/importar-empleados',method:'POST'},{path:'/api/nomina/periodos/8/importar-empleados',method:'POST'}]);
 await page.getByRole('button',{name:'Ocultar detalle de Persona 9 91'}).click();
 await page.getByRole('button',{name:'Ocultar detalle de Persona 8 81'}).click();
 const clipping=await cards.evaluateAll(items=>items.map(e=>({height:e.clientHeight,content:e.scrollHeight})));
 assert.ok(clipping.every(item=>item.content<=item.height+2),JSON.stringify(clipping));
 await page.evaluate(()=>document.querySelector('.nomina-page--period-host > .nomina-payroll-main > .payroll-periods').scrollTop=0);
 await page.screenshot({path:'tmp/nomina-population-qa/desktop.png',fullPage:true});
 const dimensions=[];
 for(const width of [1440,1024,768,390]) {
  await page.setViewportSize({width,height:1000});
  const result=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,kpis:[...document.querySelectorAll('.payroll-kpi-body')].map(e=>({text:e.textContent,width:e.clientWidth,scroll:e.scrollWidth})),tables:[...document.querySelectorAll('.payroll-table-scroll')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth})),sidebar:document.querySelector('.payroll-kpis').getBoundingClientRect().width}));
  dimensions.push(result);
  assert.ok(result.scroll<=width,JSON.stringify(result));
  assert.ok(result.tables.every(k=>k.scroll<=k.width),JSON.stringify(result));
  assert.ok(result.kpis.every(k=>k.scroll<=k.width),JSON.stringify(result));
 }
 await page.evaluate(()=>{document.querySelector('.nomina-page--period-host > .nomina-payroll-main > .payroll-periods').scrollTop=0;document.querySelector('.nomina-page--period-host').scrollTop=0;});
 await page.screenshot({path:'tmp/nomina-population-qa/mobile.png',fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));
 await page.goto('http://127.0.0.1:5177/qa-nomina.html?planilla=1&period_id=9');
 await page.getByText('Persona 9 91',{exact:true}).first().waitFor();
 assert.ok((await page.locator('body').innerText()).includes('SEPTIEMBRE 2026'));
 assert.equal(errors.length,0,errors.join('\n'));
 await fs.writeFile('tmp/nomina-population-qa/visual.json',JSON.stringify({pass:true,dimensions,writes},null,2));
 console.log(JSON.stringify({pass:true,dimensions,writes}));
} catch(e) {console.log((await page.locator('body').innerText()).slice(0,3000)); await page.screenshot({path:'tmp/nomina-population-qa/error.png',fullPage:true});throw e;} finally {await browser.close();await fs.unlink("FrontendNuevo/qa-nomina.html");await fs.unlink("FrontendNuevo/qa-nomina.tsx");}
