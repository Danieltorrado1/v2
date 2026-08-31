import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calculateCoberturaPayroll } from '../modules/nomina/nomina.cobertura';

const migration = readFileSync(resolve('sql/phase-35-nomina-5b1-cobertura-externos.sql'), 'utf8');
const externalService = readFileSync(resolve('src/modules/nomina/cobertura.externos.service.ts'), 'utf8');
const nominaService = readFileSync(resolve('src/modules/nomina/nomina.service.ts'), 'utf8');
const routes = readFileSync(resolve('src/modules/nomina/nomina.routes.ts'), 'utf8');
const gestorSeed = readFileSync(resolve('src/scripts/seed-admin-2e-operational-permissions.ts'), 'utf8');
const flowNav = readFileSync(resolve('FrontendNuevo/src/pages/nomina/CoberturaFlowNav.tsx'), 'utf8');
const moduleRoute = readFileSync(resolve('FrontendNuevo/src/router/ModuleRoute.tsx'), 'utf8');
const turnosPage = readFileSync(resolve('FrontendNuevo/src/pages/nomina/TurnosPage.tsx'), 'utf8');
const nominaPage = readFileSync(resolve('FrontendNuevo/src/pages/nomina/NominaPage.tsx'), 'utf8');
const supportService = readFileSync(resolve('src/modules/nomina/cobertura.novedad-documentos.ts'), 'utf8');

const category = {
  auxilio_transporte: 0,
  categoria_id: 'cat-1',
  codigo_categoria: 'CAA',
  nombre_categoria: 'CAA',
  recargo_mensual: 0,
  salario_base: 900000,
};

test('5B.1 crea identidad externa deduplicada por empresa y documento', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS (?:public\.)?cobertura_externos/);
  assert.match(migration, /ux_cobertura_externos_empresa_documento/);
  assert.match(externalService, /ON CONFLICT \(empresa_id,tipo_documento,numero_documento\)/);
  assert.match(externalService, /cobertura_externos/);
});

test('5B.1 relaciona turnos nuevos con externo_id y mantiene legacy', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS externo_id BIGINT REFERENCES (?:public\.)?cobertura_externos/);
  assert.match(nominaService, /INSERT INTO nomina_novedad_turnos/);
  assert.match(nominaService, /externoId/);
  assert.match(externalService, /nm\.externo_id/);
});

test('5B.1 separa documentos externos y cuenta de cobro de OPS', () => {
  assert.match(migration, /cobertura_externo_documentos/);
  assert.match(migration, /CEDULA_EXTERNO_COBERTURA/);
  assert.match(migration, /CERTIFICACION_BANCARIA_EXTERNO_COBERTURA/);
  assert.match(migration, /CUENTA_COBRO_FIRMADA_EXTERNO_COBERTURA/);
  assert.match(migration, /cobertura_cuentas_cobro_externas/);
  assert.match(externalService, /cobertura_cuentas_cobro_externas/);
  assert.doesNotMatch(externalService, /nomina_cuentas_cobro_ops/);
});

test('5B.1 cuenta de cobro solo consolida movimientos activos del periodo y contrato', () => {
  assert.match(externalService, /nm\.periodo_id=\$2/);
  assert.match(externalService, /np\.contrato_id=\$3/);
  assert.match(externalService, /np\.contrato_empresa_id=\$4/);
  assert.match(externalService, /nm\.activo=TRUE/);
  assert.match(externalService, /COALESCE\(nm\.estado,'PENDIENTE'\) <> 'RECHAZADO'/);
  assert.match(externalService, /COBERTURA_CUENTA_REGENERACION_REQUIERE_VERSION/);
});

test('5B.1 soporte de novedad tiene relacion inequivoca y no bloquea captura sin documento', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS (?:public\.)?nomina_novedad_documentos/);
  assert.match(migration, /ux_nomina_novedad_documento_activo/);
  assert.match(nominaService, /INSERT INTO nomina_novedad_documentos/);
  assert.match(nominaService, /if \(input\.documento_persona_id\)/);
});

test('5B.1 turno interno conserva formula unica y no descuenta pension si no aplica', () => {
  const result = calculateCoberturaPayroll({
    aporta_pension: false,
    dias_efectos: [],
    empleo: { fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' },
    tramos: [{ categoria: category, fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' }],
    adiciones_internas: [{
      aporta_pension: false,
      categoria: category,
      fecha_inicio: '2026-08-10',
      fecha_fin: '2026-08-10',
      origen: 'NOVEDAD_REEMPLAZO_INTERNO',
    }],
  });
  const addition = result.adiciones_internas[0];
  assert.ok(addition);
  assert.equal(addition.pension_turno, 0);
  assert.equal(addition.neto_turno, addition.devengado_turno - addition.salud_turno);
  assert.equal(result.total_deducciones, result.salud_ordinaria + result.salud_adiciones_internas);
  assert.equal(result.neto_nomina, result.total_devengado - result.total_deducciones);
});

test('5B.1 endpoints de cobertura externa permanecen protegidos por permisos de movimientos', () => {
  assert.match(routes, /cobertura\/externos.*requirePermissions\('nomina\.movimientos\.read'\)/);
  assert.match(routes, /cobertura\/cuentas-cobro\/generar.*requirePermissions\('nomina\.movimientos\.create'\)/);
  assert.match(routes, /nominaRoutes\.use\(requireModule\('NOMINA'\)\)/);
});

test('5C.1 distingue captura de control: GESTOR no cierra ni reabre', () => {
  assert.match(gestorSeed, /GESTOR_FORBIDDEN_PERMISSIONS/);
  assert.match(gestorSeed, /nomina\.read/);
  assert.match(gestorSeed, /nomina\.periodos\.close/);
  assert.match(gestorSeed, /nomina\.periodos\.reopen/);
  assert.match(flowNav, /gestorOperationalOnly/);
  assert.match(moduleRoute, /denyRoles/);
  assert.match(routes, /requireRoles\('TALENTO_HUMANO', 'ADMINISTRADOR'\).*nomina\.periodos\.close/);
  assert.match(routes, /requireRoles\('TALENTO_HUMANO', 'ADMINISTRADOR'\).*nomina\.periodos\.reopen/);
  assert.match(turnosPage, /TurnoView/);
  assert.match(turnosPage, /Turnos internos/);
  assert.match(turnosPage, /TURNO_INTERNO \/ TURNO_EXTERNO/);
  assert.match(turnosPage, /Trabajador reemplazado/);
  assert.match(nominaPage, /gestorOperationalOnly/);
});

test('5C.1 TH consulta dashboard y soportes con permisos específicos', () => {
  assert.match(gestorSeed, /nomina\.dashboard/);
  assert.match(gestorSeed, /nomina\.desprendibles/);
  assert.match(nominaPage, /isOperationalCoverageView \|\| !isSupportsTab/);
});

test('5C.1 filtro interno oculta consolidado externo y no cuenta checklist interno', () => {
  assert.match(turnosPage, /turnoView !== "internos"/);
  assert.match(turnosPage, /movimiento\.tipo_movimiento !== "TURNO_EXTERNO"/);
  assert.match(turnosPage, /relation\?\.tipo_turno === "EXTERNO" && relation\.documentos_completos/);
});

test('5C.1 turnos conserva filtro canonico y tabla compacta sin scroll horizontal', () => {
  const page = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/TurnosPage.tsx'), 'utf8');
  const styles = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/NominaPages.css'), 'utf8');
  assert.match(page, /turnoView === "todos"/);
  assert.match(page, /TURNO_INTERNO", "TURNO_EXTERNO/);
  assert.match(page, /np-turns-table-grid/);
  assert.match(styles, /\.np-turns-table-scroll\s*\{\s*overflow-x:hidden/);
});

test('5C.1 novedades elimina tabs locales y nomina contiene el scroll vertical', () => {
  const page = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/NominaPage.tsx'), 'utf8');
  const styles = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/NominaPage.css'), 'utf8');
  assert.match(page, /!isOperationalCoverageView \? <div className="payroll-tabs">/);
  assert.match(styles, /nomina-page--novedades[\s\S]*overflow: hidden/);
  assert.match(styles, /nomina-page--gestion \.payroll-period-detail > \.payroll-table-scroll[\s\S]*overflow-y: auto/);
});

test('5C.1 desprendibles usa permiso documental especifico', () => {
  const routes = readFileSync(resolve(process.cwd(), 'src/modules/nomina/nomina.routes.ts'), 'utf8');
  const page = readFileSync(resolve(process.cwd(), 'FrontendNuevo/src/pages/nomina/NominaPage.tsx'), 'utf8');
  assert.match(routes, /desprendibles\/:periodo_id\/generar'[\s\S]*nomina\.desprendibles\.generate/);
  assert.match(page, /permissions\.includes\("nomina\.desprendibles\.generate"\)/);
  assert.match(page, /payroll-person-summary/);
});

test('5C.1 separa DTO operativo y lectura economica en backend', () => {
  assert.match(routes, /empleados-operativos/);
  assert.match(routes, /nomina\.operativa\.read/);
  assert.match(routes, /rejectRoles\('GESTOR'\)/);
  assert.match(routes, /nomina\.economico\.read/);
  assert.match(nominaService, /listNominaEmpleadosOperativos/);
  assert.match(nominaService, /detalle_calculo: _detalleCalculo/);
  assert.match(nominaService, /salario_base: _salarioBase/);
});

test('5C.1 conserva trazabilidad canonica de turno interno', () => {
  assert.match(nominaService, /nnt\.nomina_novedad_id::text AS nomina_novedad_id/);
  assert.match(nominaService, /titular_ne\.id = nn\.nomina_empleado_id/);
  assert.match(nominaService, /titular_p\.numero_documento AS titular_documento/);
  assert.match(nominaService, /novedad_id: turnoRow\.nomina_novedad_id/);
  assert.match(turnosPage, /trabajador_reemplazado/);
  assert.match(turnosPage, /novedad_tipo_codigo/);
  assert.match(turnosPage, /origen_cobertura/);
});

test('5C.1 mantiene soporte y descargas documentales seguras', () => {
  assert.match(routes, /novedades\/:id\/soporte.*requireAnyPermissions\('nomina\.operativa\.read', 'nomina\.read'\)/);
  assert.match(routes, /novedades\/:id\/soporte.*requirePermissions\('nomina\.novedades\.update'\)/);
  assert.match(routes, /externos\/documentos\/:id\/download.*requirePermissions\('nomina\.movimientos\.read'\)/);
  assert.match(routes, /cuentas-cobro\/:id\/firmada\/download.*requirePermissions\('nomina\.movimientos\.read'\)/);
  assert.match(nominaPage, /Subir soporte/);
  assert.match(nominaPage, /Ver soporte/);
  assert.match(nominaPage, /Reemplazar soporte/);
  assert.match(turnosPage, /Ver c.dula/);
  assert.match(turnosPage, /Ver certificaci.n/);
  assert.match(turnosPage, /Ver firmada/);
});

test('5C.1 soporte de novedades refuerza scope territorial en backend', () => {
  assert.match(supportService, /assertNominaEmpleadoCoberturaScope/);
});
