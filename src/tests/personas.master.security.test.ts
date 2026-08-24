import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const personasSchemasPromise = import('../modules/personas/' + 'personas.schemas.ts');

test('updatePersonaSchema acepta contacto de emergencia y perfil demografico', async () => {
  const { updatePersonaSchema } = await personasSchemasPromise;

  const parsed = updatePersonaSchema.parse({
    telefono: '3150000000',
    contacto_emergencia: {
      nombre_contacto: 'Maria Perez',
      parentesco: 'Madre',
      telefono: '3001112233',
      direccion: 'Calle 1 # 2-3',
      activo: true,
    },
    perfil_demografico: {
      nacionalidad: 'Colombiana',
      nivel_escolaridad: 'Bachiller',
    },
  });

  assert.equal(parsed.telefono, '3150000000');
  assert.equal(parsed.contacto_emergencia?.nombre_contacto, 'Maria Perez');
  assert.equal(parsed.perfil_demografico?.nacionalidad, 'Colombiana');
});

test('rutas y controlador de personas resuelven tenant antes de consultar o mutar la ficha maestra', () => {
  const routesSource = readFileSync(path.join(root, 'src/modules/personas/personas.routes.ts'), 'utf8');
  const controllerSource = readFileSync(path.join(root, 'src/modules/personas/personas.controller.ts'), 'utf8');

  assert.match(routesSource, /personasRoutes\.use\(tenantMiddleware\);/);
  assert.match(controllerSource, /listPersonas\(filters, req\.tenant\)/);
  assert.match(controllerSource, /getPersonaById\(id, req\.tenant\)/);
  assert.match(controllerSource, /getPersonaByNumeroDocumento\(numero_documento, req\.tenant\)/);
  assert.match(controllerSource, /listPersonaIdentificaciones\(id, req\.tenant\)/);
  assert.match(controllerSource, /updatePersona\(id, input,[\s\S]*req\.tenant\)/);
  assert.match(controllerSource, /createPersonaIdentificacion\(id, input,[\s\S]*req\.tenant\)/);
});

test('servicio de personas aplica tenant y reutiliza estructuras historicas existentes para la ficha maestra', () => {
  const source = readFileSync(path.join(root, 'src/modules/personas/personas.service.ts'), 'utf8');

  assert.match(source, /appendPersonaTenantScope\(/);
  assert.match(source, /await assertTenantAccessForPersonaId\(tenant, personaId\);/);
  assert.match(source, /FROM persona_contactos_emergencia/);
  assert.match(source, /FROM sst_perfil_demografico/);
  assert.match(source, /upsertPersonaContactoEmergencia/);
  assert.match(source, /upsertPersonaPerfilDemografico/);
  assert.match(source, /tabla: 'persona_contactos_emergencia'/);
  assert.match(source, /tabla: 'sst_perfil_demografico'/);
});

test('perfil SST se integra al expediente por rutas dedicadas, versionado y exportacion protegida', () => {
  const routesSource = readFileSync(path.join(root, 'src/modules/personas/personas.routes.ts'), 'utf8');
  const sstServiceSource = readFileSync(path.join(root, 'src/modules/sst/sst.perfil.service.ts'), 'utf8');
  const exportServiceSource = readFileSync(
    path.join(root, 'src/modules/personas/personas.master.service.ts'),
    'utf8'
  );

  assert.match(routesSource, /\/:id\/sst\/perfil/);
  assert.match(routesSource, /\/:id\/sst\/perfil\/historial/);
  assert.match(routesSource, /requireAnyPermissions\('sst\.perfil\.ver'\)/);
  assert.match(routesSource, /requireAnyPermissions\('sst\.perfil\.crear', 'sst\.perfil\.editar'\)/);
  assert.match(sstServiceSource, /FROM sst_perfil_demografico_versiones/);
  assert.match(sstServiceSource, /registerAuditEntry\(/);
  assert.match(exportServiceSource, /group: 'SST'/);
  assert.match(exportServiceSource, /canExportSstProfiles/);
  assert.doesNotMatch(exportServiceSource, /code: 'sst_tiene_discapacidad'/);
});
