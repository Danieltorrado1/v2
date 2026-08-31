import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const alertasService = readFileSync('src/modules/alertas/alertas.service.ts', 'utf8');
const alertasVisibility = readFileSync('src/modules/alertas/alertas.visibility.ts', 'utf8');
const dashboardService = readFileSync('src/modules/dashboard/dashboard.service.ts', 'utf8');
const dashboardController = readFileSync('src/modules/dashboard/dashboard.controller.ts', 'utf8');
const mainLayout = readFileSync('FrontendNuevo/src/layouts/MainLayout.tsx', 'utf8');
const notificationsPanel = readFileSync('FrontendNuevo/src/components/notifications/NotificationsPanel.tsx', 'utf8');
const notificationsApi = readFileSync('FrontendNuevo/src/services/notificacionesApi.ts', 'utf8');
const portalPage = readFileSync('FrontendNuevo/src/pages/portal/PortalPage.tsx', 'utf8');
const appRouter = readFileSync('FrontendNuevo/src/router/AppRouter.tsx', 'utf8');

test('backend filtra mis notificaciones y badge con helper de visibilidad', () => {
  assert.match(alertasService, /filterVisibleNotificationsForUser/);
  assert.match(alertasService, /queryNotificacionesRows/);
  assert.match(alertasService, /countMisNotificacionesNoLeidas/);
  assert.match(alertasVisibility, /nomina_responsabilidades_usuario/);
  assert.match(alertasVisibility, /gestor_personal_asignaciones/);
  assert.match(alertasVisibility, /gestor_municipio_asignaciones/);
  assert.match(alertasVisibility, /COALESCE\(gma_scope\.alcance_personal, 'PERSONAL_SELECCIONADO'\) = 'TODO_MUNICIPIO'/);
  assert.match(alertasVisibility, /documentos\./);
});

test('dashboard usa conteo filtrado por backend para notificaciones', () => {
  assert.match(dashboardController, /getDashboardAlertas\(query, req\.user!\.userId\)/);
  assert.match(dashboardService, /countMisNotificacionesNoLeidas/);
  assert.match(dashboardService, /notificaciones_no_leidas: notificacionesNoLeidas/);
});

test('campanita frontend consume /notificaciones\/mis y badge backend filtrado', () => {
  assert.match(notificationsApi, /\/notificaciones\/mis/);
  assert.match(notificationsApi, /countUnreadMine/);
  assert.match(mainLayout, /notificacionesApi\.countUnreadMine\(\)/);
  assert.match(mainLayout, /canSeeNotifications/);
  assert.match(notificationsPanel, /notificacionesApi\.listMine/);
  assert.match(notificationsPanel, /notificacionesApi\.markRead/);
  assert.match(notificationsPanel, /notificacionesApi\.markAllRead/);
});

test('portal bloquea selector TH para usuario sin rol TH y Gestor pierde rutas economicas residuales', () => {
  assert.match(portalPage, /const canAccessTh = user\?\.roles\.includes\("TALENTO_HUMANO"\) === true \|\| user\?\.roles\.includes\("ADMINISTRADOR"\) === true/);
  assert.match(portalPage, /\{canAccessTh && \(/);
  assert.match(appRouter, /path="nomina\/ops"[\s\S]*denyRoles=\{\["GESTOR"\]\}/);
  assert.match(appRouter, /path="nomina\/validacion"[\s\S]*denyRoles=\{\["GESTOR"\]\}/);
  assert.match(appRouter, /path="nomina\/personal-ops"[\s\S]*denyRoles=\{\["GESTOR"\]\}/);
});
