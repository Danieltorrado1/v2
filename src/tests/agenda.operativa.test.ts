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
const agendaDomain=readFileSync('FrontendNuevo/src/pages/agenda/agendaOperativa.domain.ts','utf8');
const participantsForm=readFileSync('FrontendNuevo/src/pages/agenda/components/AgendaTaskParticipantsForm.tsx','utf8');
const agendaApi=readFileSync('FrontendNuevo/src/services/agendaApi.ts','utf8');
const rescheduleForm=readFileSync('FrontendNuevo/src/pages/agenda/components/AgendaTaskRescheduleForm.tsx','utf8');
const cancelForm=readFileSync('FrontendNuevo/src/pages/agenda/components/AgendaTaskCancelForm.tsx','utf8');

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
test('fechas de Agenda usan fecha local colombiana en el cliente',()=>{assert.match(page,/timeZone:\s*'America\/Bogota'/);assert.match(repo,/CURRENT_DATE/);});
test('cierre diario recupera y guarda resumen, observaciones y tareas estructuradas',()=>{
  assert.match(migration41,/agenda_cierre_tareas/);assert.match(migration41,/UNIQUE \(cierre_id, tarea_id, clasificacion\)/);assert.match(repo,/agenda_cierre_tareas/);assert.match(repo,/jsonb_agg/);assert.match(service,/agendaRepository\.detail/);
  assert.match(page,/agendaApi\.getCloseDay/);assert.match(page,/agendaApi\.closeDay/);assert.match(page,/Resumen del día/);assert.match(page,/Observaciones/);
  assert.match(agendaDomain,/resumen_dia: input\.resumen_dia/);assert.match(agendaDomain,/observaciones: input\.observaciones/);
  assert.match(agendaDomain,/task\.clasificacion === 'TERMINADA'/);assert.match(agendaDomain,/task\.clasificacion === 'PENDIENTE'/);assert.match(agendaDomain,/task\.clasificacion === 'REPROGRAMADA'/);
  assert.match(agendaDomain,/String\(task\.tarea_id\), task\.clasificacion/);assert.match(page,/setCloseError\(err instanceof Error/);
});
test('semana consulta un rango, muestra siete fechas y separa tareas sin hora',()=>{
  assert.match(agendaDomain,/Array\.from\(\{ length: 7 \}/);assert.match(agendaDomain,/value\.getFullYear\(\)/);assert.match(agendaDomain,/new Date\(year!, month! - 1, day! \+ amount\)/);
  assert.match(agendaDomain,/task\.fecha_prevista === date && Boolean\(task\.hora_inicio\)/);assert.match(agendaDomain,/task\.fecha_prevista === date && !task\.hora_inicio/);
  assert.match(page,/desde: week, hasta: addDays\(week, 6\)/);assert.match(page,/agendaApi\.list/);assert.match(page,/Semana anterior/);assert.match(page,/Semana siguiente/);assert.match(page,/Volver a hoy/);assert.match(page,/open\(task\.id\)/);
});
test('usuarios asignables se limitan al tenant y el formulario usa solo Agenda',()=>{assert.match(routesText,/usuarios-asignables/);assert.match(routesText,/requireAnyPermissions\('agenda\.create','agenda\.assign','agenda\.update','agenda\.manage'\)/);assert.match(repo,/listAssignableUsers/);assert.match(repo,/ue\.empresa_id=\$1/);assert.match(repo,/COALESCE\(u\.activo,TRUE\)=TRUE/);assert.match(assignForm,/agendaApi\.users/);assert.doesNotMatch(assignForm,/['"]\/users['"]/);});

test('formulario carga participantes actuales y obtiene candidatos solo de usuarios asignables activos',()=>{
  assert.match(participantsForm,/agendaApi\.users<any>\(/);
  assert.match(participantsForm,/limit:\s*100/);
});
test('responsable principal queda identificado y excluido de selección',()=>{
  assert.match(participantsForm,/Responsable · no seleccionable/);
});
test('agregar y retirar participantes modifica el borrador local sin duplicados',()=>{
  assert.match(participantsForm,/setIds\(\(current\) => addParticipant/);
  assert.match(participantsForm,/setIds\(\(current\) => removeParticipant/);
});
test('guardar permite lista vacía y envía el conjunto final una sola vez',()=>{
  assert.equal((participantsForm.match(/agendaApi\.participants\(task\.id/g)??[]).length,1);
  assert.match(agendaApi,/participants:.*apiClient\.put.*\/participantes.*\{participantes\}/);
});
test('se rechazan duplicados y responsable también en validación local',()=>{
  assert.match(participantsForm,/participantPayload\(ids, responsibleId\)/);
});
test('Administrar participantes se oculta sin update ni manage',()=>{
  assert.match(page,/user\?\.permissions\.includes\('agenda\.update'\) \|\| user\?\.permissions\.includes\('agenda\.manage'\)/);
  assert.match(page,/Administrar participantes/);
  assert.match(routesText,/router\.put\('\/tareas\/:id\/participantes',requireAnyPermissions\('agenda\.update','agenda\.manage'\)/);
});
test('búsqueda explícita tiene debounce y descarta respuestas viejas',()=>{
  assert.match(participantsForm,/setTimeout\(\(\) => \{/);
  assert.match(participantsForm,/}, 300\)/);
  assert.match(participantsForm,/version === requestVersionRef\.current/);
});
test('doble envío queda bloqueado y el error conserva el borrador para reintentar',()=>{
  assert.match(participantsForm,/if \(savingRef\.current\) return/);
  assert.match(participantsForm,/catch \(value\) \{\s*setError\(requestError\(value\)\);/);
  assert.match(participantsForm,/Reintentar/);
  assert.match(participantsForm,/error\.status === 429/);
  assert.doesNotMatch(participantsForm,/clearAuthSession/);
});
test('éxito actualiza el detalle y el historial del drawer sin recargar la lista',()=>{
  assert.match(page,/afterParticipants/);
  assert.match(page,/setNotice\('Participantes actualizados'\)/);
  assert.match(page,/detail\.seguimientos\?\.map/);
});
test('participantes sin guardar requieren confirmación al cancelar, cerrar o abrir otra tarea',()=>{
  assert.match(participantsForm,/Hay cambios sin guardar/);
  assert.match(page,/Hay cambios sin guardar en el formulario\. ¿Descartarlos y abrir otra tarea\?/);
  assert.match(page,/Hay cambios sin guardar en el formulario\. ¿Descartarlos y cerrar la tarea\?/);
});
test('detalle muestra rol de participantes actuales desde el backend',()=>{
  assert.match(repo,/jsonb_build_object\('id',p\.usuario_id,'nombre',pu\.nombre_completo,'rol'/);
  assert.match(participantsForm,/participant\.rol \?\? user\?\.rol/);
});
test('reprogramar y cancelar usan sus endpoints, schemas y permisos específicos',()=>{
  assert.match(routesText,/router\.post\('\/tareas\/:id\/reprogramar',requireAnyPermissions\('agenda\.update','agenda\.manage'\)/);
  assert.match(routesText,/router\.post\('\/tareas\/:id\/cancelar',requireAnyPermissions\('agenda\.cancel','agenda\.manage'\)/);
  assert.match(readFileSync('src/modules/agenda/agenda.schemas.ts','utf8'),/rescheduleSchema = z\.object\(\{ fecha_prevista:date, fecha_limite:date\.optional\(\)\.nullable\(\), motivo:z\.string\(\)\.trim\(\)\.min\(3\)/);
  assert.match(readFileSync('src/modules/agenda/agenda.schemas.ts','utf8'),/cancelSchema = z\.object\(\{ motivo:z\.string\(\)\.trim\(\)\.min\(3\)/);
  assert.match(agendaApi,/reschedule:.*apiClient\.post.*\/reprogramar/);
  assert.match(agendaApi,/cancel:.*apiClient\.post.*\/cancelar/);
  assert.match(rescheduleForm,/agendaApi\.reschedule\(task\.id, prepared\.payload\)/);
  assert.match(cancelForm,/agendaApi\.cancel\(task\.id, prepared\.payload\)/);
  assert.doesNotMatch(rescheduleForm,/agendaApi\.update/);
  assert.doesNotMatch(cancelForm,/agendaApi\.update/);
});
test('reprogramar y cancelar no cambian estado mediante PATCH general',()=>{
  assert.match(rescheduleForm,/agendaApi\.reschedule/);
  assert.match(cancelForm,/agendaApi\.cancel/);
  assert.match(page,/canRescheduleAgendaTask\(detail\.estado/);
  assert.match(page,/canCancelAgendaTask\(detail\.estado/);
  assert.match(readFileSync('src/modules/agenda/agenda.service.ts','utf8'),/if\(input\.estado\)throw new AppError\('Use el endpoint de transici/);
});
test('error y doble envío conservan borradores y muestran reintento en ambos formularios',()=>{
  for(const form of [rescheduleForm,cancelForm]){
    assert.match(form,/if \(savingRef\.current\) return/);
    assert.match(form,/catch \(value\)/);
    assert.match(form,/Reintentar/);
    assert.match(form,/status === 429/);
    assert.match(form,/Hay cambios sin guardar/);
    assert.doesNotMatch(form,/clearAuthSession/);
  }
});
test('éxito de reprogramar y cancelar actualiza lista, resumen, detalle e historiales sin cambiar vista',()=>{
  assert.match(page,/afterTaskAction/);
  assert.match(page,/Promise\.all\(\[agendaApi\.get<Detail>\(taskId\), load\(\)\]\)/);
  assert.match(page,/setNotice\(message\)/);
  assert.match(page,/detail\.reprogramaciones\?\.map/);
  assert.match(page,/detail\.seguimientos\?\.map/);
  assert.match(page,/Motivo de cancelación:/);
});
