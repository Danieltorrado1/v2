import { chromium } from '../nomina-population-qa/node_modules/playwright-core/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = 'http://127.0.0.1:5178';
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.setDefaultTimeout(12000);
const errors = [], writes = [], requests = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
const permissions = ['dashboard.read','vinculaciones.read','configuracion.read','empresas.read','empresas.create','empresas.update','contratos.read','contratos.create','cargos.read','catalogos.read','usuarios.read','nomina.read','nomina.operativa.read','nomina.dashboard.read','nomina.empleados.import','nomina.novedades.create','nomina.economico.read','nomina.desprendibles.read','nomina.periodos.update','documentos.read','cobertura.read','sst.read','agenda.read','operacion.read','logistica.read'];
let globalAdmin = true;
const organization = { id: 1, codigo: 'QA', nombre: 'Organización QA', estado: 'ACTIVA' };
const companies = [1,2].map(id => ({ id, nombre_empresa: `Empresa QA ${id}`, nit: `90000000${id}`, organizacion: organization, tipo_empresa:'SAS', representante_legal:null, documento_representante:null, telefono:null, correo:null, direccion:null, ciudad:null, departamento:null, activo:true }));
const legacy = { PERSONAL:true, NOMINA:true, COBERTURA:true, REPOSITORIO:true, SST:true, DASHBOARD:true, PORTAL_COLABORADOR:false };
const futureFlags = Object.fromEntries(['AGENDA_OPERATIVA','OPERACION','OPERACION_ESTADISTICAS','OPERACION_INSTITUCIONES','OPERACION_SIMAT','OPERACION_REPORTE_DIARIO','OPERACION_DESCUENTOS_SEMANALES','OPERACION_PLANILLA_FINAL','OPERACION_EVALUACION','LOGISTICA','LOGISTICA_ESTADISTICAS','LOGISTICA_REMISIONES','LOGISTICA_HISTORIAL_REMISIONES','LOGISTICA_INVENTARIO','LOGISTICA_BODEGAS','LOGISTICA_DOCUMENTOS_BODEGA','LOGISTICA_CONDUCTORES_VEHICULOS','SST_DOCUMENTOS','SST_LEGISLACION','SST_RIESGOS','SST_CAPACITACIONES','SST_COMITES','SST_AUDITORIA'].map(code => [code,true]));
let flags = { 1: { ...legacy, ...futureFlags }, 2: { PERSONAL:true, PERSONAL_BASE_DATOS:true, PERSONAL_REPOSITORIO:false, NOMINA:false, SST:false, LOGISTICA:false } };
const caps = id => ({ empresa:{id,nombre:`Empresa QA ${id}`},organizacion:organization,legacy:false,suscripcion:{id,estado:'ACTIVA',fecha_inicio:'2026-09-01',fecha_fin:null,plan:{id:1,codigo:'QA',nombre:'Plan QA'}},modulos:flags[id],modulos_habilitados:Object.keys(flags[id]).filter(key=>flags[id][key]),modulos_deshabilitados:[],modulos_plan:[],overrides:[] });
const contracts = companies.map(company => ({ id:company.id,empresa:{id:company.id,nombre_empresa:company.nombre_empresa},numero_contrato:`C-${company.id}`,entidad_contratante:'Entidad QA',fecha_inicio:'2026-01-01',fecha_finalizacion:null,estado_contractual:'EN_EJECUCION',activo:true,aplica_cobertura:true }));
const modules = Object.keys({...legacy,...futureFlags}).map((codigo,index)=>({id:index+1,codigo,nombre:codigo,descripcion:null,activo:true,orden:index}));
const plans = [{id:1,codigo:'QA',nombre:'Plan QA',descripcion:'Plan de prueba de navegación',precio_base:null,moneda:'COP',periodicidad:'MENSUAL',activo:true,orden:1,modulos:modules.map(item=>({...item,habilitado:true}))}];
const periods=[9,8].map(id=>({id:String(id),nombre_periodo:id===9?'SEPTIEMBRE 2026':'AGOSTO 2026',fecha_inicio:`2026-0${id}-01`,fecha_fin:`2026-0${id}-${id===9?30:31}`,estado:'ABIERTO',activo:true,contrato_id:'1',tipo_periodo:'MENSUAL'}));
const employee=(month,index)=>({id:String(month*1000+index),periodo_id:String(month),vinculacion_id:String(month*1000+index),activo:true,revisado:false,estado:'PENDIENTE',persona:{id:String(index),nombre_completo:`Persona ${month} ${String(index).padStart(3,'0')}`,numero_documento:String(index)},vinculacion:{id:String(index),contrato_id:'1',cotiza_pension:true,fecha_inicio:'2026-01-01',fecha_fin:null},cargo:{nombre_cargo:'Docente'},dias_pagados:30,dias_periodo:30,total_adiciones:1234567,total_deducciones:12345,neto_pagar:1222222,salud:2345,pension:10000,devengado_basico:1000000,devengado_transporte:200000,devengado_otros:34567,detalle_calculo:{dias:{salario:30,transporte:29,recargos:28,base:30},componentes:{recargos_ordinarios:34567,otros_devengos_reales:0}},created_at:'2026-09-01T00:00:00Z'});
const paged = items => ({ items,pagination:{page:1,limit:100,total:items.length,total_pages:1} });
await page.route('**/api/**', async route => {
  const request = route.request(), u = new URL(request.url()), p = u.pathname.replace(/^\/api/,'');
  requests.push({path:p,query:u.search});
  if(request.method() !== 'GET') { writes.push(p); return route.fulfill({status:400,json:{message:'QA read-only'}}); }
  let data=paged([]);
  const companyId=Number(p.match(/companies\/(\d+)/)?.[1]||u.searchParams.get('empresa_id')||1);
  const month=Number(p.match(/periodos\/(\d+)/)?.[1]||u.searchParams.get('periodo_id')||9);
  if(p==='/tenant/me') data={isGlobalAdmin:globalAdmin,organizacionIds:[1],organizaciones:[organization],organizacion_default_id:1,empresaIds:[1,2],empresas:companies,empresa_default_id:1,contratoIds:[1,2],contratos:contracts,contrato_default_id:1};
  else if(p.endsWith('/capabilities')) data=caps(companyId);
  else if(p==='/saas/modules') data=modules;
  else if(p==='/saas/plans') data=plans;
  else if(p==='/saas/companies-summary') data=companies.map(company=>({empresa_id:String(company.id),nombre_empresa:company.nombre_empresa,nit:company.nit,organizacion_nombre:'QA',plan_nombre:'Plan QA',estado_suscripcion:'ACTIVA',modulos_activos:3}));
  else if(p.endsWith('/history')) data={suscripciones:[],overrides:[]};
  else if(p==='/configuracion/empresas') data=paged(companies);
  else if(/^\/configuracion\/empresas\/\d+$/.test(p)) data=companies.find(item=>item.id===Number(p.split('/').at(-1)));
  else if(p==='/configuracion/contratos') data=paged(u.searchParams.has('empresa_id')?contracts.filter(item=>item.empresa.id===companyId):contracts);
  else if(p==='/configuracion/roles') data=[{id:1,nombre_rol:'TALENTO_HUMANO',descripcion:'Gestión de personal',activo:true,permissions:['vinculaciones.read']}];
  else if(p==='/configuracion/permisos'||p==='/admin/usuarios') data=[];
  else if(p.includes('/company-settings/')) data={general:{...companies[companyId-1],pais:'Colombia',zona_horaria:'America/Bogota',moneda:'COP',locale:'es-CO'},modulos:[]};
  else if(p==='/vinculaciones/personal/resumen') data={fecha_consulta:'2026-09-07',trabajadores_activos:771,ingresos_mes:3,retiros_mes:2,vacantes:0};
  else if(p==='/vinculaciones/personal/opciones') data={gestores:[],municipios:[{id:1,nombre:'Municipio QA'}],instituciones:[{id:1,nombre:'Institución QA',municipio_id:1}],sedes:[{id:1,nombre:'Sede QA',institucion_id:1}],modalidades:[],ubicaciones_laborales:[]};
  else if(p.endsWith('/periodos')) data=periods;
  else if(/periodos\/\d+$/.test(p)) data=periods.find(item=>Number(item.id)===month);
  else if(p.endsWith('/dashboard')&&p.includes('nomina')) data={empleados_total:771,empleados_disponibles:771,total_devengado:123456789,total_neto:112345678,ingresos:3,retiros:2};
  else if(p.endsWith('/empleados')||p.endsWith('/empleados-operativos')) data=paged(Array.from({length:771},(_,i)=>employee(month,i+1)));
  else if(p.endsWith('/revision-operativa')||p.endsWith('/ajustes-manuales')||p.includes('/desprendibles/')||p.includes('/procesos/areas')||p.includes('/procesos/usuarios-asignables')) data=[];
  else if(p.endsWith('/tipos-novedad')) data={...paged([]),total:0};
  else if(p.includes('/notificaciones')) data={items:[],total:0,no_leidas:0};
  await route.fulfill({json:{success:true,data}});
});
async function session(admin, userPermissions=permissions) {
  globalAdmin=admin;
  await page.goto(base+'/login');
  await page.evaluate(({admin,permissions})=>{localStorage.setItem('empiria_access_token','qa-local-intercepted');localStorage.setItem('empiria_auth_user',JSON.stringify({id:'1',name:'QA Arquitectura',email:'qa@example.invalid',active:true,roles:[admin?'ADMINISTRADOR':'TALENTO_HUMANO'],permissions}));localStorage.setItem('empiria_empresa_id','1');localStorage.setItem('empiria_theme','light');},{admin,permissions:userPermissions});
}
async function go(path) { await page.goto(base+path); await page.waitForTimeout(220); }
async function noCrash() { assert.equal(await page.getByText('Algo salió mal',{exact:false}).count(),0); assert.equal(errors.length,0,errors.join('\n')); }
try {
  await session(true);await go('/');await page.getByRole('heading',{name:'Dashboard global'}).waitFor();
  assert.equal(await page.locator('.workspace-primary-nav a').count(),5);
  assert.equal(await page.locator('.workspace-primary-nav').getByText('Personal',{exact:true}).count(),0);
  for(const [route,title] of [['/admin-global/empresas','Empresas / Clientes'],['/admin-global/planes','Planes'],['/admin-global/modulos','Catálogo maestro de módulos'],['/admin-global/configuracion','Configuración general']]) {await go(route);await page.getByRole('heading',{name:title,exact:true}).first().waitFor();assert.equal(await page.locator('.workspace-primary-nav a').count(),5);await noCrash();}
  await page.getByRole('button',{name:'Versiones',exact:true}).click();assert.ok((await page.locator('.workspace-page').innerText()).includes('No disponible'));
  await page.screenshot({path:'tmp/architecture-qa/admin-config.png'});
  await go('/admin-global/planes');await page.getByRole('button',{name:'Duplicar',exact:true}).click();await page.getByRole('heading',{name:'Crear plan',exact:true}).waitFor();await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await go('/admin-global/empresas');await page.getByTitle('Ver detalle',{exact:true}).first().click();await page.getByRole('dialog').waitFor();assert.equal(await page.locator('dialog .workspace-tabs button').count(),7);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'detached'});
  await page.getByTitle('Entrar a empresa',{exact:true}).first().click();await page.getByRole('heading',{name:'Agenda operativa',exact:true}).waitFor();assert.equal(await page.locator('.workspace-primary-nav a').count(),6);
  checks.push('Admin: five modules, dashboard, companies/profile, plans/duplicate form, catalog, product settings, enter same tenant');
  await session(false);await go('/agenda');await page.getByRole('heading',{name:'Agenda operativa',exact:true}).waitFor();assert.equal(await page.locator('.workspace-primary-nav a').count(),6);
  await page.screenshot({path:'tmp/architecture-qa/company.png'});
  await go('/admin-global');await page.getByRole('heading',{name:'Acceso no disponible'}).waitFor();
  await go('/personal/estadisticas');await page.getByLabel('Contrato',{exact:true}).selectOption('1');await page.getByText('771',{exact:true}).waitFor();
  await go('/operacion/instituciones');await page.getByLabel('Contrato',{exact:true}).selectOption('1');await page.getByText('Institución QA',{exact:true}).waitFor();
  for(const route of ['/operacion/simat','/logistica/remisiones','/sst/clasificacion','/configuracion/roles']) {await go(route);await page.locator('.workspace-heading h1').waitFor();await noCrash();}
  await go('/personal/estadisticas');await page.getByLabel('Empresa activa',{exact:true}).selectOption('2');await page.waitForTimeout(250);
  assert.equal(await page.locator('.workspace-primary-nav').getByText('Logística',{exact:true}).count(),0);
  assert.equal(await page.locator('.workspace-secondary-nav').getByText('Repositorio',{exact:true}).count(),0);
  await go('/repositorio');await page.getByRole('heading',{name:'Acceso no disponible'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('empiria_empresa_id')),'2');
  checks.push('Tenant: six enabled modules; real CompanyProvider switching; disabled module/submodule hidden; global and legacy direct URLs guarded; contract-scoped statistics/institutions');
  await session(false,['vinculaciones.read']);await go('/agenda');await page.getByRole('heading',{name:'Acceso no disponible'}).waitFor();assert.equal(await page.locator('.workspace-primary-nav').getByText('Agenda operativa',{exact:true}).count(),0);
  checks.push('RBAC: enabled feature without permission is hidden and denied');
  await session(false);
  await go('/nomina/gestion?period_id=9');await page.getByText('Persona 9 001',{exact:true}).waitFor();
  for(const [width,height] of [[1920,1080],[1600,900],[1366,768]]) {
    await page.setViewportSize({width,height});
    const rows=page.locator('.nomina-payroll-rows-scroll');await rows.evaluate(e=>e.scrollTop=0);
    const fixed='.workspace-secondary-nav,.np-flow-nav,.payroll-kpis,.payroll-period-summary,.payroll-filterbar,.payroll-actionbar,.payroll-table-head,.payroll-pagination';
    const before=await page.locator(fixed).evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>[e.className,e.getBoundingClientRect().y]));
    await page.mouse.move(80,180);await page.mouse.wheel(0,800);await page.waitForTimeout(100);
    await rows.hover();await page.mouse.wheel(0,800);await page.waitForTimeout(100);assert.ok(await rows.evaluate(e=>e.scrollTop>0));
    await rows.evaluate(e=>e.scrollTop=e.scrollHeight);
    const after=await page.locator(fixed).evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().height).map(e=>[e.className,e.getBoundingClientRect().y]));assert.deepEqual(after,before);
    const geometry=await page.evaluate(()=>({scrollers:[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+2&&['auto','scroll'].includes(getComputedStyle(e).overflowY)).map(e=>e.className),page:document.querySelector('.page-scroll').scrollTop,doc:document.documentElement.scrollHeight,horizontal:document.documentElement.scrollWidth>innerWidth}));
    assert.equal(geometry.page,0);assert.ok(geometry.doc<=height);assert.equal(geometry.horizontal,false);assert.deepEqual(geometry.scrollers,['payroll-table-scroll nomina-payroll-rows-scroll']);
    const kpi=await page.locator('.payroll-kpis').boundingBox();const lastKpi=await page.locator('.payroll-kpi').last().boundingBox();assert.ok(lastKpi.y+lastKpi.height<=kpi.y+kpi.height+1&&lastKpi.y+lastKpi.height<height);
    const footer=await page.locator('.payroll-pagination').boundingBox();assert.ok(footer.y+footer.height<height);
    await page.screenshot({path:`tmp/architecture-qa/payroll-${width}.png`});
  }
  const rows=page.locator('.nomina-payroll-rows-scroll');await rows.evaluate(e=>e.scrollTop=0);await page.getByRole('button',{name:'Ver detalle de Persona 9 001',exact:true}).click();await page.locator('.nomina-detail-drawer').waitFor();await page.locator('.nomina-detail-drawer-header button').click();await page.locator('.nomina-detail-drawer').waitFor({state:'detached'});assert.equal(await rows.evaluate(e=>e.scrollTop),0);
  checks.push('Payroll: 771 mocked employees; fixed shell/headers/footer, rows-only scroll at 1920/1600/1366, drawer preserved');
  for(const route of ['/personal/base-datos','/personal/repositorio','/personal/cobertura','/nomina/planilla-operativa','/nomina/turnos','/nomina/novedades','/nomina/liquidacion']) {await go(route);await page.waitForTimeout(200);await noCrash();assert.equal(await page.getByRole('heading',{name:'Acceso no disponible'}).count(),0,route);checks.push(`Existing route mounted: ${route}`);}
  await go('/agenda');await page.setViewportSize({width:390,height:844});await page.screenshot({path:'tmp/architecture-qa/mobile.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('.theme-button').click();await page.screenshot({path:'tmp/architecture-qa/alternate-theme.png'});
  await noCrash();assert.deepEqual(writes,[]);
  await fs.writeFile('tmp/architecture-qa/browser-result.json',JSON.stringify({checks,errors,writes,requests},null,2));console.log(JSON.stringify({checks,errors,writes},null,2));
} catch(error) {await page.screenshot({path:'tmp/architecture-qa/error.png'});console.log((await page.locator('body').innerText()).slice(0,2500));console.log('page errors',errors);throw error;}
finally {await browser.close();}
