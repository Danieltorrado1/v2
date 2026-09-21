import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('historial de cambios de persona exige rol administrador además del permiso de lectura', () => {
  const routes = readFileSync(resolve(process.cwd(), 'src/modules/personas/personas.routes.ts'), 'utf8');
  const route = routes.slice(routes.indexOf("'/:id/historial-cambios'"));
  assert.match(route, /requireRoles\('ADMINISTRADOR'\)/);
  assert.match(route, /requireAnyPermissions\('personas\.read', 'persona\.ver', 'auditoria\.read'\)/);
});

test('el expediente consolidado no expone auditoría a roles no administradores', () => {
  const controller = readFileSync(resolve(process.cwd(), 'src/modules/expedientes/expedientes.controller.ts'), 'utf8');
  assert.match(controller, /expediente\.auditoria = \[\]/);
  assert.match(controller, /expediente\.indicadores\.auditoria_eventos = 0/);
});
