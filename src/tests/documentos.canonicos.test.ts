import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContextualChecklistSnapshot, resolveCanonicalApplicability } from '../modules/documentos/documentos.checklist.service';

const requirement = (id: number, name: string, typeId: number, extra: Record<string, unknown> = {}) => ({ id, nombre_requisito: name, tipo_documento_id: typeId, tipo_documento_ids: [typeId], codigo: name, nombre_documento: name, ambito_documental: 'PERSONA' as const, obligatorio: true, requiere_fecha_expedicion: false, requiere_fecha_vencimiento: false, vigencia_meses: null, dias_proximo_vencimiento: 30, contrato_cargo_id: null, tipo_vinculacion_id: null, ...extra });
const document = (id: number, typeId: number) => ({ id, tipo_documento_id: typeId, tipo_documento_nombre: null, nombre_original: 'archivo.pdf', fecha_expedicion: null, fecha_vencimiento: null, fecha_carga: '2026-01-01', activo: true, estado_revision: 'APROBADO' });

test('identidad acepta cualquier alias y no duplica denominador', () => {
  const result = buildContextualChecklistSnapshot({ vinculacionId: 1, personaId: 1, contratoId: 1, contratoCargoId: 1, requirements: [requirement(1, 'Documento de identidad', 1, { tipo_documento_ids: [1, 2] }), requirement(2, 'Hoja de vida', 3)], personaDocuments: [document(9, 2), document(10, 3)], vinculacionDocuments: [], todayIso: '2026-01-02' });
  assert.equal(result.total_requisitos, 2);
  assert.equal(result.completos, 2);
  assert.equal(result.cumplimiento_porcentaje, 100);
});

test('acreditable y no aplica no entran al denominador; cero exigibles tiene mensaje semántico', () => {
  const result = buildContextualChecklistSnapshot({ vinculacionId: 1, personaId: 1, contratoId: 1, contratoCargoId: 1, requirements: [requirement(1, 'Formación', 1, { obligatorio: false, cuenta_cumplimiento: false, tipo_requisito: 'ACREDITABLE' }), requirement(2, 'Pensión', 2, { obligatorio: false, cuenta_cumplimiento: false, tipo_requisito: 'CONDICIONAL' })], personaDocuments: [], vinculacionDocuments: [], todayIso: '2026-01-02' });
  assert.equal(result.total_requisitos, 0);
  assert.equal(result.cumplimiento_porcentaje, 0);
  assert.equal(result.tiene_configuracion, false);
});

test('manipulación compuesta se evalúa como un requisito único', () => {
  const result = buildContextualChecklistSnapshot({ vinculacionId: 1, personaId: 1, contratoId: 1, contratoCargoId: 1, requirements: [requirement(1, 'Manipulación', 5, { tipo_documento_ids: [5, 6], codigo: 'MANIPULACION' })], personaDocuments: [document(9, 5)], vinculacionDocuments: [], todayIso: '2026-01-02' });
  assert.equal(result.total_requisitos, 1);
  assert.equal(result.completos, 0);
  assert.equal(result.pendientes, 1);
  assert.equal(result.cumplimiento_porcentaje, 0);
});

for (const cotiza of [false, true, null]) {
  for (const regla of [false, true, null]) {
    test(`pensión cotiza=${cotiza} regla=${regla} permanece visible con estado aplicable`, () => {
      const applicability = resolveCanonicalApplicability('PENSION', 'CONDICIONAL', regla, cotiza);
      const result = buildContextualChecklistSnapshot({ vinculacionId: 1, personaId: 1, contratoId: 1, contratoCargoId: 1,
        requirements: [requirement(1, 'PENSION', 1, { ...applicability, tipo_requisito: 'CONDICIONAL' })], personaDocuments: [], vinculacionDocuments: [] });
      assert.equal(result.requisitos.length, 1);
      assert.equal(result.requisitos[0]!.estado_detallado, cotiza !== false && regla === true ? 'SIN_DOCUMENTO' : 'NO_APLICA');
    });
  }
}
test('regla no aplicable prevalece incluso si existe documento y no agrega deuda', () => {
  const result = buildContextualChecklistSnapshot({ vinculacionId: 1, personaId: 1, contratoId: 1, contratoCargoId: 1,
    requirements: [requirement(1, 'PENSION', 1, { aplica: false })], personaDocuments: [document(1,1)], vinculacionDocuments: [] });
  assert.equal(result.requisitos[0]!.estado_detallado, 'NO_APLICA');
  assert.equal(result.requisitos[0]!.documento_id, 1);
  assert.equal(result.total_requisitos, 0);
});
test('acreditables conservan todos sus documentos sin aumentar porcentaje', () => {
  const result = buildContextualChecklistSnapshot({ vinculacionId: 1, personaId: 1, contratoId: 1, contratoCargoId: 1,
    requirements: [requirement(1, 'FORMACION', 1, { obligatorio: false, cuenta_cumplimiento: false, tipo_requisito: 'ACREDITABLE' })],
    personaDocuments: [document(1,1),document(2,1)], vinculacionDocuments: [] });
  assert.equal(result.requisitos[0]!.documentos?.length, 2);
  assert.equal(result.total_requisitos, 0);
});
