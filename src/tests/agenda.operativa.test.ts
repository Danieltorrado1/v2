import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const service=readFileSync('src/modules/agenda/agenda.service.ts','utf8');
const repo=readFileSync('src/modules/agenda/agenda.repository.ts','utf8');
const routes=readFileSync('src/modules/agenda/agenda.routes.ts','utf8');
const migration=readFileSync('sql/phase-40-agenda-operativa.sql','utf8');
const migration41=readFileSync('sql/phase-41-agenda-cierre-estructurado.sql','utf8');
const router=readFileSync('FrontendNuevo/src/router/AppRouter.tsx','utf8');
const page=readFileSync('FrontendNuevo/src/pages/agenda/AgendaOperativaPage.tsx','utf8');
const routesText=readFileSync('src/modules/agenda/agenda.routes.ts','utf8');
const assignForm=readFileSync('FrontendNuevo/src/pages/agenda/components/AgendaTaskAssignForm.tsx','utf8');

test('Agenda tiene dominio, rutas y almacenamiento independientes de Nómina',()=>{
  assert.doesNotMatch(service,/nomina_movimientos|nomina\.service/); assert.doesNotMatch(routes,/nomina\.routes/);
  assert.match(routes,/requireModule\('AGENDA_OPERATIVA'\)/); assert.match(router,/path="agenda"/); assert.match(page,/Agenda Operativa/);
});
test('Top 3 tiene restricciones explícitas y operación transaccional',()=>{
  assert.match(migration,/agenda_top_tareas/); assert.match(migration,/posicion BETWEEN 1 AND 3/); assert.match(migration,/UNIQUE \(empresa_id, usuario_id, fecha, tarea_id\)/); assert.match(repo,/replaceTop/); assert.match(service,/BEGIN/);
});
test('alcance normal no se amplía mediante filtros',()=>{assert.match(repo,/t\.creador_id=\$\$\{p\.length\} OR t\.responsable_id=\$\$\{p\.length\}/);assert.match(repo,/agenda_tarea_participantes/);assert.match(service,/agenda\.manage/);});
test('transiciones y PATCH general están restringidos',()=>{assert.match(service,/const transitions/);assert.match(service,/AGENDA_TRANSICION_INVALIDA/);assert.match(service,/AGENDA_ASIGNACION_REQUERIDA/);});
test('reprogramación, asignación, seguimientos y cierre conservan historia',()=>{assert.match(migration,/agenda_tarea_asignaciones/);assert.match(migration,/agenda_tarea_seguimientos/);assert.match(migration,/agenda_cierres_diarios/);assert.match(migration,/fecha_anterior/);assert.match(migration,/fecha_nueva/);assert.match(repo,/reschedule/);});
test('migración y permisos son idempotentes y el módulo respeta capacidades',()=>{assert.match(migration,/CREATE TABLE IF NOT EXISTS/g);const seed=readFileSync('src/scripts/seed-agenda-permisos.ts','utf8');assert.match(seed,/ON CONFLICT/);const saas=readFileSync('src/modules/saas/saas.service.ts','utf8');assert.match(saas,/AGENDA_OPERATIVA/);assert.match(saas,/module\.plan_habilitado===true/);});
test('fechas de Agenda usan fecha local colombiana en el cliente',()=>{assert.match(page,/timeZone:'America\/Bogota'/);assert.match(repo,/CURRENT_DATE/);});
test('cierre estructurado y detalle completo conservan alcance',()=>{assert.match(migration41,/agenda_cierre_tareas/);assert.match(migration41,/UNIQUE \(cierre_id, tarea_id, clasificacion\)/);assert.match(repo,/agenda_cierre_tareas/);assert.match(repo,/jsonb_agg/);assert.match(service,/agendaRepository\.detail/);assert.match(page,/TERMINADA/);assert.match(page,/Observaciones/);});
test('semana consulta un rango y abre detalle',()=>{assert.match(page,/length:7/);assert.match(page,/desde:view==='Semana'\?monday/);assert.match(page,/openDetail/);});
test('usuarios asignables se limitan al tenant y el formulario usa solo Agenda',()=>{assert.match(routesText,/usuarios-asignables/);assert.match(routesText,/requireAnyPermissions\('agenda\.create','agenda\.assign','agenda\.update','agenda\.manage'\)/);assert.match(repo,/listAssignableUsers/);assert.match(repo,/ue\.empresa_id=\$1/);assert.match(repo,/COALESCE\(u\.activo,TRUE\)=TRUE/);assert.match(assignForm,/agendaApi\.users/);assert.doesNotMatch(assignForm,/['"]\/users['"]/);});
