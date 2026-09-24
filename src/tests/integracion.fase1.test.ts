import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { aggregateEventOrderKey, classifyIntegracionImpact } from '../modules/integracion/integracion.domain';

const read = (file: string) => readFileSync(file, 'utf8');

test('contexto laboral y outbox exigen fecha efectiva y granularidad por vinculación', () => {
  const context = read('src/modules/integracion/contexto-laboral.service.ts');
  const migration = read('sql/phase-52-integracion-outbox.sql');
  assert.match(context, /fecha_resolucion/);
  assert.match(context, /<= \$3::date/);
  assert.doesNotMatch(context, /CURRENT_DATE/);
  assert.match(migration, /UNIQUE \(idempotency_key\)/);
  assert.match(migration, /evento_id BIGINT NOT NULL/);
  assert.match(migration, /periodo_id BIGINT NULL/);
});

test('la política temporal distingue periodo abierto, cerrado y sin intersección', () => {
  assert.equal(classifyIntegracionImpact({ fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30', estado: 'ABIERTO' }, '2026-09-15'), 'REQUIERE_SINCRONIZACION');
  assert.equal(classifyIntegracionImpact({ fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31', estado: 'CERRADO' }, '2026-08-15'), 'REQUIERE_AJUSTE_AUTORIZADO');
  assert.equal(classifyIntegracionImpact({ fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31', estado: 'CERRADO' }, '2026-09-01'), 'SIN_IMPACTO');
});

test('orden de agregado es estable y el procesador usa bloqueo recuperable', () => {
  assert.equal(aggregateEventOrderKey('vinculacion', 42), 'vinculacion:42');
  const service = read('src/modules/integracion/integracion.service.ts');
  assert.match(service, /FOR UPDATE SKIP LOCKED/);
  assert.match(service, /locked_at < NOW\(\)/);
  assert.match(service, /prior\.id < e\.id/);
  assert.match(service, /attempts < \$2/);
  assert.match(service, /INTERVAL '1 minute'/);
});

test('publicación de Personal ocurre antes de COMMIT y no expone datos sensibles', () => {
  const personal = read('src/modules/vinculaciones/vinculaciones.service.ts');
  const assignment = read('src/modules/vinculaciones/vinculaciones.personal.service.ts');
  assert.ok(personal.indexOf('publicarEventoOutbox') < personal.indexOf("client.query('COMMIT')"));
  assert.ok(assignment.indexOf('publicarEventoOutbox') < assignment.indexOf("client.query('COMMIT')"));
  assert.doesNotMatch(read('src/modules/integracion/integracion.service.ts'), /numero_documento|primer_nombre|correo|telefono/);
});

test('modo observación no contiene escrituras sobre población, asistencia, novedades, turnos o liquidaciones', () => {
  const service = read('src/modules/integracion/integracion.service.ts');
  assert.doesNotMatch(service, /UPDATE\s+nomina_empleados/i);
  assert.doesNotMatch(service, /INSERT\s+INTO\s+nomina_(asistencia|novedades|novedad_turnos|liquidaciones)/i);
  assert.match(service, /integracion_evento_impactos/);
});
