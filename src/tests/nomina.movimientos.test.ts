import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AppError } from '../utils/AppError';
import {
  appendNominaMovimientoAlert,
  normalizeNominaMovimientoEstado,
  resolveNominaMovimientoFamilia,
  resolveNominaMovimientoValue
} from '../modules/nomina/nomina.movimientos';
import {
  createNominaMovimientoSchema,
  nominaMovimientoEstadoActionSchema,
  updateNominaMovimientoSchema
} from '../modules/nomina/nomina.schemas';

test('TURNO_EXTERNO se clasifica como ADICION_DEVENGO', () => {
  assert.equal(resolveNominaMovimientoFamilia('TURNO_EXTERNO'), 'ADICION_DEVENGO');
  assert.equal(resolveNominaMovimientoFamilia('BONIFICACION'), 'GENERAL');
});

test('normaliza estados validos y rechaza estados invalidos', () => {
  assert.equal(normalizeNominaMovimientoEstado(undefined), 'PENDIENTE');
  assert.equal(normalizeNominaMovimientoEstado(' aprobado '), 'APROBADO');

  assert.throws(
    () => normalizeNominaMovimientoEstado('cerrado'),
    (error: unknown) =>
      error instanceof AppError && error.code === 'NOMINA_MOVIMIENTO_ESTADO_INVALIDO'
  );
});

test('resuelve valor calculado desde cantidad por valor unitario', () => {
  const result = resolveNominaMovimientoValue({
    cantidad: 2,
    valor_unitario: 56823.13
  });

  assert.equal(result.cantidad, 2);
  assert.equal(result.valor_calculado, 113646.26);
  assert.equal(result.valor_aplicado, 113646.26);
  assert.equal(result.ajuste_manual, false);
});

test('exige motivo cuando valor aplicado difiere del calculado', () => {
  assert.throws(
    () =>
      resolveNominaMovimientoValue({
        cantidad: 1,
        valor_calculado: 56823.13,
        valor_aplicado: 60000
      }),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === 'NOMINA_MOVIMIENTO_MOTIVO_AJUSTE_REQUERIDO'
  );
});

test('preserva valor calculado y aplicado cuando hay ajuste manual justificado', () => {
  const result = resolveNominaMovimientoValue({
    cantidad: 1,
    valor_calculado: 56823.13,
    valor_aplicado: 60000,
    motivo_ajuste_valor: 'Ajuste manual autorizado'
  });

  assert.equal(result.valor_calculado, 56823.13);
  assert.equal(result.valor_aplicado, 60000);
  assert.equal(result.ajuste_manual, true);
  assert.equal(result.motivo_ajuste_valor, 'Ajuste manual autorizado');
});

test('deduplica alertas equivalentes', () => {
  const alert = {
    tipo: 'POSIBLE_DUPLICADO' as const,
    severidad: 'WARNING' as const,
    mensaje: 'Posible duplicado'
  };

  const first = appendNominaMovimientoAlert([], alert);
  const second = appendNominaMovimientoAlert(first, alert);

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
});

test('schema de creacion exige vinculacion reemplazada cuando hay persona reemplazada', () => {
  assert.throws(
    () =>
      createNominaMovimientoSchema.parse({
        periodo_id: '2',
        nomina_empleado_id: '10',
        vinculacion_id: '24',
        tipo_movimiento: 'TURNO_EXTERNO',
        valor_aplicado: 50000,
        persona_reemplazada_id: '100'
      }),
    /vinculacion_reemplazada_id is required/i
  );
});

test('schema de update permite editar datos operativos sin estado y el action schema limita payloads de transicion', () => {
  const updated = updateNominaMovimientoSchema.parse({
    descripcion: 'Turno adicional nocturno',
    valor_aplicado: 60000
  });

  assert.equal(updated.descripcion, 'Turno adicional nocturno');
  assert.equal(updated.valor_aplicado, 60000);

  assert.deepEqual(
    nominaMovimientoEstadoActionSchema.parse({
      motivo_estado: 'Validado por coordinacion'
    }),
    {
      motivo_estado: 'Validado por coordinacion'
    }
  );

  assert.throws(
    () =>
      nominaMovimientoEstadoActionSchema.parse({
        motivo_estado: 'x',
        estado: 'APROBADO'
      }),
    /unrecognized/i
  );
});

test('rutas de movimientos usan permisos granulares y endpoints explicitos de revision/aprobacion', () => {
  const routeSource = readFileSync(
    path.resolve(process.cwd(), 'src', 'modules', 'nomina', 'nomina.routes.ts'),
    'utf8'
  );

  assert.match(
    routeSource,
    /nominaRoutes\.get\(\s*'\/movimientos',\s*requirePermissions\('nomina\.movimientos\.read'\),\s*getNominaMovimientosHandler/s
  );
  assert.match(
    routeSource,
    /nominaRoutes\.post\(\s*'\/movimientos',\s*requirePermissions\('nomina\.movimientos\.create'\),\s*createNominaMovimientoHandler/s
  );
  assert.match(
    routeSource,
    /nominaRoutes\.patch\(\s*'\/movimientos\/:id',\s*requirePermissions\('nomina\.movimientos\.update'\),\s*updateNominaMovimientoHandler/s
  );
  assert.match(
    routeSource,
    /nominaRoutes\.patch\(\s*'\/movimientos\/:id\/revisar',\s*requirePermissions\('nomina\.movimientos\.review'\),\s*reviewNominaMovimientoHandler/s
  );
  assert.match(
    routeSource,
    /nominaRoutes\.patch\(\s*'\/movimientos\/:id\/aprobar',\s*requirePermissions\('nomina\.movimientos\.approve'\),\s*approveNominaMovimientoHandler/s
  );
  assert.match(
    routeSource,
    /nominaRoutes\.patch\(\s*'\/movimientos\/:id\/deactivate',\s*requirePermissions\('nomina\.movimientos\.deactivate'\),\s*deactivateNominaMovimientoHandler/s
  );
});
