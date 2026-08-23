import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const personasSchemasPromise = import('../modules/personas/' + 'personas.schemas.ts');
const vinculacionesSchemasPromise = import('../modules/vinculaciones/' + 'vinculaciones.schemas.ts');

test('updatePersonaSchema acepta motivo_cambio para modificaciones sensibles', async () => {
  const { updatePersonaSchema } = await personasSchemasPromise;

  const parsed = updatePersonaSchema.parse({
    telefono: '3150000000',
    correo: 'persona@example.com',
    motivo_cambio: 'Correccion de contacto',
  });

  assert.equal(parsed.telefono, '3150000000');
  assert.equal(parsed.motivo_cambio, 'Correccion de contacto');
});

test('updateVinculacionSchema acepta motivo_cambio para cambios contractuales', async () => {
  const { updateVinculacionSchema } = await vinculacionesSchemasPromise;

  const parsed = updateVinculacionSchema.parse({
    contrato_cargo_id: '14',
    fecha_inicio: '2026-08-01',
    motivo_cambio: 'Correccion de vinculacion',
  });

  assert.equal(parsed.contrato_cargo_id, 14);
  assert.equal(parsed.motivo_cambio, 'Correccion de vinculacion');
});

test('rutas de personas y vinculaciones exponen permisos granulares y bancarios', () => {
  const personasRoutes = readFileSync(path.join(root, 'src/modules/personas/personas.routes.ts'), 'utf8');
  const vinculacionesRoutes = readFileSync(path.join(root, 'src/modules/vinculaciones/vinculaciones.routes.ts'), 'utf8');

  assert.match(personasRoutes, /persona\.editar/);
  assert.match(personasRoutes, /persona\.editar_identidad/);
  assert.match(personasRoutes, /persona\.editar_contacto/);
  assert.match(personasRoutes, /bancario\.ver/);
  assert.match(personasRoutes, /bancario\.editar/);
  assert.match(personasRoutes, /historial-cambios/);
  assert.match(vinculacionesRoutes, /vinculacion\.editar/);
  assert.match(vinculacionesRoutes, /vinculacion\.editar_cargo/);
  assert.match(vinculacionesRoutes, /vinculacion\.editar_fechas/);
  assert.match(vinculacionesRoutes, /vinculacion\.editar_estado/);
});

test('auditoria.helper genera diff por campo ademas del snapshot historico', () => {
  const helperSource = readFileSync(path.join(root, 'src/modules/auditoria/auditoria.helper.ts'), 'utf8');

  assert.match(helperSource, /buildHistorialDiffRows/);
  assert.match(helperSource, /campo: key/);
  assert.match(helperSource, /INSERT INTO historial_cambios/);
  assert.match(helperSource, /'__snapshot__'/);
});

test('servicio maestro de personas implementa bancario, historial y exportacion configurable', () => {
  const source = readFileSync(
    path.join(root, 'src/modules/personas/personas.master.service.ts'),
    'utf8'
  );

  assert.match(source, /persona_cuentas_bancarias/);
  assert.match(source, /maskAccountNumber/);
  assert.match(source, /listPersonaHistorialCambios/);
  assert.match(source, /generatePersonalExport/);
  assert.match(source, /personal_export_templates/);
});

test('importaciones publica plantilla bancaria y permisos preparar\/aplicar', () => {
  const routesSource = readFileSync(path.join(root, 'src/modules/importaciones/importaciones.routes.ts'), 'utf8');
  const domainSource = readFileSync(path.join(root, 'src/modules/importaciones/importaciones.domain.ts'), 'utf8');

  assert.match(routesSource, /informacion-bancaria\/template/);
  assert.match(routesSource, /importaciones\.preparar/);
  assert.match(routesSource, /importaciones\.aplicar/);
  assert.match(domainSource, /buildBankingImportTemplateCsv/);
  assert.match(domainSource, /NUMERO_CUENTA/);
});
