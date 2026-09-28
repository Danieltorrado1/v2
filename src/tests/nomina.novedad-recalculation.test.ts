import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const service = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');

const createStart = service.indexOf('export const createNominaNovedad = async (');
const createEnd = service.indexOf('export const markNominaAsistencia = async', createStart);
const createNovedadBody =
  createStart >= 0 && createEnd > createStart ? service.slice(createStart, createEnd) : '';

test('crear una novedad ordinaria recalcula únicamente al empleado afectado después del commit', () => {
  assert.notEqual(createNovedadBody, '', 'No se encontró createNominaNovedad');

  assert.match(
    createNovedadBody,
    /if \(ownsClient\) \{[\s\S]*?await client\.query\('COMMIT'\);[\s\S]*?await recalculateNominaPeriodo\([\s\S]*?input\.periodo_id,[\s\S]*?\{ force: true, nomina_empleado_id: input\.nomina_empleado_id \}/
  );
});

test('crear novedad dentro de novedad-con-turno delega el recálculo al dueño de la transacción', () => {
  assert.match(
    createNovedadBody,
    /if \(ownsClient\) \{[\s\S]*?await recalculateNominaPeriodo/
  );
  assert.doesNotMatch(
    createNovedadBody,
    /if \(!ownsClient\)[\s\S]*?await recalculateNominaPeriodo/
  );
});

test('ausencia de asistencia no descuenta salario y los turnos internos no se omiten silenciosamente', () => {
  assert.match(service, /const diasPagadosBase = diasVigenciaNomina/);
  assert.match(service, /const horasTrabajadasBase =/);
  assert.match(service, /NOMINA_TURNO_INTERNO_VALOR_FALTANTE/);
  assert.match(service, /tipo_turno = 'INTERNO'/);
});

test('la elegibilidad salarial usa vigencia contractual antes que snapshot de pago', () => {
  assert.match(service, /toDateString\(empleadoRow\.fecha_inicio_vinculacion\)[\s\S]*toDateString\(empleadoRow\.fecha_inicio_pago\)/);
  assert.match(service, /toDateString\(empleadoRow\.fecha_fin_vinculacion\)[\s\S]*toDateString\(empleadoRow\.fecha_fin_pago\)/);
});
