import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const source = readFileSync(
  resolve(process.cwd(), 'src/modules/operacion/operacion.instituciones.service.ts'),
  'utf8'
);
const fixture = JSON.parse(readFileSync(
  resolve(process.cwd(), 'src/tests/fixtures/operacion-instituciones-contrato24.sanitized.json'),
  'utf8'
)) as { empresa_id: number; contrato_id: number; rows: Array<Record<string, unknown>> };

test('contrato 24 usa el tenant de empresa 15 y no duplica el fixture sanitizado', () => {
  assert.equal(fixture.empresa_id, 15);
  assert.equal(fixture.contrato_id, 24);
  assert.equal(new Set(fixture.rows.map((row) => `${row.institucion_id}:${row.sede_id}:${row.modalidad_id}`)).size, fixture.rows.length);
  assert.match(source, /c\.empresa_id=ANY\(\$1::bigint\[\]\)/);
  assert.match(source, /ff\.contrato_id=\$\$\{contractP\}::bigint/);
});

test('vigencias históricas, futuras y filas incompletas son datos de lectura, no errores del listado', () => {
  assert.ok(fixture.rows.some((row) => row.asignacion === 'HISTORICA'));
  assert.ok(fixture.rows.some((row) => row.asignacion === 'FUTURA'));
  assert.ok(fixture.rows.some((row) => row.asignacion === 'INCOMPLETA_CATEGORIA_AMBIGUA'));
  assert.ok(fixture.rows.some((row) => row.modalidad_id === null));
  assert.match(source, /COALESCE\(fp\.modalidad_original,ff\.modalidad_final,mo\.nombre_modalidad\)/);
  assert.match(source, /FOCALIZACION_OPTIONS_SQL, \[contratoId\]/);
  assert.match(source, /fv\.carga_id=\$\$\{periodP\}::bigint/);
  assert.match(source, /\$\{source\} \$\{where\} AND gestor\.id IS NOT NULL/);
});

test('la consulta conserva paginación y no contiene escritura', () => {
  assert.match(source, /LIMIT \$\$\{pageParams\.length - 1\} OFFSET \$\$\{pageParams\.length\}/);
  assert.doesNotMatch(source.slice(source.indexOf('export async function listInstituciones'), source.indexOf('export async function updateInstitucionFocalizacion')), /\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/);
});
