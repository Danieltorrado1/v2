import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const checklistModulePromise = import(
  pathToFileURL(
    path.join(root, 'src/modules/documentos/documentos.checklist.service.ts')
  ).href
);
const personalDomainPromise = import(
  pathToFileURL(
    path.join(root, 'src/modules/vinculaciones/vinculaciones.personal.domain.ts')
  ).href
);

const CARGO_MANIPULADORA = 33;
const CARGO_ADMINISTRATIVO = 38;
const TIPO_VINCULACION_LABORAL = 1;
const TIPO_VINCULACION_OPS = 2;

const buildRequirement = (overrides: Partial<{
  ambito_documental: 'PERSONA' | 'VINCULACION';
  codigo: string | null;
  contrato_cargo_id: number | null;
  dias_proximo_vencimiento: number;
  id: number;
  nombre_documento: string | null;
  nombre_requisito: string;
  obligatorio: boolean;
  requiere_fecha_expedicion: boolean;
  requiere_fecha_vencimiento: boolean;
  tipo_documento_id: number;
  tipo_vinculacion_id: number | null;
  vigencia_meses: number | null;
}> = {}) => ({
  id: 1,
  nombre_requisito: 'Documento general',
  obligatorio: true,
  ambito_documental: 'PERSONA' as const,
  requiere_fecha_expedicion: false,
  requiere_fecha_vencimiento: false,
  vigencia_meses: null,
  dias_proximo_vencimiento: 30,
  contrato_cargo_id: null,
  tipo_vinculacion_id: null,
  tipo_documento_id: 10,
  codigo: 'DOC_GENERAL',
  nombre_documento: 'Documento general',
  ...overrides
});

const buildDocument = (overrides: Partial<{
  activo: boolean;
  fecha_carga: string | null;
  fecha_expedicion: string | null;
  fecha_vencimiento: string | null;
  id: number;
  nombre_original: string;
  tipo_documento_id: number;
  tipo_documento_nombre: string | null;
}> = {}) => ({
  id: 101,
  tipo_documento_id: 10,
  tipo_documento_nombre: 'Documento general',
  nombre_original: 'general.pdf',
  fecha_expedicion: null,
  fecha_vencimiento: null,
  fecha_carga: '2026-08-01',
  activo: true,
  ...overrides
});

const requirements = [
  buildRequirement({
    id: 1,
    nombre_requisito: 'Documento general personal',
    tipo_documento_id: 10
  }),
  buildRequirement({
    id: 2,
    nombre_requisito: 'Carnet manipuladora',
    contrato_cargo_id: CARGO_MANIPULADORA,
    tipo_documento_id: 11
  }),
  buildRequirement({
    id: 3,
    nombre_requisito: 'Soporte administrativo',
    contrato_cargo_id: CARGO_ADMINISTRATIVO,
    tipo_documento_id: 12
  }),
  buildRequirement({
    id: 4,
    nombre_requisito: 'Cuenta de cobro OPS',
    ambito_documental: 'VINCULACION',
    tipo_vinculacion_id: TIPO_VINCULACION_OPS,
    tipo_documento_id: 13
  }),
  buildRequirement({
    id: 5,
    nombre_requisito: 'Afiliacion laboral',
    ambito_documental: 'VINCULACION',
    tipo_vinculacion_id: TIPO_VINCULACION_LABORAL,
    tipo_documento_id: 14
  }),
  buildRequirement({
    id: 6,
    nombre_requisito: 'Checklist administrativo OPS',
    ambito_documental: 'VINCULACION',
    contrato_cargo_id: CARGO_ADMINISTRATIVO,
    tipo_vinculacion_id: TIPO_VINCULACION_OPS,
    tipo_documento_id: 15
  })
];

test('manipuladora laboral recibe el checklist contextual de cargo y tipo correspondiente', async () => {
  const { filterContextualChecklistRequirements } = await checklistModulePromise;

  const selected = filterContextualChecklistRequirements(requirements, {
    contratoCargoId: CARGO_MANIPULADORA,
    tipoVinculacionId: TIPO_VINCULACION_LABORAL
  });

  assert.deepEqual(
    selected.map((item: { id: number }) => item.id),
    [1, 2, 5]
  );
});

test('administrativo laboral recibe su checklist contextual sin mezclar requisitos de manipuladora u OPS', async () => {
  const { filterContextualChecklistRequirements } = await checklistModulePromise;

  const selected = filterContextualChecklistRequirements(requirements, {
    contratoCargoId: CARGO_ADMINISTRATIVO,
    tipoVinculacionId: TIPO_VINCULACION_LABORAL
  });

  assert.deepEqual(
    selected.map((item: { id: number }) => item.id),
    [1, 3, 5]
  );
});

test('OPS recibe requisitos por tipo de vinculacion y por combinacion contextual cuando aplica', async () => {
  const { filterContextualChecklistRequirements } = await checklistModulePromise;

  const selected = filterContextualChecklistRequirements(requirements, {
    contratoCargoId: CARGO_ADMINISTRATIVO,
    tipoVinculacionId: TIPO_VINCULACION_OPS
  });

  assert.deepEqual(
    selected.map((item: { id: number }) => item.id),
    [1, 3, 4, 6]
  );
});

test('persona sin documentos queda pendiente con faltantes correctamente detectados', async () => {
  const { buildContextualChecklistSnapshot, filterContextualChecklistRequirements } =
    await checklistModulePromise;

  const selected = filterContextualChecklistRequirements(requirements, {
    contratoCargoId: CARGO_ADMINISTRATIVO,
    tipoVinculacionId: TIPO_VINCULACION_LABORAL
  });

  const checklist = buildContextualChecklistSnapshot({
    vinculacionId: 5001,
    personaId: 7001,
    contratoId: 24,
    contratoCargoId: CARGO_ADMINISTRATIVO,
    requirements: selected,
    personaDocuments: [],
    vinculacionDocuments: [],
    todayIso: '2026-08-21'
  });

  assert.equal(checklist.tiene_configuracion, true);
  assert.equal(checklist.total_requisitos, 3);
  assert.equal(checklist.pendientes, 3);
  assert.equal(checklist.faltantes, 3);
  assert.equal(checklist.cargados, 0);
  assert.equal(checklist.cumplimiento_porcentaje, 0);
});

test('persona con todos los documentos requeridos queda completa en su contexto', async () => {
  const { buildContextualChecklistSnapshot, filterContextualChecklistRequirements } =
    await checklistModulePromise;

  const selected = filterContextualChecklistRequirements(requirements, {
    contratoCargoId: CARGO_MANIPULADORA,
    tipoVinculacionId: TIPO_VINCULACION_LABORAL
  });

  const checklist = buildContextualChecklistSnapshot({
    vinculacionId: 5002,
    personaId: 7002,
    contratoId: 24,
    contratoCargoId: CARGO_MANIPULADORA,
    requirements: selected,
    personaDocuments: [
      buildDocument({ id: 201, tipo_documento_id: 10 }),
      buildDocument({ id: 202, tipo_documento_id: 11, nombre_original: 'carnet.pdf' })
    ],
    vinculacionDocuments: [
      buildDocument({
        id: 203,
        tipo_documento_id: 14,
        tipo_documento_nombre: 'Afiliacion laboral',
        nombre_original: 'afiliacion.pdf'
      })
    ],
    todayIso: '2026-08-21'
  });

  assert.equal(checklist.total_requisitos, 3);
  assert.equal(checklist.completos, 3);
  assert.equal(checklist.cargados, 3);
  assert.equal(checklist.pendientes, 0);
  assert.equal(checklist.cumplimiento_porcentaje, 100);
});

test('perfil de licitacion sin requisitos configurados queda pendiente y no se marca como cumple automaticamente', async () => {
  const { buildContextualChecklistSnapshot } = await checklistModulePromise;
  const { deriveCumpleRequisitosState } = await personalDomainPromise;
  const serviceSource = readFileSync(
    path.join(root, 'src/modules/vinculaciones/vinculaciones.personal.service.ts'),
    'utf8'
  );

  const checklist = buildContextualChecklistSnapshot({
    vinculacionId: 5003,
    personaId: 7003,
    contratoId: 24,
    contratoCargoId: CARGO_MANIPULADORA,
    requirements: [],
    personaDocuments: [],
    vinculacionDocuments: [],
    todayIso: '2026-08-21'
  });

  assert.equal(checklist.tiene_configuracion, false);
  assert.equal(checklist.cumplimiento_porcentaje, 0);
  assert.equal(
    deriveCumpleRequisitosState({
      checklistTieneConfiguracion: checklist.tiene_configuracion,
      checklistCumplimientoPorcentaje: checklist.cumplimiento_porcentaje,
      cumpleRequisitosExplicit: null
    }),
    'PENDIENTE'
  );
  assert.match(
    serviceSource,
    /cumpleRequisitos = checklist\.tiene_configuracion && checklist\.cumplimiento_porcentaje >= 100\s*\?\s*true\s*:\s*null/
  );
});
