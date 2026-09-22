import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInstitutionManagersQuery, buildInstitutionPeriodsQuery, formatFocalizacionName } from '../modules/operacion/operacion.instituciones.query';

test('instituciones: la consulta de períodos no envía parámetros de filtros extra', () => {
  const query = buildInstitutionPeriodsQuery(
    'FROM focalizacion_vigencias fv JOIN focalizacion_final ff ON ff.contrato_id=fv.contrato_id JOIN contratos c ON c.id=ff.contrato_id',
    'c.empresa_id=ANY($1::bigint[])',
    2,
    [[15], 24, null, null, null, null, null, null, null, null],
  );

  assert.match(query.text, /focalizacion_id/);
  assert.match(query.text, /DISTINCT ON \(fv\.vigente_desde\)/);
  assert.match(query.text, /ff\.contrato_id=\$2::bigint/);
  assert.deepEqual(query.params, [[15], 24]);
  assert.equal(query.params.length, 2);
});

test('instituciones: la consulta de períodos global usa únicamente contrato', () => {
  const query = buildInstitutionPeriodsQuery(
    'FROM focalizacion_vigencias fv JOIN focalizacion_final ff ON ff.contrato_id=fv.contrato_id JOIN contratos c ON c.id=ff.contrato_id',
    'TRUE',
    1,
    [24, null, null, null, null],
  );

  assert.match(query.text, /ff\.contrato_id=\$1::bigint/);
  assert.deepEqual(query.params, [24]);
});

test('instituciones: la consulta de gestores agrega filtros con AND y no duplica WHERE', () => {
  const query = buildInstitutionManagersQuery(
    'FROM focalizacion_vigencias fv JOIN focalizacion_final ff ON ff.contrato_id=fv.contrato_id',
    'WHERE c.empresa_id=ANY($1::bigint[]) AND ff.contrato_id=$2::bigint',
    [[15], 24, null, null],
  );

  assert.equal((query.text.match(/\bWHERE\b/g) ?? []).length, 1);
  assert.match(query.text, /ff\.contrato_id=\$2::bigint AND gestor\.id IS NOT NULL/);
  assert.deepEqual(query.params, [[15], 24, null, null]);
});

test('instituciones: la focalización usa el catálogo operativo y etiqueta los meses en español', () => {
  assert.equal(formatFocalizacionName(2026, 8), 'Agosto 2026');
  assert.notEqual(formatFocalizacionName(2026, 8), 'August 2026');
  assert.match(buildInstitutionPeriodsQuery('FROM focalizacion_vigencias fv', 'TRUE', 1, [24]).text, /focalizacion_id/);
  assert.doesNotMatch(buildInstitutionPeriodsQuery('FROM focalizacion_vigencias fv', 'TRUE', 1, [24]).text, /nomina_periodos/);
});
