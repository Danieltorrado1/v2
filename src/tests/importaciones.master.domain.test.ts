import test from 'node:test';
import assert from 'node:assert/strict';

const domainPromise = import('../modules/importaciones/' + 'importaciones.master.domain.ts');

test('sugiere mapeos evidentes sin depender del encabezado exacto', async () => {
  const { buildMasterImportSuggestions } = await domainPromise;
  const suggestions = buildMasterImportSuggestions(
    ['CEDULA', 'CELULAR', 'CORREO', 'BANCO', 'NUMERO CUENTA'],
    'DATOS_PERSONALES'
  );

  assert.equal(
    suggestions.find((item: { header: string }) => item.header === 'CEDULA')?.suggested_field,
    'numero_documento'
  );
  assert.equal(
    suggestions.find((item: { header: string }) => item.header === 'CELULAR')?.suggested_field,
    'telefono'
  );
  assert.equal(
    suggestions.find((item: { header: string }) => item.header === 'CORREO')?.suggested_field,
    'correo'
  );
});

test('identidad canonica usa tipo y numero de documento', async () => {
  const { buildCanonicalIdentityKey } = await domainPromise;
  assert.equal(buildCanonicalIdentityKey('CC', '1.234.567'), 'cc|1234567');
  assert.equal(buildCanonicalIdentityKey('CC', null), null);
});

test('dry-run personal produce diff por campo para actualizacion', async () => {
  const { classifyPersonalImportRow, normalizePersonalMappedRow } = await domainPromise;
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

test('dry-run bancario enmascara numero de cuenta en diff', async () => {
  const { classifyBankingImportRow, maskBankAccountNumber, normalizeBankingMappedRow } =
    await domainPromise;
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
  assert.equal(
    result.diffs.find((item: { field: string }) => item.field === 'numero_cuenta')?.current_value,
    '****1234'
  );
  assert.equal(
    result.diffs.find((item: { field: string }) => item.field === 'numero_cuenta')?.next_value,
    '******7890'
  );
  assert.equal(maskBankAccountNumber('1234567890'), '******7890');
});

test(
  'dry-run SST detecta conflicto cuando una importacion parcial trae un valor distinto al vigente',
  async () => {
    const { classifySstPerfilImportRow, normalizeSstPerfilMappedRow } = await domainPromise;
  const normalized = normalizeSstPerfilMappedRow({
    tipo_documento: 'CC',
    numero_documento: '10203040',
    nivel_escolaridad: 'Tecnica',
    estrato_socioeconomico: '2',
  });

  const current = {
    persona_id: 7,
    tipo_documento: 'CC',
    numero_documento: '10203040',
    fecha_caracterizacion: '2026-08-23',
    origen: 'FORMULARIO_DIGITAL' as const,
    nacionalidad: 'COLOMBIANA',
    estrato_socioeconomico: '2',
    tipo_vivienda: null,
    grupo_etnico: null,
    nivel_escolaridad: 'BACHILLER',
    profesion_ocupacion: null,
    personas_dependen_economicamente: null,
    cabeza_familia: null,
    total_hijos: null,
    hijos_viven_con_usted: null,
    hijos_menores_edad: null,
    hijos_mayores_edad: null,
    tiene_discapacidad: null,
    tipo_discapacidad: null,
    redes_apoyo_social: null,
    presenta_alergias: null,
    medicamentos_permanentes: null,
    enfermedad: null,
    autorizacion_tratamiento_datos: null,
    observaciones: null,
  };

  const result = classifySstPerfilImportRow(normalized, current, false, true);

  assert.equal(result.classification, 'CONFLICTO');
  assert.equal(result.requires_apply, false);
  assert.match(result.warnings[0]?.code ?? '', /SST_CONFLICTING_VALUE/);
  }
);

test(
  'dry-run SST soporta importacion parcial llenando huecos sin sobreescribir datos ya existentes',
  async () => {
    const { classifySstPerfilImportRow, normalizeSstPerfilMappedRow } = await domainPromise;
  const normalized = normalizeSstPerfilMappedRow({
    tipo_documento: 'CC',
    numero_documento: '10203040',
    tipo_vivienda: 'Casa',
    total_hijos: '1',
  });

  const current = {
    persona_id: 7,
    tipo_documento: 'CC',
    numero_documento: '10203040',
    fecha_caracterizacion: null,
    origen: null,
    nacionalidad: 'COLOMBIANA',
    estrato_socioeconomico: '2',
    tipo_vivienda: null,
    grupo_etnico: null,
    nivel_escolaridad: 'BACHILLER',
    profesion_ocupacion: null,
    personas_dependen_economicamente: null,
    cabeza_familia: null,
    total_hijos: null,
    hijos_viven_con_usted: null,
    hijos_menores_edad: null,
    hijos_mayores_edad: null,
    tiene_discapacidad: null,
    tipo_discapacidad: null,
    redes_apoyo_social: null,
    presenta_alergias: null,
    medicamentos_permanentes: null,
    enfermedad: null,
    autorizacion_tratamiento_datos: null,
    observaciones: null,
  };

  const result = classifySstPerfilImportRow(normalized, current, false, true);

  assert.equal(result.classification, 'ACTUALIZACION');
  assert.equal(result.requires_apply, true);
  assert.deepEqual(
    result.diffs.map((item: { field: string }) => item.field).sort(),
    ['tipo_vivienda', 'total_hijos']
  );
  }
);

test('dry-run SST es idempotente cuando el archivo repite exactamente el perfil vigente', async () => {
  const { classifySstPerfilImportRow, normalizeSstPerfilMappedRow } = await domainPromise;
  const normalized = normalizeSstPerfilMappedRow({
    tipo_documento: 'CC',
    numero_documento: '10203040',
    nacionalidad: 'Colombiana',
    estrato_socioeconomico: '2',
  });

  const current = {
    persona_id: 7,
    tipo_documento: 'CC',
    numero_documento: '10203040',
    fecha_caracterizacion: null,
    origen: null,
    nacionalidad: 'COLOMBIANA',
    estrato_socioeconomico: '2',
    tipo_vivienda: null,
    grupo_etnico: null,
    nivel_escolaridad: null,
    profesion_ocupacion: null,
    personas_dependen_economicamente: null,
    cabeza_familia: null,
    total_hijos: null,
    hijos_viven_con_usted: null,
    hijos_menores_edad: null,
    hijos_mayores_edad: null,
    tiene_discapacidad: null,
    tipo_discapacidad: null,
    redes_apoyo_social: null,
    presenta_alergias: null,
    medicamentos_permanentes: null,
    enfermedad: null,
    autorizacion_tratamiento_datos: null,
    observaciones: null,
  };

  const result = classifySstPerfilImportRow(normalized, current, false, true);

  assert.equal(result.classification, 'SIN_CAMBIOS');
  assert.equal(result.requires_apply, false);
  assert.equal(result.diffs.length, 0);
});
