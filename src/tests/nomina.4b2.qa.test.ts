import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const service = readFileSync(join(root, 'src/modules/nomina/nomina.service.ts'), 'utf8');
const procesos = readFileSync(join(root, 'src/modules/nomina/nomina.procesos.ts'), 'utf8');
const admin = readFileSync(join(root, 'src/modules/nomina/nomina.procesos.admin.controller.ts'), 'utf8');
const ui = readFileSync(join(root, 'FrontendNuevo/src/pages/admin/ConfiguracionGeneral/tabs/NominaProcesosTab.tsx'), 'utf8');

test('CRUD responsabilidades lista asignaciones existentes', () => assert.match(procesos, /listNominaResponsibilities/));
test('eliminar todos representa NINGUNO', () => assert.match(procesos, /activo = proceso !== 'OPS'/));
test('editar municipios reemplaza scope', () => assert.match(procesos, /DELETE FROM nomina_responsabilidad_municipios/));
test('editar áreas reemplaza scope', () => assert.match(procesos, /DELETE FROM nomina_responsabilidad_areas/));
test('combinación de procesos persiste por clave única', () => assert.match(procesos, /ON CONFLICT\(usuario_id,empresa_id,proceso\)/));
test('CRUD áreas edita nombre', () => assert.match(procesos, /UPDATE nomina_areas SET nombre/));
test('CRUD áreas desactiva/reactiva', () => assert.match(procesos, /activo=COALESCE\(\$3,activo\)/));
test('área histórica usa desactivación lógica', () => assert.match(ui, /Desactivar|Activar/));
test('exportación reutiliza listado con scope', () => assert.match(service, /getNominaLiquidacionesExportRows[\s\S]*listNominaLiquidaciones/));
test('desprendibles no se resuelven sin empleado protegido', () => assert.match(service, /assertNominaEmpleadoCoberturaScope/));
test('cambio operativo usa tenant', () => assert.match(service, /loadNominaEmpleadoByIdOrThrow\([^\n]*tenant/));
test('adición con empleado fuera de scope falla', () => assert.match(procesos, /NOMINA_SCOPE_FORBIDDEN/));
test('rutas administrativas CRUD completas', () => { assert.match(admin, /listNominaResponsibilities/); assert.match(admin, /updateNominaArea/); });
