import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import { calculateCoberturaPayroll } from '../modules/nomina/nomina.cobertura';

test('NOMINA-4B.11 conserva el contrato de reemplazo y el cálculo interno sin pensión', async () => {
  const root = process.cwd();
  const schema = await readFile(join(root, 'src/modules/nomina/nomina.schemas.ts'), 'utf8');
  const planilla = await readFile(join(root, 'FrontendNuevo/src/pages/nomina/PlanillaOperativaPage.tsx'), 'utf8');
  const service = await readFile(join(root, 'src/modules/nomina/nomina.service.ts'), 'utf8');

  assert.match(schema, /tipo_cobertura.*PERSONAL_VINCULADO/);
  assert.match(schema, /tipo_cobertura.*PERSONA_EXTERNA/);
  assert.match(planilla, /createNominaNovedadConTurno/);
  assert.match(planilla, /tipo: mapCoverageToTurno\(coverageType\)/);
  assert.match(service, /UPDATE nomina_novedad_turnos/);
  assert.match(service, /nomina_novedad_id = \$1::bigint/);

  const result = calculateCoberturaPayroll({
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-01' },
    tramos: [{
      fecha_inicio: '2026-08-01',
      fecha_fin: '2026-08-01',
      categoria: {
        categoria_id: '1',
        codigo_categoria: 'CAA',
        nombre_categoria: 'CAA',
        salario_base: 3000000,
        recargo_mensual: 100000,
        auxilio_transporte: 0,
      },
    }],
    dias_efectos: [],
    aporta_pension: false,
    adiciones_internas: [{
      fecha_inicio: '2026-08-01',
      fecha_fin: '2026-08-01',
      categoria: {
        categoria_id: '1',
        codigo_categoria: 'CAA',
        nombre_categoria: 'CAA',
        salario_base: 3000000,
        recargo_mensual: 100000,
        auxilio_transporte: 0,
      },
      aporta_pension: false,
    }],
  });

  const addition = result.adiciones_internas[0];
  assert.ok(addition);
  assert.equal(addition.salario_turno, 100000);
  assert.equal(addition.recargo_turno, 3333);
  assert.equal(addition.salud_turno, 4000);
  assert.equal(addition.pension_turno, 0);
  assert.equal(addition.neto_turno, 99333);
});
