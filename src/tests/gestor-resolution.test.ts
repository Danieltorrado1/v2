import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  buildCanonicalAnyGestorSql,
  buildCanonicalGestorFilterSql,
  buildCanonicalGestorJoinSql,
  buildCanonicalGestorCandidatesSql
} from '../modules/vinculaciones/gestor-resolution';

const input = {
  companySql: 'c.empresa_id',
  contractSql: 'ff.contrato_id',
  municipalitySql: 'ff.municipio_id',
  dateSql: 'fv.vigente_desde',
  vinculacionSql: 'v.id'
};

test('la resolución canónica prioriza trabajador y luego territorio con desempate determinista', () => {
  const sql = buildCanonicalGestorCandidatesSql(input);
  assert.match(sql, /gestor_personal_asignaciones/);
  assert.match(sql, /gestor_municipio_asignaciones/);
  assert.match(sql, /0 AS prioridad/);
  assert.match(sql, /1 AS prioridad/);
  assert.match(buildCanonicalGestorJoinSql(input), /ORDER BY candidate\.prioridad ASC, candidate\.vigencia_desde DESC, candidate\.id DESC/);
  assert.match(buildCanonicalGestorJoinSql(input), /LIMIT 1/);
});

test('la asignación válida queda ligada a usuario activo, rol, empresa y contrato', () => {
  const sql = buildCanonicalGestorCandidatesSql(input);
  assert.match(sql, /usuario_roles/);
  assert.match(sql, /nombre_rol = 'GESTOR'/);
  assert.match(sql, /usuario_empresas/);
  assert.match(sql, /usuario_contratos/);
  assert.match(sql, /COALESCE\(u\.activo, TRUE\) = TRUE/);
  assert.match(sql, /COALESCE\(gma\.activo, TRUE\) = TRUE/);
  assert.match(sql, /gma\.vigencia_desde <= fv\.vigente_desde/);
  assert.match(sql, /COALESCE\(gma\.alcance_personal, 'PERSONAL_SELECCIONADO'\) = 'TODO_MUNICIPIO'/);
});

test('fila, filtro y sin gestor consumen la misma resolución', () => {
  const operation = readFileSync('src/modules/operacion/operacion.instituciones.service.ts', 'utf8');
  const personal = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
  assert.match(operation, /buildCanonicalGestorJoinSql/);
  assert.match(personal, /buildCanonicalGestorJoinSql/);
  assert.match(personal, /buildCanonicalGestorFilterSql/);
  assert.match(personal, /buildCanonicalAnyGestorSql/);
  assert.match(buildCanonicalGestorFilterSql(input, '$7'), /SELECT candidate\.usuario_id/);
  assert.match(buildCanonicalAnyGestorSql(input), /EXISTS/);
});
