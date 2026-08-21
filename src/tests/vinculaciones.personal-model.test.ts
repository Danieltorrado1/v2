import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const personalDomainPromise = import(
  pathToFileURL(
    path.join(root, 'src/modules/vinculaciones/vinculaciones.personal.domain.ts')
  ).href
);

test('manipuladora asignada cuenta cobertura aunque no dependa de licitacion', async () => {
  const { looksLikeManipuladoraCargo, buildCoverageDelta } = await personalDomainPromise;
  assert.equal(looksLikeManipuladoraCargo('MANIPULADORA DE ALIMENTOS'), true);
  assert.deepEqual(buildCoverageDelta(1, 1), {
    requeridas: 1,
    asignadas: 1,
    diferencia: 0,
    estado: 'COMPLETA'
  });
});

test('manipuladora presentada no se suma dos veces porque cobertura y licitacion se calculan por canales distintos', async () => {
  const { buildCoverageDelta, buildLicitacionQuotaDelta } = await personalDomainPromise;
  assert.deepEqual(buildCoverageDelta(662, 662), {
    requeridas: 662,
    asignadas: 662,
    diferencia: 0,
    estado: 'COMPLETA'
  });
  assert.deepEqual(buildLicitacionQuotaDelta(100, 100), {
    requeridas: 100,
    acreditadas: 100,
    diferencia: 0,
    estado: 'CUMPLE'
  });
});

test('cambio de sede o ubicacion conserva historico porque los rangos se modelan por vigencia y no por overwrite', async () => {
  const { rangesOverlap } = await personalDomainPromise;
  assert.equal(
    rangesOverlap(
      { desde: '2026-08-01', hasta: '2026-08-15' },
      { desde: '2026-08-16', hasta: null }
    ),
    false
  );
});

test('cierre y reemplazo de licitacion permiten deficit y luego cumplimiento exacto', async () => {
  const { buildLicitacionQuotaDelta } = await personalDomainPromise;
  assert.deepEqual(buildLicitacionQuotaDelta(100, 99), {
    requeridas: 100,
    acreditadas: 99,
    diferencia: -1,
    estado: 'DEFICIT'
  });
  assert.deepEqual(buildLicitacionQuotaDelta(100, 100), {
    requeridas: 100,
    acreditadas: 100,
    diferencia: 0,
    estado: 'CUMPLE'
  });
});

test('persona puede seguir operando sin cumplir licitacion porque el estado puede quedar pendiente', async () => {
  const { deriveCumpleRequisitosState } = await personalDomainPromise;
  assert.equal(
    deriveCumpleRequisitosState({
      checklistCumplimientoPorcentaje: 60,
      checklistTieneConfiguracion: true,
      cumpleRequisitosExplicit: null
    }),
    'PENDIENTE'
  );
});

test('cargo no manipuladora usa asignacion laboral y no sede-modalidad de cobertura', async () => {
  const { looksLikeManipuladoraCargo } = await personalDomainPromise;
  assert.equal(looksLikeManipuladoraCargo('COORDINADOR DE ZONA'), false);
});

test('vigencias abiertas de obra o labor son validas', async () => {
  const { validateVigenciaRange } = await personalDomainPromise;
  assert.doesNotThrow(() =>
    validateVigenciaRange({
      desde: '2026-08-01',
      hasta: null
    })
  );
});

test('vigencias invertidas se rechazan y los solapes se detectan', async () => {
  const { rangesOverlap, validateVigenciaRange } = await personalDomainPromise;
  assert.throws(() =>
    validateVigenciaRange({
      desde: '2026-08-31',
      hasta: '2026-08-01'
    })
  );

  assert.equal(
    rangesOverlap(
      { desde: '2026-08-01', hasta: '2026-08-15' },
      { desde: '2026-08-10', hasta: '2026-08-20' }
    ),
    true
  );
});

test('servicio protege contrato ajeno, solapes y separacion manip vs ubicacion laboral', () => {
  const source = readFileSync(
    path.join(root, 'src/modules/vinculaciones/vinculaciones.personal.service.ts'),
    'utf8'
  );

  assert.match(source, /ensureUbicacionBelongsContrato/);
  assert.match(source, /ensureNoLaborOverlap/);
  assert.match(source, /ensureNoPresentacionOverlap/);
  assert.match(source, /MANIPULADORA_REQUIERE_ASIGNACION_OPERATIVA/);
  assert.match(source, /buildContextualVinculacionChecklist/);
});

test('migracion agrega catalogos y tablas historicas de personal operativo y licitacion', () => {
  const sql = readFileSync(
    path.join(root, 'sql/phase-23-1-personal-operativo-licitacion.sql'),
    'utf8'
  );

  assert.match(sql, /CREATE TABLE IF NOT EXISTS contrato_ubicaciones_laborales/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS personal_asignaciones_laborales/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS contrato_perfiles_licitacion/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS personal_presentaciones_licitacion/);
  assert.match(sql, /codigo_perfil TEXT NOT NULL/);
  assert.match(sql, /uq_contrato_perfiles_licitacion_codigo_vigencia/);
});

test('frontend diferencia manipuladoras y otros cargos en listado y expediente', () => {
  const drawerSource = readFileSync(
    path.join(root, 'FrontendNuevo/src/pages/personal/PersonalMasterDrawer.tsx'),
    'utf8'
  );
  const listSource = readFileSync(
    path.join(root, 'FrontendNuevo/src/pages/personal/ContractPersonalPage.tsx'),
    'utf8'
  );

  assert.match(drawerSource, /Asignación operativa/);
  assert.match(drawerSource, /Asignación laboral/);
  assert.match(drawerSource, /Presentada en licitación/);
  assert.match(listSource, /Asignación actual/);
  assert.match(listSource, /Licitación/);
});
