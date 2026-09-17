import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('lookup de persona para nueva vinculacion autoriza el destino y no la pertenencia previa', () => {
  const service = readFileSync(path.join(root, 'src/modules/personas/personas.service.ts'), 'utf8');
  const controller = readFileSync(path.join(root, 'src/modules/personas/personas.controller.ts'), 'utf8');
  const frontend = readFileSync(path.join(root, 'FrontendNuevo/src/services/personasApi.ts'), 'utf8');

  assert.match(service, /getPersonaForVinculacion/);
  assert.match(service, /SELECT empresa_id FROM contratos/);
  assert.match(service, /CONTRACT_COMPANY_MISMATCH/);
  assert.match(service, /No tienes permisos para crear personal en esta empresa/);
  assert.match(service, /SELECT id, tipo_documento_id, numero_documento, primer_nombre/);
  const lookupBlock = service.slice(
    service.indexOf('export const getPersonaForVinculacion'),
    service.indexOf('export const listPersonaIdentificaciones')
  );
  assert.doesNotMatch(lookupBlock, /assertTenantAccessForPersonaId/);
  assert.match(controller, /personaDocumentoLookupQuerySchema/);
  assert.match(controller, /vinculaciones\.create/);
  assert.match(frontend, /empresa_id: destination\.empresaId/);
  assert.match(frontend, /contrato_id: destination\.contratoId/);
});

test('consulta por documento valida que empresa y contrato lleguen juntos', async () => {
  const { personaDocumentoLookupQuerySchema } = await import('../modules/personas/' + 'personas.schemas.ts');
  assert.deepEqual(personaDocumentoLookupQuerySchema.parse({ empresa_id: '15', contrato_id: '24' }), {
    empresa_id: 15,
    contrato_id: 24
  });
  assert.throws(() => personaDocumentoLookupQuerySchema.parse({ empresa_id: '15' }));
});
