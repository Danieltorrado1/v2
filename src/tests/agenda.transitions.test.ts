import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(path, 'utf8');
const routes = read('src/modules/agenda/agenda.routes.ts');
const schemas = read('src/modules/agenda/agenda.schemas.ts');
const service = read('src/modules/agenda/agenda.service.ts');
const repository = read('src/modules/agenda/agenda.repository.ts');
const page = read('FrontendNuevo/src/pages/agenda/AgendaOperativaPage.tsx');
const api = read('FrontendNuevo/src/services/agendaApi.ts');
const dialog = read('FrontendNuevo/src/pages/agenda/components/AgendaTaskTransitionConfirm.tsx');
const domain = read('FrontendNuevo/src/pages/agenda/agendaOperativa.domain.ts');

test('rutas mantienen los permisos más restrictivos para iniciar, terminar y reabrir', () => {
  assert.match(routes, /router\.post\('\/tareas\/:id\/iniciar',requirePermissions\('agenda\.update'\)/);
  assert.match(routes, /router\.post\('\/tareas\/:id\/terminar',requirePermissions\('agenda\.complete'\)/);
  assert.match(routes, /router\.post\('\/tareas\/:id\/reabrir',requirePermissions\('agenda\.reopen'\)/);
  assert.match(domain, /agenda\.manage[\s\S]*not accepted/);
  assert.match(page, /canStartAgendaTask\(detail\.estado, user\?\.permissions/);
  assert.match(page, /canCompleteAgendaTask\(detail\.estado, user\?\.permissions/);
  assert.match(page, /canReopenAgendaTask\(detail\.estado, user\?\.permissions/);
});

test('cada transición usa su endpoint POST y schema admite version opcional', () => {
  assert.match(api, /start:.*apiClient\.post.*\/iniciar/);
  assert.match(api, /complete:.*apiClient\.post.*\/terminar/);
  assert.match(api, /reopen:.*apiClient\.post.*\/reabrir/);
  assert.match(schemas, /transitionSchema = z\.object\(\{ version:z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\), comentario:z\.string\(\)\.trim\(\)\.max\(2000\)\.optional\(\) \}\)/);
  assert.match(dialog, /transitionPayload\(task\.version\)/);
  assert.match(dialog, /agendaApi\.start\(task\.id, payload\)/);
  assert.match(dialog, /agendaApi\.complete\(task\.id, payload\)/);
  assert.match(dialog, /agendaApi\.reopen\(task\.id, payload\)/);
  assert.doesNotMatch(dialog, /agendaApi\.update/);
});

test('frontend expone confirmación con estados origen, destino e historial previo al reabrir', () => {
  assert.match(dialog, /La tarea pasará de PENDIENTE a EN_PROCESO/);
  assert.match(dialog, /La tarea se marcará como terminada/);
  assert.match(dialog, /Estado actual:/);
  assert.match(dialog, /Estado al reabrir:/);
  assert.match(dialog, /historial .*se conservará/);
  assert.match(page, /detail\.fecha_terminacion/);
});

test('transición no usa PATCH general y el servicio registra auditoría e historial anterior/nuevo', () => {
  assert.match(service, /if\(input\.estado\)throw new AppError\('Use el endpoint de transición/);
  assert.match(service, /estado_anterior:before\.estado,estado_nuevo:state/);
  assert.match(service, /audit\(e,`STATUS_\$\{state\}`/);
  assert.match(repository, /fecha_terminacion=CASE WHEN \$1='TERMINADA'/);
  assert.match(repository, /WHERE id=\$3 AND empresa_id=\$2 AND archivada=FALSE\$\{v\} RETURNING \*/);
});

test('conflicto versión requiere recargar; otros errores permiten reintentar sin cierre de sesión', () => {
  assert.match(dialog, /error\.status === 409 \|\| error\.code === 'AGENDA_VERSION_CONFLICT'/);
  assert.match(dialog, /Recargar detalle/);
  assert.match(dialog, /Reintentar/);
  assert.match(dialog, /if \(savingRef\.current\) return/);
  assert.match(dialog, /error\.status === 429/);
  assert.doesNotMatch(dialog, /clearAuthSession/);
  assert.match(page, /reloadTaskDetail/);
});

test('éxito vuelve a cargar detalle, historial, lista, Semana y resumen conservando la vista seleccionada', () => {
  assert.match(page, /afterTaskAction/);
  assert.match(page, /Promise\.all\(\[agendaApi\.get<Detail>\(taskId\), load\(\)\]\)/);
  assert.match(page, /setNotice\(message\)/);
  assert.match(page, /detail\.seguimientos\?\.map/);
  assert.match(page, /items\.filter\(\(task\) => task\.fecha_prevista === today\(\)\)/);
  assert.match(page, /view === 'Semana'/);
});
