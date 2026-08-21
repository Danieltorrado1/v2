import test from 'node:test';
import assert from 'node:assert/strict';

const modulePromise = import('../modules/importaciones/' + 'personalMeta26DryRun.helpers.ts');

test('persona nueva se normaliza por documento Excel sin .0 ni espacios', async () => {
  const { normalizeIdentityDocument } = await modulePromise;
  assert.equal(normalizeIdentityDocument('12345678.0'), '12345678');
  assert.equal(normalizeIdentityDocument('12 345 678'), '12345678');
});

test('otra razon social se excluye y meta26 se reconoce por alias', async () => {
  const { classifyReasonSocial } = await modulePromise;
  assert.equal(classifyReasonSocial('CONSORCIO PAE META 26'), 'META26');
  assert.equal(classifyReasonSocial('OTRA EMPRESA SAS'), 'OTRA_RAZON_SOCIAL');
});

test('obra o labor permite fecha fin null', async () => {
  const { validateContractDates } = await modulePromise;
  assert.deepEqual(
    validateContractDates({
      tipoContrato: 'OBRA O LABOR',
      tipoVinculacion: 'LABORAL',
      startDate: '2026-08-01',
      endDate: null
    }).issues,
    []
  );
});

test('termino fijo sin fecha fin genera revision', async () => {
  const { validateContractDates } = await modulePromise;
  assert.ok(
    validateContractDates({
      tipoContrato: 'TÉRMINO FIJO',
      tipoVinculacion: 'LABORAL',
      startDate: '2026-08-01',
      endDate: null
    }).issues.includes('FECHA_FIN_REQUERIDA_FALTANTE')
  );
});

test('fechas invertidas se marcan como invalidas', async () => {
  const { validateContractDates } = await modulePromise;
  assert.ok(
    validateContractDates({
      tipoContrato: 'OBRA O LABOR',
      tipoVinculacion: 'LABORAL',
      startDate: '2026-08-15',
      endDate: '2026-08-01'
    }).issues.includes('FIN_ANTERIOR_INICIO')
  );
});

test('cargo manipuladora se mapea a cargo de contrato con nombre inclusivo', async () => {
  const { resolveCargoMapping } = await modulePromise;
  const result = resolveCargoMapping('MANIPULADORA DE ALIMENTOS', [
    { id: 1, nombre_cargo: 'MANIPULADOR(A) DE ALIMENTOS' }
  ]);
  assert.equal(result.proposed, 'MANIPULADOR(A) DE ALIMENTOS');
  assert.equal(result.resolved?.id, 1);
});

test('administrativo usa asignacion laboral y no cobertura', async () => {
  const { resolveLaborLocation } = await modulePromise;
  const result = resolveLaborLocation({
    cargo_laboral: 'ADMINISTRATIVO',
    asignacion_laboral: 'GESTIÓN DE ZONA',
    ubicacion_operativa: null,
    municipio: null,
    institucion_educativa: null,
    sede: null,
    modalidad: null
  }, [
    { id: 7, nombre_ubicacion: 'GESTION DE ZONA' }
  ]);
  assert.equal(result.status, 'UBICACION_OK');
  assert.equal(result.resolved?.id, 7);
});

test('no manipuladora con sede/modalidad queda ambigua y no se mezcla con cobertura', async () => {
  const { resolveLaborLocation } = await modulePromise;
  const result = resolveLaborLocation({
    cargo_laboral: 'ADMINISTRATIVO',
    asignacion_laboral: 'GESTIÓN DE ZONA',
    ubicacion_operativa: null,
    municipio: 'ACACIAS',
    institucion_educativa: 'I.E. X',
    sede: 'SEDE A',
    modalidad: 'CAA'
  }, [
    { id: 7, nombre_ubicacion: 'GESTION DE ZONA' }
  ]);
  assert.equal(result.status, 'UBICACION_AMBIGUA');
});

test('manipuladora con composite exacto resuelve sede modalidad', async () => {
  const { matchCoverageAssignment } = await modulePromise;
  const result = matchCoverageAssignment({
    municipio: 'ACACIAS',
    institucion_educativa: 'INSTITUCION EDUCATIVA JUAN ROZO',
    sede: 'SEDE PRINCIPAL JUAN ROZO',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 10,
      sede_modalidad_id: 20,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA JUAN ROZO',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL JUAN ROZO',
      modalidad_id: 4,
      modalidad_nombre: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], []);
  assert.equal(result.status, 'ASIGNACION_OK');
  assert.equal(result.sede_modalidad_id, 20);
});

test('sede homonima en municipio diferente no se fusiona', async () => {
  const { matchCoverageAssignment } = await modulePromise;
  const result = matchCoverageAssignment({
    municipio: 'ACACIAS',
    institucion_educativa: 'IE CENTRAL',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 10,
      sede_modalidad_id: 20,
      municipio_id: 1,
      municipio_nombre: 'VILLAVICENCIO',
      institucion_id: 2,
      institucion_nombre: 'IE CENTRAL',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], []);
  assert.equal(result.status, 'MUNICIPIO_NO_RECONOCIDO');
});

test('manipuladora ambigua se mantiene en revisar', async () => {
  const { matchCoverageAssignment } = await modulePromise;
  const rows = [
    {
      focalizacion_final_id: 10,
      sede_modalidad_id: 20,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'IE CENTRAL',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'CAA',
      cobertura_requerida: 1
    },
    {
      focalizacion_final_id: 11,
      sede_modalidad_id: 21,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'IE CENTRAL',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'CAA',
      cobertura_requerida: 1
    }
  ];
  const result = matchCoverageAssignment({
    municipio: 'ACACIAS',
    institucion_educativa: 'IE CENTRAL',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAA'
  }, rows, [], [], []);
  assert.equal(result.status, 'AMBIGUA');
});

test('municipio con tilde se concilia con maestro oficial', async () => {
  const { matchCoverageAssignment } = await modulePromise;
  const result = matchCoverageAssignment({
    municipio: 'PUERTO LÓPEZ',
    institucion_educativa: 'IE CENTRAL',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 1,
      sede_modalidad_id: 2,
      municipio_id: 10,
      municipio_nombre: 'PUERTO LOPEZ',
      institucion_id: 20,
      institucion_nombre: 'INSTITUCION EDUCATIVA CENTRAL',
      sede_id: 30,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 40,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], []);
  assert.equal(result.status, 'ASIGNACION_OK');
});

test('prefijo IE se resuelve dentro del municipio correcto', async () => {
  const { matchCoverageAssignment } = await modulePromise;
  const result = matchCoverageAssignment({
    municipio: 'ACACIAS',
    institucion_educativa: 'IE JUAN ROZO',
    sede: 'SEDE PRINCIPAL JUAN ROZO',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 10,
      sede_modalidad_id: 20,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA JUAN ROZO',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL JUAN ROZO',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], []);
  assert.equal(result.status, 'ASIGNACION_OK');
});

test('prefijo SEDE se resuelve dentro de la institucion correcta', async () => {
  const { matchCoverageAssignment } = await modulePromise;
  const result = matchCoverageAssignment({
    municipio: 'ACACIAS',
    institucion_educativa: 'INSTITUCION EDUCATIVA JUAN ROZO',
    sede: 'RAFAEL POMBO',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 10,
      sede_modalidad_id: 20,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA JUAN ROZO',
      sede_id: 3,
      sede_nombre: 'SEDE RAFAEL POMBO',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], []);
  assert.equal(result.status, 'ASIGNACION_OK');
});

test('modalidad alias con espacios se resuelve por codigo oficial', async () => {
  const { matchCoverageAssignmentDetailed } = await modulePromise;
  const result = matchCoverageAssignmentDetailed({
    municipio: 'ACACIAS',
    institucion_educativa: 'INSTITUCION EDUCATIVA JUAN ROZO',
    sede: 'SEDE PRINCIPAL JUAN ROZO',
    modalidad: 'CAJU RI'
  }, [
    {
      focalizacion_final_id: 10,
      sede_modalidad_id: 20,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA JUAN ROZO',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL JUAN ROZO',
      modalidad_id: 4,
      modalidad_nombre: 'Residencia Indigena',
      modalidad_codigo_original: 'CAJU-RI',
      modalidad_codigo_base: 'CAJU-RI',
      cobertura_requerida: 1
    }
  ], [], [], [], [
    { id: 1, codigo_dane: null, nombre_municipio: 'ACACIAS' }
  ], [
    { id: 2, municipio_id: 1, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA JUAN ROZO' }
  ], [
    { id: 3, institucion_id: 2, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE PRINCIPAL JUAN ROZO' }
  ], [
    { id: 4, codigo_original: 'CAJU-RI', codigo_base: 'CAJU-RI', nombre_modalidad: 'Residencia Indigena' }
  ]);
  assert.equal(result.status, 'ASIGNACION_OK');
});

test('instituciones homonimas en municipios distintos no se mezclan', async () => {
  const { matchCoverageAssignmentDetailed } = await modulePromise;
  const result = matchCoverageAssignmentDetailed({
    municipio: 'GRANADA',
    institucion_educativa: 'IE CENTRAL',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 1,
      sede_modalidad_id: 11,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA CENTRAL',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    },
    {
      focalizacion_final_id: 5,
      sede_modalidad_id: 15,
      municipio_id: 9,
      municipio_nombre: 'GRANADA',
      institucion_id: 8,
      institucion_nombre: 'INSTITUCION EDUCATIVA CENTRAL',
      sede_id: 7,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], [], [
    { id: 1, codigo_dane: null, nombre_municipio: 'ACACIAS' },
    { id: 9, codigo_dane: null, nombre_municipio: 'GRANADA' }
  ], [
    { id: 2, municipio_id: 1, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA CENTRAL' },
    { id: 8, municipio_id: 9, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA CENTRAL' }
  ], [
    { id: 3, institucion_id: 2, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE PRINCIPAL' },
    { id: 7, institucion_id: 8, municipio_id: 9, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE PRINCIPAL' }
  ], [
    { id: 4, codigo_original: 'CAA', codigo_base: 'CAA', nombre_modalidad: 'Atención CAA' }
  ]);
  assert.equal(result.status, 'ASIGNACION_OK');
  assert.equal(result.sede_modalidad_id, 15);
});

test('sedes homonimas se acotan por institucion', async () => {
  const { matchCoverageAssignmentDetailed } = await modulePromise;
  const result = matchCoverageAssignmentDetailed({
    municipio: 'ACACIAS',
    institucion_educativa: 'IE DOS',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 1,
      sede_modalidad_id: 11,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA UNO',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    },
    {
      focalizacion_final_id: 5,
      sede_modalidad_id: 15,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 8,
      institucion_nombre: 'INSTITUCION EDUCATIVA DOS',
      sede_id: 7,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], [], [
    { id: 1, codigo_dane: null, nombre_municipio: 'ACACIAS' }
  ], [
    { id: 2, municipio_id: 1, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA UNO' },
    { id: 8, municipio_id: 1, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA DOS' }
  ], [
    { id: 3, institucion_id: 2, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE PRINCIPAL' },
    { id: 7, institucion_id: 8, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE PRINCIPAL' }
  ], [
    { id: 4, codigo_original: 'CAA', codigo_base: 'CAA', nombre_modalidad: 'Atención CAA' }
  ]);
  assert.equal(result.status, 'ASIGNACION_OK');
  assert.equal(result.sede_modalidad_id, 15);
});

test('sede modalidad inexistente no se acepta automaticamente', async () => {
  const { matchCoverageAssignmentDetailed } = await modulePromise;
  const result = matchCoverageAssignmentDetailed({
    municipio: 'ACACIAS',
    institucion_educativa: 'IE CENTRAL',
    sede: 'SEDE PRINCIPAL',
    modalidad: 'CAJU-RI'
  }, [
    {
      focalizacion_final_id: 1,
      sede_modalidad_id: 11,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA CENTRAL',
      sede_id: 3,
      sede_nombre: 'SEDE PRINCIPAL',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], [], [
    { id: 1, codigo_dane: null, nombre_municipio: 'ACACIAS' }
  ], [
    { id: 2, municipio_id: 1, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA CENTRAL' }
  ], [
    { id: 3, institucion_id: 2, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE PRINCIPAL' }
  ], [
    { id: 4, codigo_original: 'CAA', codigo_base: 'CAA', nombre_modalidad: 'Atención CAA' },
    { id: 5, codigo_original: 'CAJU-RI', codigo_base: 'CAJU-RI', nombre_modalidad: 'Residencia Indigena' }
  ]);
  assert.equal(result.status, 'SEDE_MODALIDAD_NO_EXISTE');
});

test('alias ambiguo generado se rechaza', async () => {
  const { matchCoverageAssignmentDetailed } = await modulePromise;
  const result = matchCoverageAssignmentDetailed({
    municipio: 'ACACIAS',
    institucion_educativa: 'INSTITUCION EDUCATIVA CENTRAL',
    sede: 'EL CARMEN',
    modalidad: 'CAA'
  }, [
    {
      focalizacion_final_id: 1,
      sede_modalidad_id: 11,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA CENTRAL',
      sede_id: 3,
      sede_nombre: 'SEDE EL CARMEN',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    },
    {
      focalizacion_final_id: 2,
      sede_modalidad_id: 12,
      municipio_id: 1,
      municipio_nombre: 'ACACIAS',
      institucion_id: 2,
      institucion_nombre: 'INSTITUCION EDUCATIVA CENTRAL',
      sede_id: 5,
      sede_nombre: 'PRINCIPAL EL CARMEN',
      modalidad_id: 4,
      modalidad_nombre: 'Atención CAA',
      modalidad_codigo_original: 'CAA',
      cobertura_requerida: 1
    }
  ], [], [], [], [
    { id: 1, codigo_dane: null, nombre_municipio: 'ACACIAS' }
  ], [
    { id: 2, municipio_id: 1, codigo_dane: null, nombre_institucion: 'INSTITUCION EDUCATIVA CENTRAL' }
  ], [
    { id: 3, institucion_id: 2, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'SEDE EL CARMEN' },
    { id: 5, institucion_id: 2, municipio_id: 1, codigo_dane: null, consecutivo_sede: null, nombre_sede: 'PRINCIPAL EL CARMEN' }
  ], [
    { id: 4, codigo_original: 'CAA', codigo_base: 'CAA', nombre_modalidad: 'Atención CAA' }
  ]);
  assert.equal(result.status, 'AMBIGUA');
});

test('ubicacion operativa bodega granada usa alias hacia bodega granada', async () => {
  const { resolveLaborLocation } = await modulePromise;
  const result = resolveLaborLocation({
    cargo_laboral: 'OPERARIOS DE BODEGA, TRANSPORTADORES Y AUXILIARES',
    asignacion_laboral: 'BODEGA',
    ubicacion_operativa: 'BODEGA RP GRANADA',
    municipio: null,
    institucion_educativa: null,
    sede: null,
    modalidad: null
  }, [
    { id: 9, nombre_ubicacion: 'BODEGA GRANADA' }
  ]);
  assert.equal(result.status, 'UBICACION_OK');
  assert.equal(result.resolved?.id, 9);
});

test('licitacion presentada se normaliza por SI y luego el documental queda pendiente', async () => {
  const { normalizePresentedLicitacion } = await modulePromise;
  assert.equal(normalizePresentedLicitacion('SI'), true);
  assert.equal(normalizePresentedLicitacion('NO'), false);
});

test('cobertura y licitacion se calculan por canales distintos sin duplicar persona', async () => {
  const { buildCoverageDelta, buildLicitacionQuotaDelta } = await import('../modules/vinculaciones/' + 'vinculaciones.personal.domain.ts');
  assert.equal(buildCoverageDelta(1, 1).estado, 'COMPLETA');
  assert.equal(buildLicitacionQuotaDelta(1, 1).estado, 'CUMPLE');
});

test('csv builder conserva columnas y serializa arrays', async () => {
  const { buildCsv } = await modulePromise;
  const csv = buildCsv([
    { fila: 2, problemas: ['A', 'B'] }
  ], ['fila', 'problemas']);
  assert.match(csv, /fila,problemas/);
  assert.match(csv, /A \| B/);
});
