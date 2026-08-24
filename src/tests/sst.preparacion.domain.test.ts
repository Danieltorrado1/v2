import test from 'node:test';
import assert from 'node:assert/strict';

const domainPromise = import('../modules/sst/' + 'sst.preparacion.domain.ts');

test('clasifica propuesta de contacto de emergencia sin tocar el maestro', async () => {
  const { classifyEmergencyContactProposal } = await domainPromise;

  const contactNew = classifyEmergencyContactProposal(
    { nombre_contacto: null, parentesco: null, telefono: null },
    { nombre_contacto: 'Maria Perez', parentesco: 'Madre', telefono: '300 111 2233' }
  );

  assert.equal(contactNew.classification, 'CONTACTO_NUEVO');
  assert.equal(contactNew.payload?.telefono, '3001112233');

  const same = classifyEmergencyContactProposal(
    { nombre_contacto: 'Maria Perez', parentesco: 'Madre', telefono: '3001112233' },
    { nombre_contacto: 'MARIA PEREZ', parentesco: 'madre', telefono: '(300) 111-2233' }
  );

  assert.equal(same.classification, 'COINCIDE');
  assert.equal(same.payload, null);
});

test('genera multiples borradores de formacion academica desde titulo y estudio actual', async () => {
  const { buildAcademicFormationDrafts } = await domainPromise;

  const drafts = buildAcademicFormationDrafts({
    nivel_escolaridad: 'TECNICO',
    titulo_obtenido: 'TECNICO EN COCINA',
    estudia_actualmente: 'SI',
    programa_actual: 'ADMINISTRACION EN SALUD'
  });

  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.estado_formacion, 'FINALIZADO');
  assert.equal(drafts[1]?.estado_formacion, 'EN_CURSO');
});

test('separa campos restringidos SST y deriva completitud tecnica para el plan', async () => {
  const { buildRestrictedSstPayload, derivePreparationCompletenessStatus } = await domainPromise;

  const restricted = buildRestrictedSstPayload({
    tiene_discapacidad: true,
    tipo_discapacidad: 'Visual',
    presenta_alergias: 'Polen',
    tipo_sangre_rh: 'O+'
  });

  assert.deepEqual(Object.keys(restricted).sort(), [
    'presenta_alergias',
    'tiene_discapacidad',
    'tipo_discapacidad',
    'tipo_sangre_rh'
  ]);

  assert.equal(derivePreparationCompletenessStatus('APTO_APPLY_AUTOMATICO', 100), 'COMPLETA');
  assert.equal(derivePreparationCompletenessStatus('APTO_APPLY_PARCIAL', 80), 'INCOMPLETA');
  assert.equal(derivePreparationCompletenessStatus('SIN_DATOS_DIGITALES', 0), 'NO_REALIZADA');
  assert.equal(derivePreparationCompletenessStatus('REQUIERE_REVISION', 100), 'REQUIERE_REVISION');
});
