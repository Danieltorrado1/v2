import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  assertNominaFechaDentroDeVigencia,
  assertNominaRangoDentroDePeriodo,
  assertNominaRangoDentroDeVinculacion,
} from '../modules/nomina/nomina.operativa';

const periodo = { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' };
const vinculacion = { fecha_inicio: '2026-08-05', fecha_fin: '2026-08-20' };
const serviceSource = readFileSync('src/modules/nomina/nomina.service.ts', 'utf8');

test('vigencia backend permite el ultimo dia de vinculacion', () => {
  assert.doesNotThrow(() => {
    assertNominaFechaDentroDeVigencia('2026-08-20', periodo, vinculacion);
  });
});

test('vigencia backend rechaza asistencia el dia posterior', () => {
  assert.throws(
    () => assertNominaFechaDentroDeVigencia('2026-08-21', periodo, vinculacion),
    /NOMINA_ASISTENCIA_FUERA_VIGENCIA|labor validity|selected period/
  );
});

test('vigencia backend rechaza fecha anterior a fecha_inicio', () => {
  assert.throws(
    () => assertNominaFechaDentroDeVigencia('2026-08-04', periodo, vinculacion),
    /NOMINA_ASISTENCIA_FUERA_VIGENCIA|labor validity|selected period/
  );
});

test('vigencia backend rechaza rango que cruza fecha_fin', () => {
  assert.throws(
    () => assertNominaRangoDentroDeVinculacion('2026-08-19', '2026-08-21', vinculacion),
    /NOMINA_NOVEDAD_FUERA_VIGENCIA|labor validity/
  );
});

test('vigencia backend rechaza novedad el dia posterior', () => {
  assert.throws(
    () => assertNominaRangoDentroDeVinculacion('2026-08-21', '2026-08-21', vinculacion),
    /NOMINA_NOVEDAD_FUERA_VIGENCIA|labor validity/
  );
});

test('vigencia backend rechaza rango fuera del periodo', () => {
  assert.throws(
    () => assertNominaRangoDentroDePeriodo('2026-07-31', '2026-08-02', periodo),
    /NOMINA_NOVEDAD_FUERA_PERIODO|selected period/
  );
});

test('mutaciones de nomina aplican scope de cobertura y helpers de vigencia en backend', () => {
  assert.match(serviceSource, /assertNominaEmpleadoCoberturaScope\(input\.nomina_empleado_id, tenant, client\)/);
  assert.match(serviceSource, /assertNominaEmpleadoCoberturaScope\(current\.nomina_empleado_id, tenant, client\)/);
  assert.match(serviceSource, /assertNominaEmpleadoCoberturaScope\(empleado\.nomina_empleado_id, tenant, client\)/);
  assert.match(serviceSource, /assertNominaFechaDentroDeVigencia\(fecha, periodo, v\)/);
  assert.match(serviceSource, /assertNominaRangoDentroDePeriodo\(fechaInicio, fechaFin, periodo, 'NOMINA_ASISTENCIA_FUERA_VIGENCIA'\)/);
  assert.match(serviceSource, /assertNominaRangoDentroDeVinculacion\(fechaInicio, fechaFin, v, 'NOMINA_ASISTENCIA_FUERA_VIGENCIA'\)/);
});


