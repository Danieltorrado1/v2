import test from 'node:test';
import assert from 'node:assert/strict';

const personasIdentificacionesPromise = import('../modules/personas/' + 'personas.identificaciones.helpers.ts');

test('normalizeNumeroDocumento trims surrounding whitespace', async () => {
  const { normalizeNumeroDocumento } = await personasIdentificacionesPromise;
  assert.equal(normalizeNumeroDocumento('  123456789  '), '123456789');
});

test('buildPersonaIdentificationCore normalizes nullable fields', async () => {
  const { buildPersonaIdentificationCore } = await personasIdentificacionesPromise;
  assert.deepEqual(
    buildPersonaIdentificationCore({
      tipo_documento_id: 3,
      numero_documento: ' 99887766 ',
      fecha_expedicion_documento: null,
      municipio_expedicion_id: null
    }),
    {
      tipo_documento_id: 3,
      numero_documento: '99887766',
      fecha_expedicion_documento: null,
      municipio_expedicion_id: null
    }
  );
});

test('hasPersonaIdentificationChanged detects meaningful changes only', async () => {
  const {
    buildPersonaIdentificationCore,
    hasPersonaIdentificationChanged
  } = await personasIdentificacionesPromise;
  const current = buildPersonaIdentificationCore({
    tipo_documento_id: 1,
    numero_documento: '123456',
    fecha_expedicion_documento: '2024-01-10',
    municipio_expedicion_id: 5
  });

  const same = buildPersonaIdentificationCore({
    tipo_documento_id: 1,
    numero_documento: ' 123456 ',
    fecha_expedicion_documento: '2024-01-10',
    municipio_expedicion_id: 5
  });

  const changed = buildPersonaIdentificationCore({
    tipo_documento_id: 2,
    numero_documento: '123456',
    fecha_expedicion_documento: '2024-01-10',
    municipio_expedicion_id: 5
  });

  assert.equal(hasPersonaIdentificationChanged(current, same), false);
  assert.equal(hasPersonaIdentificationChanged(current, changed), true);
});
