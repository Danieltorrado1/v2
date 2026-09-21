import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildCanonicalGestorCandidatesSql, buildPartialGestorsJoinSql } from '../modules/vinculaciones/gestor-resolution';

const service = readFileSync('src/modules/vinculaciones/vinculaciones.service.ts', 'utf8');
const schema = readFileSync('src/modules/vinculaciones/vinculaciones.schemas.ts', 'utf8');
const ui = readFileSync('FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/UsuariosTab.tsx', 'utf8');
const operation = readFileSync('src/modules/operacion/operacion.instituciones.service.ts', 'utf8');

const input = {
  companySql: 'v.empresa_id',
  contractSql: 'v.contrato_id',
  municipalitySql: 'caa.municipio_actual_id',
  dateSql: '$2::date',
  vinculacionSql: 'v.id'
};

test('PERSONAL_SELECCIONADO nunca cae al gestor territorial y TODO_MUNICIPIO sí aplica como fallback', () => {
  const sql = buildCanonicalGestorCandidatesSql(input);
  assert.match(sql, /gpa\.vinculacion_id = v\.id/);
  assert.match(sql, /COALESCE\(gma\.alcance_personal, 'PERSONAL_SELECCIONADO'\) = 'TODO_MUNICIPIO'/);
  assert.doesNotMatch(sql, /gma\.alcance_personal\s+IS\s+NULL/);
});

test('Operación conserva todos los gestores parciales y no usa LIMIT 1 para ellos', () => {
  const sql = buildPartialGestorsJoinSql(input);
  assert.match(sql, /gma\.alcance_personal = 'PERSONAL_SELECCIONADO'/);
  assert.match(sql, /jsonb_agg/);
  assert.doesNotMatch(sql, /LIMIT 1/);
  assert.match(operation, /partial_gestores/);
  assert.match(operation, /gestores_parciales/);
});

test('el formulario diferencia alcances y protege el cambio a municipio completo', () => {
  assert.match(schema, /alcance_personal: gestorMunicipioPersonalScopeSchema/);
  assert.match(service, /GESTOR_PERSONAL_SELECTION_REQUIRED/);
  assert.match(service, /GESTOR_SCOPE_CONFLICT/);
  assert.match(service, /Alcance cambiado a MUNICIPIO_COMPLETO/);
  assert.match(service, /Cerrada por alcance MUNICIPIO_COMPLETO/);
  assert.match(ui, /Todo el municipio/);
  assert.match(ui, /Personal seleccionado/);
  assert.match(ui, /Selecciona al menos una persona/);
  assert.match(ui, /cerrará las selecciones individuales vigentes/);
  assert.match(ui, /alcance_personal: 'TODO_MUNICIPIO'/);
  assert.match(ui, /alcance_personal: 'PERSONAL_SELECCIONADO'/);
});

test('reemplazar personal seleccionado solo retira personas del gestor editado', () => {
  assert.match(
    service,
    /item\.municipio\?\.id === input\.municipio_id\s*\n\s*&& item\.gestor\.id === input\.gestor_usuario_id/
  );
  assert.match(service, /const actualesIds = new Set\(/);
  assert.match(service, /const nuevosIds = new Set\(input\.vinculacion_ids\)/);
});

test('la vigencia y el contexto empresarial/contractual forman parte de la asignación válida', () => {
  const sql = buildCanonicalGestorCandidatesSql(input);
  assert.match(sql, /gpa\.vigencia_desde <= \$2::date/);
  assert.match(sql, /gma\.vigencia_hasta IS NULL OR gma\.vigencia_hasta >= \$2::date/);
  assert.match(sql, /ue_gestor\.empresa_id = v\.empresa_id/);
  assert.match(sql, /uc_gestor\.contrato_id = v\.contrato_id/);
});
