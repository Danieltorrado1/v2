import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path:string)=>readFileSync(path,'utf8');
const admin=read('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaProcesosTab.tsx');
const grid=read('FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.css');
const personal=read('FrontendNuevo/src/pages/personal/PersonalPage.tsx');
const routes=read('src/modules/vinculaciones/vinculaciones.routes.ts');
const service=read('src/modules/vinculaciones/vinculaciones.personal.service.ts');
const processService=read('src/modules/nomina/nomina.procesos.ts');

test('4B.9 asignaciones usa personas y nombres humanos, no inputs de ids',()=>{
 for(const value of ['Asignaciones de Nómina','+ Asignar usuario','Buscar usuario por nombre o correo','Municipios que puede gestionar','Áreas que puede gestionar'])assert.ok(admin.includes(value),value);
 assert.doesNotMatch(admin,/placeholder=["'][^"']*(usuario_id|municipio_id|area_id)/i);
});
test('4B.9 permite combinaciones, edición, retiro y NINGUNO sin derivar roles',()=>{
 for(const value of ['COBERTURA','ASISTENCIA','OPS','Editar','Quitar asignación','Sin asignación de nómina'])assert.ok(admin.includes(value),value);
 assert.doesNotMatch(processService,/rol.*COBERTURA|GESTOR.*responsable/i);
});
test('4B.9 conserva scopes backend de cobertura y asistencia',()=>{
 assert.match(processService,/appendNominaCoberturaScope/);assert.match(processService,/nomina_responsabilidad_municipios/);assert.match(processService,/nomina_responsabilidad_areas/);
});
test('4B.9 cuadrícula muestra líneas verticales, horizontales y separación de contexto',()=>{
 assert.match(grid,/\.op-row > \*:not\(:last-child\)/);assert.match(grid,/border-bottom: 1px solid color-mix/);assert.match(grid,/\.op-row > :nth-child\(3\)/);
});
test('4B.9 Personal usa un formulario con selectores dependientes buscables',()=>{
 for(const value of ['INFORMACIÓN PERSONAL','ASIGNACIÓN OPERATIVA','Buscar institución','Buscar sede','setInstitucion(\'\')','setSede(\'\')'])assert.ok(personal.includes(value),value);
});
test('4B.9 corrección Personal es versionada, auditada y tenant scoped',()=>{
 assert.match(routes,/vinculaciones\.update/);assert.match(service,/assertTenantAccessForVinculacionId/);assert.match(service,/activo=FALSE,fecha_fin/);assert.match(service,/PERSONAL_ASIGNACION_OPERATIVA_UPDATE/);assert.match(service,/focalizacion_final.*contrato_id/);
});
test('4B.9 no sobrescribe modalidad histórica y orienta a Cambio Operativo',()=>assert.match(personal,/Para cambios efectivos por fecha usa Cambio Operativo/));
