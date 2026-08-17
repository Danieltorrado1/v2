import test from 'node:test';
import assert from 'node:assert/strict';

const contratosDomainPromise = import('../modules/contratos/' + 'contratos.domain.ts');

test('permite crear contrato sin fecha final y mantenerlo en borrador por evento de creacion', async () => {
  const { resolveContratoEstadoPosterior } = await contratosDomainPromise;
  const result = resolveContratoEstadoPosterior('BORRADOR', 'CREACION');
  assert.equal(result.allowed, true);
  assert.equal(result.nextState, 'BORRADOR');
});

test('acta de inicio activa un contrato pendiente', async () => {
  const { resolveContratoEstadoPosterior } = await contratosDomainPromise;
  const result = resolveContratoEstadoPosterior('PENDIENTE_INICIO', 'ACTA_INICIO');
  assert.equal(result.allowed, true);
  assert.equal(result.nextState, 'ACTIVO');
});

test('prorroga conserva historial y cambia estado a prorrogado', async () => {
  const { resolveContratoEstadoPosterior } = await contratosDomainPromise;
  const result = resolveContratoEstadoPosterior('ACTIVO', 'PRORROGA');
  assert.equal(result.allowed, true);
  assert.equal(result.nextState, 'PRORROGADO');
});

test('impide reinicio si el contrato no estaba suspendido', async () => {
  const { resolveContratoEstadoPosterior } = await contratosDomainPromise;
  const result = resolveContratoEstadoPosterior('ACTIVO', 'REINICIO');
  assert.equal(result.allowed, false);
  assert.match(result.reason ?? '', /suspendido/i);
});

test('permite reiniciar contrato suspendido', async () => {
  const { resolveContratoEstadoPosterior } = await contratosDomainPromise;
  const result = resolveContratoEstadoPosterior('SUSPENDIDO', 'REINICIO');
  assert.equal(result.allowed, true);
  assert.equal(result.nextState, 'ACTIVO');
});

test('liquidacion solo es valida para contratos finalizados', async () => {
  const { resolveContratoEstadoPosterior } = await contratosDomainPromise;
  const activeResult = resolveContratoEstadoPosterior('ACTIVO', 'LIQUIDACION');
  const finishedResult = resolveContratoEstadoPosterior('FINALIZADO', 'LIQUIDACION');

  assert.equal(activeResult.allowed, false);
  assert.equal(finishedResult.allowed, true);
  assert.equal(finishedResult.nextState, 'LIQUIDADO');
});

test('bloquea reactivacion manual de un contrato anulado', async () => {
  const { validateManualContratoStateChange } = await contratosDomainPromise;
  const result = validateManualContratoStateChange('ANULADO', 'ACTIVO');
  assert.equal(result.allowed, false);
});

test('documento aprobado sin vencimiento queda vigente', async () => {
  const { resolveContratoDocumentoEstado } = await contratosDomainPromise;
  const result = resolveContratoDocumentoEstado(
    {
      activo: true,
      es_vigente: true,
      estado_revision: 'APROBADO',
      fecha_vencimiento: null,
      dias_alerta: 30
    },
    '2026-08-05'
  );

  assert.equal(result, 'VIGENTE');
});

test('documento detecta proximidad de vencimiento', async () => {
  const { resolveContratoDocumentoEstado } = await contratosDomainPromise;
  const result = resolveContratoDocumentoEstado(
    {
      activo: true,
      es_vigente: true,
      estado_revision: 'APROBADO',
      fecha_vencimiento: '2026-08-25',
      dias_alerta: 30
    },
    '2026-08-05'
  );

  assert.equal(result, 'PROXIMO_A_VENCER');
});

test('documento detecta vencimiento', async () => {
  const { resolveContratoDocumentoEstado } = await contratosDomainPromise;
  const result = resolveContratoDocumentoEstado(
    {
      activo: true,
      es_vigente: true,
      estado_revision: 'APROBADO',
      fecha_vencimiento: '2026-08-01',
      dias_alerta: 30
    },
    '2026-08-05'
  );

  assert.equal(result, 'VENCIDO');
});

test('documento devuelto prevalece sobre vigencia', async () => {
  const { resolveContratoDocumentoEstado } = await contratosDomainPromise;
  const result = resolveContratoDocumentoEstado(
    {
      activo: true,
      es_vigente: true,
      estado_revision: 'DEVUELTO',
      fecha_vencimiento: '2026-09-01',
      dias_alerta: 30
    },
    '2026-08-05'
  );

  assert.equal(result, 'DEVUELTO');
});

test('checklist distingue pendiente, revision, vencido y excepcion abierta', async () => {
  const { resolveContratoChecklistEstado } = await contratosDomainPromise;
  assert.equal(
    resolveContratoChecklistEstado({
      obligatorio: true,
      no_aplica: false,
      documento_estado: null,
      excepcion_estado: null
    }),
    'PENDIENTE'
  );

  assert.equal(
    resolveContratoChecklistEstado({
      obligatorio: true,
      no_aplica: false,
      documento_estado: 'EN_REVISION',
      excepcion_estado: null
    }),
    'EN_REVISION'
  );

  assert.equal(
    resolveContratoChecklistEstado({
      obligatorio: true,
      no_aplica: false,
      documento_estado: 'VENCIDO',
      excepcion_estado: null
    }),
    'VENCIDO'
  );

  assert.equal(
    resolveContratoChecklistEstado({
      obligatorio: true,
      no_aplica: false,
      documento_estado: null,
      excepcion_estado: 'ABIERTA'
    }),
    'APROBADO_PROVISIONAL'
  );
});

test('calcula completitud sin contar no aplica', async () => {
  const { calculateContratoChecklistCompletion } = await contratosDomainPromise;
  const completion = calculateContratoChecklistCompletion([
    'CUMPLIDO',
    'APROBADO_PROVISIONAL',
    'PENDIENTE',
    'NO_APLICA'
  ]);

  assert.equal(completion, 66.67);
});
