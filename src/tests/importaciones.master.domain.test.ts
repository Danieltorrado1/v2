import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCanonicalIdentityKey,
  buildMasterImportSuggestions,
  classifyBankingImportRow,
  classifyPersonalImportRow,
  maskBankAccountNumber,
  normalizeBankingMappedRow,
  normalizePersonalMappedRow,
} from '../modules/importaciones/importaciones.master.domain';

test('sugiere mapeos evidentes sin depender del encabezado exacto', () => {
  const suggestions = buildMasterImportSuggestions(
    ['CEDULA', 'CELULAR', 'CORREO', 'BANCO', 'NUMERO CUENTA'],
    'DATOS_PERSONALES'
  );

  assert.equal(suggestions.find((item) => item.header === 'CEDULA')?.suggested_field, 'numero_documento');
  assert.equal(suggestions.find((item) => item.header === 'CELULAR')?.suggested_field, 'telefono');
  assert.equal(suggestions.find((item) => item.header === 'CORREO')?.suggested_field, 'correo');
});

test('identidad canonica usa tipo y numero de documento', () => {
  assert.equal(buildCanonicalIdentityKey('CC', '1.234.567'), 'cc|1234567');
  assert.equal(buildCanonicalIdentityKey('CC', null), null);
});

test('dry-run personal produce diff por campo para actualizacion', () => {
  const normalized = normalizePersonalMappedRow({
    tipo_documento: 'CC',
    numero_documento: '10203040',
    primer_nombre: 'ANA',
    primer_apellido: 'PEREZ',
    telefono: '3101234567',
  });

  const current = {
    persona_id: 7,
    tipo_documento: 'CC',
    numero_documento: '10203040',
    primer_nombre: 'ANA',
    segundo_nombre: null,
    primer_apellido: 'PEREZ',
    segundo_apellido: null,
    fecha_nacimiento: null,
    telefono: null,
    correo: null,
    direccion: null,
    barrio: null,
    municipio_residencia: null,
    pais_nacimiento: null,
  };

  const result = classifyPersonalImportRow(normalized, current, false);

  assert.equal(result.classification, 'ACTUALIZACION');
  assert.equal(result.diffs[0]?.field, 'telefono');
  assert.equal(result.diffs[0]?.current_value, null);
  assert.equal(result.diffs[0]?.next_value, '3101234567');
});

test('dry-run bancario enmascara numero de cuenta en diff', () => {
  const normalized = normalizeBankingMappedRow({
    tipo_documento: 'CC',
    numero_documento: '10203040',
    entidad_bancaria: 'BANCOLOMBIA',
    tipo_cuenta: 'AHORROS',
    numero_cuenta: '1234567890',
  });

  const current = {
    persona_id: 7,
    cuenta_bancaria_id: 9,
    tipo_documento: null,
    numero_documento: null,
    entidad_bancaria: 'BANCO DE BOGOTA',
    tipo_cuenta: 'AHORROS',
    numero_cuenta: '99991234',
    titular: 'PERSONA',
    nombre_titular: null,
    documento_titular: null,
    observacion: null,
  };

  const result = classifyBankingImportRow(normalized, current, false, true);

  assert.equal(result.classification, 'CAMBIO_CUENTA');
  assert.equal(result.diffs.find((item) => item.field === 'numero_cuenta')?.current_value, '****1234');
  assert.equal(result.diffs.find((item) => item.field === 'numero_cuenta')?.next_value, '******7890');
  assert.equal(maskBankAccountNumber('1234567890'), '******7890');
});
