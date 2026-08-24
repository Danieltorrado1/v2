import test from 'node:test';
import assert from 'node:assert/strict';

const domainPromise = import('../modules/sst/' + 'sst.perfil.domain.ts');

test('perfil SST calcula completitud, campos faltantes y estado completa', async () => {
  const { computeSstPerfilCompleteness } = await domainPromise;
  const result = computeSstPerfilCompleteness({
    fecha_nacimiento: '1994-04-12',
    sexo_id: 1,
    estado_civil_id: 2,
    values: {
      estrato_socioeconomico: '2',
      tipo_vivienda: 'CASA',
      nivel_escolaridad: 'BACHILLER',
      profesion_ocupacion: 'MANIPULADORA',
      personas_dependen_economicamente: 2,
      cabeza_familia: true,
      total_hijos: 1,
      hijos_viven_con_usted: 1,
      hijos_menores_edad: 1,
      hijos_mayores_edad: 0,
      tiene_discapacidad: false,
      autorizacion_tratamiento_datos: true
    }
  });

  assert.equal(result.estado, 'COMPLETA');
  assert.equal(result.porcentaje, 100);
  assert.equal(result.campos_faltantes.length, 0);
});

test('perfil SST trata respuestas booleanas acentuadas y campos condicionales como equivalentes validos', async () => {
  const { computeSstPerfilCompleteness, normalizeSstPerfilBooleanValue } = await domainPromise;

  assert.equal(normalizeSstPerfilBooleanValue('Sí'), true);
  assert.equal(normalizeSstPerfilBooleanValue(' sÍ '), true);
  assert.equal(normalizeSstPerfilBooleanValue('No'), false);

  const result = computeSstPerfilCompleteness({
    fecha_nacimiento: '1994-04-12',
    sexo_id: 1,
    estado_civil_id: 2,
    values: {
      estrato_socioeconomico: '2',
      tipo_vivienda: 'CASA',
      nivel_escolaridad: 'BACHILLER',
      profesion_ocupacion: 'MANIPULADORA',
      personas_dependen_economicamente: 0,
      cabeza_familia: normalizeSstPerfilBooleanValue('Sí'),
      total_hijos: 2,
      hijos_viven_con_usted: 1,
      hijos_menores_edad: 1,
      hijos_mayores_edad: 1,
      tiene_discapacidad: normalizeSstPerfilBooleanValue('No'),
      autorizacion_tratamiento_datos: normalizeSstPerfilBooleanValue('Sí')
    }
  });

  assert.equal(result.estado, 'COMPLETA');
  assert.equal(result.campos_faltantes.includes('tipo_discapacidad'), false);
  assert.equal(result.campos_faltantes.includes('hijos_menores_edad'), false);
});

test('perfil SST marca requiere revision y no realizada cuando faltan datos base', async () => {
  const { computeSstPerfilCompleteness } = await domainPromise;
  const noRealizada = computeSstPerfilCompleteness({
    fecha_nacimiento: null,
    sexo_id: null,
    estado_civil_id: null,
    values: {}
  });

  assert.equal(noRealizada.estado, 'NO_REALIZADA');
  assert.equal(noRealizada.porcentaje, 0);

  const requiereRevision = computeSstPerfilCompleteness({
    fecha_nacimiento: '1994-04-12',
    sexo_id: 1,
    estado_civil_id: 2,
    requiere_revision: true,
    values: {
      estrato_socioeconomico: '2',
      tipo_vivienda: 'CASA',
      nivel_escolaridad: 'BACHILLER',
      profesion_ocupacion: 'MANIPULADORA',
      personas_dependen_economicamente: 2,
      cabeza_familia: true,
      total_hijos: 1,
      hijos_viven_con_usted: 1,
      hijos_menores_edad: 1,
      hijos_mayores_edad: 0,
      tiene_discapacidad: false,
      autorizacion_tratamiento_datos: true
    }
  });

  assert.equal(requiereRevision.estado, 'REQUIERE_REVISION');
  assert.equal(requiereRevision.porcentaje, 100);
});

test('perfil SST oculta campos sensibles cuando el rol no puede verlos', async () => {
  const { sanitizeSstPerfilValuesForView } = await domainPromise;
  const visible = sanitizeSstPerfilValuesForView(
    {
      estrato_socioeconomico: null,
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
      tiene_discapacidad: true,
      tipo_discapacidad: 'VISUAL',
      redes_apoyo_social: null,
      presenta_alergias: 'POLEN',
      medicamentos_permanentes: 'IBUPROFENO',
      enfermedad: 'NINGUNA',
      autorizacion_tratamiento_datos: null,
      observaciones: null,
      nacionalidad: 'COLOMBIANA'
    },
    false
  );

  assert.equal(visible.tiene_discapacidad, null);
  assert.equal(visible.tipo_discapacidad, null);
  assert.equal(visible.presenta_alergias, null);
  assert.equal(visible.medicamentos_permanentes, null);
  assert.equal(visible.enfermedad, null);
  assert.equal(visible.nacionalidad, 'COLOMBIANA');
});

test('edad y antiguedad se calculan dinamicamente desde fechas base', async () => {
  const { calculateAgeFromBirthDate, calculateAntiguedadFromStartDate } = await domainPromise;
  assert.equal(calculateAgeFromBirthDate('1990-08-23'), 36);
  assert.equal(calculateAntiguedadFromStartDate('2020-08-23'), 6);
});
