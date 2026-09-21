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
  else if(p==='/vinculaciones/personal') data=paged([{vinculacion_id:1,numero_documento:'100',nombre_completo:'Persona Expediente QA',gestor_actual:null,cargo:{nombre_cargo:'Docente'},estado_vinculacion:'ACTIVA',fecha_ingreso:'2026-01-01',asignacion_actual:{nombre:null,institucion:null,municipio_id:null,municipio:null,sede:null,modalidad:null},presentada_licitacion_actual:false,perfil_licitacion_actual:null}]);
  else if(p==='/vinculaciones/1/expediente') data={vinculacion:{id:1,persona_id:1,empresa_id:1,contrato_id:1,tipo_vinculacion_id:1,contrato_cargo_id:1,estado_vinculacion:'ACTIVA',fecha_inicio:'2026-01-01',fecha_fin:null,activo:true},persona:{id:1,nombre_completo:'Persona Expediente QA',numero_documento:'100',primer_nombre:'Persona',primer_apellido:'QA'},empresa:{id:1,nombre_empresa:'Empresa QA 1'},contrato:{id:1,numero_contrato:'C-1'},cargo:{id:1,nombre_cargo:'Docente'},tipo_vinculacion:{id:1,nombre_vinculacion:'Laboral'},documentos_persona:[],documentos_vinculacion:[],checklist:[],afiliaciones:null,personal_contexto:{es_manipuladora:false,asignacion_operativa_actual:null,gestor_actual:null,historial_asignacion_operativa:[],asignacion_laboral_actual:null,historial_asignacion_laboral:[],presentada_licitacion_actual:null,historial_presentacion_licitacion:[]}};
  else if(p==='/personas/1') data={id:1,primer_nombre:'Persona',segundo_nombre:null,primer_apellido:'QA',segundo_apellido:null,numero_documento:'100',activo:true,telefono:null,correo:null};
  else if(p.startsWith('/personas/1/')||p==='/vinculaciones/persona/1') data=[];
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
 await session(false);await go('/personal/base-datos');await page.getByText('Persona Expediente QA',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Ver expediente',exact:false}).first().click();await page.locator('.op-drawer').waitFor();await page.locator('.op-drawer').getByText('Persona QA',{exact:true}).first().waitFor();await page.getByRole('button',{name:'Cerrar ficha'}).click();await page.locator('.op-drawer').waitFor({state:'detached'});await noCrash();checks.push('Personal list and existing Expediente open/close PASS');
 await go('/sst/estadisticas');await page.waitForTimeout(350);await noCrash();assert.ok(page.url().includes('/sst?tab=indicadores'));checks.push('Existing SST statistics route mounted PASS');
 await session(true);await go('/admin-global/empresas');await page.getByTitle('Contratos',{exact:true}).first().click();await page.getByRole('dialog').waitFor();await page.getByRole('dialog').getByText('C-1',{exact:true}).first().waitFor();assert.equal(await page.getByRole('dialog').getByText('C-2',{exact:true}).count(),0);await page.keyboard.press('Escape');checks.push('Company profile contracts scoped PASS');
 await page.screenshot({path:'tmp/architecture-qa/companies.png'});
 await go('/configuracion/contratos');await page.getByText('C-1',{exact:true}).first().waitFor();await page.getByLabel('Empresa activa',{exact:true}).selectOption('2');await page.getByText('C-2',{exact:true}).first().waitFor();assert.equal(await page.getByText('C-1',{exact:true}).count(),0);checks.push('Configuration contracts follow active tenant PASS');
 await session(false);
 flags[1].OPERACION_ESTADISTICAS=false;flags[1].OPERACION_INSTITUCIONES=false;
 await go('/operacion');await page.getByRole('heading',{name:'Verificación SIMAT',exact:true}).waitFor();
 flags[1].CONFIG_EMPRESA_GENERAL=false;
 await go('/configuracion');await page.getByRole('heading',{name:'Contratos',exact:true}).first().waitFor();
 flags[1].SST_INSPECCIONES=false;
 await go('/sst?tab=indicadores');assert.equal(await page.locator('.sst-tabs').getByRole('button',{name:'Inspecciones',exact:true}).count(),0);
 await go('/sst?tab=inspecciones');await page.getByRole('heading',{name:'Acceso no disponible'}).waitFor();
 await go('/nomina/gestion?period_id=9');await page.getByText('Persona 9 001',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Opciones de nómina'}).click();await page.getByRole('menuitem',{name:'Turnos',exact:true}).waitFor();
 checks.push('Dynamic module roots, explicit configuration flags, hidden/denied SST tabs, payroll navigation PASS');
 await noCrash();assert.deepEqual(writes,[]);await fs.writeFile('tmp/architecture-qa/regression-result.json',JSON.stringify({checks,errors,writes},null,2));console.log(JSON.stringify({checks,errors,writes},null,2));
} catch(error) {await page.screenshot({path:'tmp/architecture-qa/regression-error.png'});console.log((await page.locator('body').innerText()).slice(-3500));console.log(errors);throw error;} finally {await browser.close();}
