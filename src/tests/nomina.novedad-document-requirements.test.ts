import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync('sql/phase-44-nomina-document-requirements-matrix.sql', 'utf8');
const reviewMigration = readFileSync('sql/phase-45-nomina-document-review-workflow.sql', 'utf8');
const documents = readFileSync('src/modules/nomina/cobertura.novedad-documentos.ts', 'utf8');
const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');
const page = readFileSync('FrontendNuevo/src/pages/nomina/NominaPage.tsx', 'utf8');
const externals = readFileSync('src/modules/nomina/cobertura.externos.service.ts', 'utf8');

test('la matriz documental definitiva usa tres banderas independientes', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS requiere_autorizacion_descuento BOOLEAN NOT NULL DEFAULT FALSE/);
  assert.match(migration, /requiere_solicitud_permiso = TRUE,[\s\S]*requiere_soporte = TRUE,[\s\S]*requiere_autorizacion_descuento = TRUE[\s\S]*codigo_operativo[^\n]*PNR/);
  assert.match(migration, /requiere_autorizacion_descuento = TRUE[\s\S]*codigo_operativo[^\n]*FNJ/);
  assert.match(migration, /codigo_operativo[^\n]*IN \('INC_GENERAL', 'INC_ARL'\)/);
  assert.match(migration, /UPPER\(BTRIM\(COALESCE\(nombre, ''\)\)\) IN \([\s\S]*'LUTO'[\s\S]*'ACCIDENTE DE TRABAJO'/);
});

test('el backend expone y persiste los tres slots documentales', () => {
  assert.match(documents, /NOMINA_NOVEDAD_DOCUMENT_SLOTS = \['SOPORTE', 'SOLICITUD_PERMISO', 'AUTORIZACION_DESCUENTO'\]/);
  assert.match(documents, /relation: 'AUTORIZACION_DESCUENTO'/);
  assert.match(service, /AUTORIZACION_DESCUENTO:[\s\S]*requerido: toBooleanValue\(row\.tipo_novedad_requiere_autorizacion_descuento\)/);
  assert.match(service, /assertNovedadRequiredDocuments\(Number\(parsedId\.entidad_id\), tenant\)/);
});

test('Novedades presenta autorización de descuento como requisito independiente', () => {
  assert.match(page, /Autorización de descuento/);
  assert.match(page, /slots\.AUTORIZACION_DESCUENTO/);
  assert.match(page, /handleUploadNovedadDocument\(selectedNovedad\.id, tipo/);
});

test('los documentos siguen el flujo pendiente, aprobación y rechazo con trazabilidad', () => {
  assert.match(reviewMigration, /estado_revision VARCHAR\(32\) NOT NULL DEFAULT 'PENDIENTE_VALIDACION'/);
  assert.match(documents, /estado_revision = \$2/);
  assert.match(documents, /El motivo de rechazo es obligatorio/);
  assert.match(documents, /Solo se pueden revisar documentos pendientes/);
  assert.match(documents, /El documento solo puede reemplazarse/);
  assert.match(documents, /todos los documentos obligatorios/);
});

test('el resumen de externos cuenta movimientos únicos activos del período', () => {
  assert.match(externals, /COUNT\(DISTINCT nm\.id\) FILTER/);
  assert.match(externals, /nm\.tipo_movimiento = 'TURNO_EXTERNO'/);
  assert.match(externals, /AND nm\.periodo_id = \$\$\{periodoParamIndex\}/);
});
